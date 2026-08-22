// Feeds the H-Score engine (lib/hscore.ts) from the household's own graph.
//
// The engine is pure and runs anywhere; this module is the PocketBase-side
// adapter that turns nodes/edges/transactions into ScoreInputs over the rolling
// 90-day window, with lumpy items amortised and the confidence gate assessed.
//
// Kept separate from hscore.ts on purpose: the spec has the score computing
// client-side, and a pure engine with no database import is what makes that a
// configuration choice rather than a rewrite.

import { pbList, pbFirst, pbCreate, pbUpdate, pbStr } from "./pocketbase";
import { computeAllocations } from "./projection";
import { privateBucketIds, PRIVATE_TIER } from "./privacy";
import {
  computeHScore,
  assessConfidence,
  applyHysteresis,
  monthlyEquivalent,
  describeMovement,
  savingsGapToNextBand,
  WINDOW_DAYS,
  type HScore,
  type ScoreInputs,
  type BandState,
  type AmortisableTxn,
  type ScoreMovement,
} from "./hscore";

const DAY_MS = 86_400_000;
const MUST_PAID_TIER = 1;
const SAVINGS_TIER = 2;

interface PBNode {
  id: string;
  kind: string;
  label: string;
  props: Record<string, unknown> | null;
}
interface PBEdge {
  id: string;
  src_node: string;
  dst_node: string;
  rel: string;
  amount: number;
  percentage: number;
  valid_to: string;
}
interface PBTxn {
  id: string;
  amount: number;
  occurred_at: string;
  direction?: string;
  voided?: boolean;
  wallet_node: string;
  member?: string;
  raw?: { recurrence?: "annual" | "monthly" } | null;
}

function pbTime(d: Date): string {
  return d.toISOString().replace("T", " ");
}

/** Month index (0 = current month, 1 = last month …) relative to asOf. */
function monthsAgo(d: Date, asOf: Date): number {
  return (asOf.getFullYear() - d.getFullYear()) * 12 + (asOf.getMonth() - d.getMonth());
}

export interface HScoreResult extends HScore {
  /**
   * Records in the window that no criterion can see, because they have no
   * bucket. Deliberately a COUNT on the result rather than a field on
   * ScoreInputs: nothing scores it, so putting it in the inputs would invite a
   * future criterion to start reading it and change the score by accident.
   *
   * It exists because the brief is right that uncategorised records must not
   * silently vanish — a household that logged forty spends and saw no movement
   * deserves to know the app could not see them.
   */
  unscoredCount: number;
  /** RM/month more into savings that would reach the next band, when that's the lever. */
  savingsGap: number | null;
  /** Deterministic "what moved your score" — never LLM-written. */
  movement: ScoreMovement | null;
  inputs: ScoreInputs;
}

/**
 * Compute the household's H-Score. `persist` writes the band state (for
 * hysteresis) and a daily score snapshot (so "what moved" has a yesterday to
 * compare against); pass false for read-only callers like the demo.
 */
export async function getHScore(
  tenantId: string,
  opts: { asOf?: Date; persist?: boolean } = {},
): Promise<HScoreResult> {
  const asOf = opts.asOf ?? new Date();
  const from = new Date(asOf.getTime() - WINDOW_DAYS * DAY_MS);

  const [nodes, edges, txns] = await Promise.all([
    pbList<PBNode>("nodes", { filter: `tenant = ${pbStr(tenantId)}` }),
    pbList<PBEdge>("edges", { filter: `tenant = ${pbStr(tenantId)}` }),
    pbList<PBTxn>("transactions", {
      filter: `tenant = ${pbStr(tenantId)} && occurred_at >= ${pbStr(pbTime(from))}`,
      perPage: 1000,
    }),
  ]);

  const spend = txns.filter((t) => !t.voided && t.direction !== "in");
  // No bucket ⇒ no tier ⇒ invisible to every criterion. Counted, never scored.
  const unscoredCount = spend.filter((t) => !t.wallet_node).length;

  // ── income ────────────────────────────────────────────────────────────────
  // Gross is what the household declared. Net is gross minus statutory
  // deductions when they recorded them — we never invent a deduction they
  // didn't tell us about, because a guessed net inflates every ratio below it.
  const incomeNodes = nodes.filter((n) => n.kind === "income_source");
  const grossIncomeMonthly = incomeNodes.reduce((s, n) => s + (Number(n.props?.monthly_amount) || 0), 0);
  const declaredNet = incomeNodes.reduce(
    (s, n) => s + (Number(n.props?.net_monthly_amount) || Number(n.props?.monthly_amount) || 0),
    0,
  );
  const netIncomeMonthly = declaredNet || grossIncomeMonthly;

  // ── bucket tiers ──────────────────────────────────────────────────────────
  const tierOf = new Map<string, number>();
  for (const n of nodes) {
    if (n.kind === "bucket") tierOf.set(n.id, Number(n.props?.bucket) || PRIVATE_TIER);
  }
  const bucketsOfTier = (tier: number) =>
    [...tierOf.entries()].filter(([, t]) => t === tier).map(([id]) => id);

  const toAmortisable = (rows: PBTxn[]): AmortisableTxn[] =>
    rows.map((t) => ({
      amount: Number(t.amount),
      occurredAt: t.occurred_at,
      recurrence: t.raw?.recurrence ?? null,
    }));

  const inTier = (tier: number) => {
    const ids = new Set(bucketsOfTier(tier));
    return spend.filter((t) => t.wallet_node && ids.has(t.wallet_node));
  };

  // Must-paid: what the household actually spends on non-negotiables, amortised
  // so one annual road-tax payment doesn't read as a catastrophic month.
  const mustPaidMonthly = monthlyEquivalent(toAmortisable(inTier(MUST_PAID_TIER)), asOf);

  // ── savings ───────────────────────────────────────────────────────────────
  // What the allocation edges route into tier 2, less anything spent back out of
  // it. Money that was moved and then withdrawn was never actually saved.
  const allocated = computeAllocations(nodes, edges);
  const savingsAllocated = bucketsOfTier(SAVINGS_TIER).reduce((s, id) => s + (allocated.get(id) ?? 0), 0);
  const savingsWithdrawn = monthlyEquivalent(toAmortisable(inTier(SAVINGS_TIER)), asOf);
  const savingsMonthly = Math.max(0, savingsAllocated - savingsWithdrawn);

  // ── debt service ──────────────────────────────────────────────────────────
  // Obligation nodes (loans) carry their monthly repayment. A stated commitment,
  // not an inference: a car loan the household hasn't told us about cannot be
  // guessed out of a bank-less ledger, and pretending otherwise would be worse
  // than scoring it as zero and saying so via the confidence gate.
  const debtRepaymentsMonthly = nodes
    .filter((n) => n.kind === "obligation")
    .reduce((s, n) => s + (Number(n.props?.monthly_repayment) || 0), 0);

  // ── liquid savings ────────────────────────────────────────────────────────
  // Goal balances plus assets explicitly flagged liquid. Property and EPF before
  // 55 must never count toward an emergency buffer you can actually reach.
  const liquidSavings =
    nodes.filter((n) => n.kind === "goal").reduce((s, n) => s + (Number(n.props?.current) || 0), 0) +
    nodes
      .filter((n) => n.kind === "asset" && n.props?.liquid === true)
      .reduce((s, n) => s + (Number(n.props?.value) || 0), 0);

  // ── privacy discipline ────────────────────────────────────────────────────
  // Measured against the user's OWN cap over the trailing 3 months. This is the
  // only component that touches tier 3, and it never looks at a single vendor —
  // only whether the household's own boundary held.
  const privateIds = privateBucketIds(nodes);
  const privacyCapMonthly = nodes
    .filter((n) => n.kind === "bucket" && privateIds.has(n.id))
    .reduce((s, n) => s + (Number(n.props?.monthly_cap) || allocated.get(n.id) || 0), 0);

  const privacyTrailing3 = [0, 0, 0];
  for (const t of spend) {
    if (!t.wallet_node || !privateIds.has(t.wallet_node)) continue;
    const d = new Date(t.occurred_at.replace(" ", "T"));
    const idx = monthsAgo(d, asOf);
    if (idx >= 0 && idx < 3) privacyTrailing3[idx] += Number(t.amount);
  }

  const inputs: ScoreInputs = {
    netIncomeMonthly,
    grossIncomeMonthly,
    savingsMonthly,
    mustPaidMonthly,
    debtRepaymentsMonthly,
    liquidSavings,
    privacyCapMonthly,
    privacyTrailing3,
  };

  // ── confidence gate ───────────────────────────────────────────────────────
  const since30 = asOf.getTime() - 30 * DAY_MS;
  const txns30d = spend.filter((t) => {
    const ts = new Date(t.occurred_at.replace(" ", "T")).getTime();
    return Number.isFinite(ts) && ts >= since30;
  }).length;

  const bucketsWithEntries = new Set(
    spend.map((t) => tierOf.get(t.wallet_node)).filter((tier): tier is number => tier !== undefined),
  ).size;

  const confidence = assessConfidence({
    incomeDeclared: grossIncomeMonthly > 0,
    txns30d,
    bucketsWithEntries,
    bucketsTotal: new Set(tierOf.values()).size,
  });

  const scored = computeHScore(inputs, confidence);

  // ── hysteresis + movement ─────────────────────────────────────────────────
  const prior = await loadBandState(tenantId);
  const nextState = applyHysteresis(scored.rawBand, prior, asOf);
  const previous = await loadPreviousSnapshot(tenantId, asOf);

  const result: HScoreResult = {
    ...scored,
    band: nextState.band,
    savingsGap: savingsGapToNextBand(inputs, scored.score),
    movement: describeMovement({ ...scored, band: nextState.band }, previous),
    inputs,
    unscoredCount,
  };

  if (opts.persist !== false) {
    await saveBandState(tenantId, nextState);
    await saveSnapshot(tenantId, result, asOf);
  }

  return result;
}

// ── Persistence ─────────────────────────────────────────────────────────────
// `hscore_state` holds the band + pending-band clock; `hscore_snapshots` holds
// one row per day. Failures here are swallowed: a score that can't remember
// yesterday is degraded, but a score that throws is a broken page.

interface StateRow {
  id: string;
  tenant: string;
  band: string;
  pending_band: string;
  pending_since: string;
}

async function loadBandState(tenantId: string): Promise<BandState | null> {
  try {
    const row = await pbFirst<StateRow>("hscore_state", `tenant = ${pbStr(tenantId)}`);
    if (!row) return null;
    return {
      band: row.band as BandState["band"],
      pendingBand: (row.pending_band || undefined) as BandState["pendingBand"],
      pendingSince: row.pending_since || undefined,
    };
  } catch {
    return null;
  }
}

async function saveBandState(tenantId: string, state: BandState): Promise<void> {
  try {
    const row = await pbFirst<StateRow>("hscore_state", `tenant = ${pbStr(tenantId)}`);
    const body = {
      tenant: tenantId,
      band: state.band,
      pending_band: state.pendingBand ?? "",
      pending_since: state.pendingSince ?? "",
    };
    if (row) await pbUpdate("hscore_state", row.id, body);
    else await pbCreate("hscore_state", body);
  } catch {
    /* hysteresis degrades to "no memory", never to a 500 */
  }
}

interface SnapshotRow {
  id: string;
  tenant: string;
  score: number;
  band: string;
  sub_scores: HScore["subScores"];
  created: string;
}

// Snapshots are stored as JSON keyed by ComponentKey, so renaming a component in
// code silently orphans every row written before the rename: describeMovement
// matches by key, finds no previous entry, and reports "what moved" against a
// component that appears to have sprung into existence. That reads to the user as
// a real change in their finances when nothing changed at all.
//
// `privacyDiscipline` became `personalCap` on 2026-08-22 (Task 8) because the old
// name described neither what it measures nor what the user does. Old rows are
// mapped on READ rather than rewritten in place: a snapshot is a record of what
// was shown on a given day, and editing history to match today's vocabulary is
// exactly what the audit ledger exists to prevent.
const LEGACY_COMPONENT_KEYS: Record<string, string> = {
  privacyDiscipline: "personalCap",
};

function migrateSubScoreKeys(rows: HScore["subScores"]): HScore["subScores"] {
  return rows.map((r) => {
    const renamed = LEGACY_COMPONENT_KEYS[r.key as string];
    return renamed ? { ...r, key: renamed as typeof r.key } : r;
  });
}

/** The most recent snapshot from a PREVIOUS day — today's would compare to itself. */
async function loadPreviousSnapshot(tenantId: string, asOf: Date): Promise<HScore | null> {
  try {
    const dayStart = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
    const rows = await pbList<SnapshotRow>("hscore_snapshots", {
      filter: `tenant = ${pbStr(tenantId)} && created < ${pbStr(pbTime(dayStart))}`,
      sort: "-created",
      perPage: 1,
    });
    const row = rows[0];
    if (!row) return null;
    return {
      score: Number(row.score),
      rawBand: row.band as HScore["rawBand"],
      band: row.band as HScore["band"],
      subScores: migrateSubScoreKeys(row.sub_scores ?? []),
      confidence: { ok: true, missing: [], txns30d: 0 },
    };
  } catch {
    return null;
  }
}

/** One snapshot per day — enough for "what moved", cheap to keep. */
async function saveSnapshot(tenantId: string, score: HScore, asOf: Date): Promise<void> {
  try {
    const dayStart = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
    const existing = await pbFirst<SnapshotRow>(
      "hscore_snapshots",
      `tenant = ${pbStr(tenantId)} && created >= ${pbStr(pbTime(dayStart))}`,
    );
    const body = {
      tenant: tenantId,
      score: score.score,
      band: score.band,
      sub_scores: score.subScores,
    };
    if (existing) await pbUpdate("hscore_snapshots", existing.id, body);
    else await pbCreate("hscore_snapshots", body);
  } catch {
    /* a missing snapshot only costs the "what moved" line */
  }
}
