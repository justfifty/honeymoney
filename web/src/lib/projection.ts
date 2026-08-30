// Read path: bucket projection + recent spend + the "Honey" insight.
// PocketBase edition — the recursive allocation walk that Postgres did in
// bucket_projection() (see supabase/migrations/) is implemented here in TS.
// Falls back to a deterministic rule-based insight when Gemini is unconfigured.

import { pbList, pbStr, pbListAll } from "./pocketbase";
import { inHouseholdTotals } from "./attribution";
import { isGeminiConfigured, activeAiProvider } from "./config";
import { honeyInsight } from "./gemini";
import { aiCloudDataAllowed, isLocalProvider } from "./aiGuard";
import { t, type Locale } from "./i18n";
import { dataLabel } from "./dataLabels";
import { redactPrivate, privateBucketIds, PRIVATE_LABEL } from "./privacy";
import { deriveKind, type RecordKind } from "./recordKind";
import type { BucketProjection } from "./types";

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

interface PBTransaction {
  id: string;
  amount: number;
  currency: string;
  occurred_at: string;
  source: string;
  direction?: string; // "in" = credit/money-in (not spend); anything else = "out"
  kind?: string; // inflow · outflow · transfer
  wallet_node: string;
  vendor_node: string;
  member?: string;
  expand?: { vendor_node?: { label: string } };
}

const ALLOC_RELS = new Set(["ALLOCATES_FIXED", "ALLOCATES_PCT", "FUNDS"]);
const MAX_DEPTH = 5;

function monthWindow(asOf: Date) {
  const start = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  const daysInMonth = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0).getDate();
  const elapsed = Math.max(1, asOf.getDate());
  return { start, daysInMonth, elapsed };
}

// Recursive allocation walk: income_source -> ALLOCATES_* edges -> buckets.
// Mirrors the SQL: fixed edges carry their own amount; percentage edges take
// a share of the flowing amount; depth-guarded against cycles.
export function computeAllocations(nodes: PBNode[], edges: PBEdge[]): Map<string, number> {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const active = edges.filter((e) => !e.valid_to && ALLOC_RELS.has(e.rel));
  const bySrc = new Map<string, PBEdge[]>();
  for (const e of active) {
    const list = bySrc.get(e.src_node) ?? [];
    list.push(e);
    bySrc.set(e.src_node, list);
  }

  const allocated = new Map<string, number>();
  const queue: Array<{ nodeId: string; flow: number; depth: number }> = [];

  for (const n of nodes) {
    if (n.kind !== "income_source") continue;
    const monthly = Number(n.props?.monthly_amount) || 0;
    for (const e of bySrc.get(n.id) ?? []) {
      const amt = e.amount || (monthly * (e.percentage || 0)) / 100;
      queue.push({ nodeId: e.dst_node, flow: amt, depth: 1 });
    }
  }

  while (queue.length > 0) {
    const { nodeId, flow, depth } = queue.shift()!;
    if (!nodeById.has(nodeId)) continue;
    allocated.set(nodeId, (allocated.get(nodeId) ?? 0) + flow);
    if (depth >= MAX_DEPTH) continue;
    for (const e of bySrc.get(nodeId) ?? []) {
      if (e.rel === "FUNDS") continue; // FUNDS only originates from income
      const amt = e.amount || (flow * (e.percentage || 0)) / 100;
      queue.push({ nodeId: e.dst_node, flow: amt, depth: depth + 1 });
    }
  }

  return allocated;
}

export async function getBucketProjection(
  tenantId: string,
  asOf = new Date(),
): Promise<BucketProjection[]> {
  const { start } = monthWindow(asOf);
  const startStr = start.toISOString().replace("T", " ");

  const [nodes, edges, txns] = await Promise.all([
    pbListAll<PBNode>("nodes", { filter: `tenant = ${pbStr(tenantId)}` }),
    pbListAll<PBEdge>("edges", { filter: `tenant = ${pbStr(tenantId)}` }),
    pbListAll<PBTransaction>("transactions", {
      filter: `tenant = ${pbStr(tenantId)} && occurred_at >= ${pbStr(startStr)} && ${inHouseholdTotals}`,
    }),
  ]);

  const allocated = computeAllocations(nodes, edges);

  const mtd = new Map<string, number>();
  for (const t of txns) {
    if (!t.wallet_node) continue;
    if (t.direction === "in") continue; // credits (refunds, cashback) aren't spend
    mtd.set(t.wallet_node, (mtd.get(t.wallet_node) ?? 0) + Number(t.amount));
  }

  return projectBuckets(nodes, allocated, mtd, asOf);
}

// Pure projection: given buckets (as nodes), their allocations, and month-to-date
// spend per bucket, produce the status-annotated projection. Factored out so the
// focus lens can pass member-filtered spend through the same math.
export function projectBuckets(
  // `props` widened in so the bucket's tier can travel with the projection —
  // the Record form needs it to default a personal-bucket spend to private.
  nodes: Array<{ id: string; kind: string; label: string; props?: Record<string, unknown> | null }>,
  allocated: Map<string, number>,
  mtdByBucket: Map<string, number>,
  asOf: Date = new Date(),
): BucketProjection[] {
  const { daysInMonth, elapsed } = monthWindow(asOf);
  const round = (v: number) => Math.round(v * 100) / 100;

  return nodes
    .filter((n) => n.kind === "bucket")
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((b) => {
      const alloc = allocated.get(b.id) ?? 0;
      const spent = mtdByBucket.get(b.id) ?? 0;
      const projectedSpend = (spent / elapsed) * daysInMonth;
      const status: BucketProjection["status"] =
        alloc === 0
          ? "unfunded"
          : projectedSpend > alloc
            ? "over_budget"
            : projectedSpend > alloc * 0.9
              ? "at_risk"
              : "on_track";
      return {
        bucket_id: b.id,
        bucket_label: b.label,
        // Defaults to the private tier when a bucket has no explicit one, which
        // matches privateBucketIds() — failing toward "personal" is the safe
        // direction for anything that drives a privacy default.
        tier: Number(b.props?.bucket) || 3,
        allocated: round(alloc),
        mtd_spend: round(spent),
        projected_spend: round(projectedSpend),
        projected_balance: round(alloc - projectedSpend),
        status,
      };
    });
}

export interface RecentSpend {
  id: string;
  direction: "out" | "in";
  amount: number;
  currency: string;
  occurred_at: string;
  vendor: string | null;
  source: string | null;
  /** True when the vendor was withheld under the tier-3 privacy promise. */
  isPrivate?: boolean;
  /**
   * inflow · outflow · transfer. Carried so the recent list can tell a savings
   * deposit from a salary — both are stored with direction "in", and showing
   * both as "+" is what made "Saving −RM500" and "Saving +RM500" appear on the
   * same day looking like a contradiction.
   */
  kind?: RecordKind;
}

export async function getRecentSpend(
  tenantId: string,
  limit = 8,
  opts: { viewerMemberId?: string | null; redact?: boolean } = {},
): Promise<RecentSpend[]> {
  const txns = await pbList<PBTransaction>("transactions", {
    filter: `tenant = ${pbStr(tenantId)} && ${inHouseholdTotals}`,
    sort: "-occurred_at",
    expand: "vendor_node",
    perPage: limit,
  });

  // Fetched unconditionally now: the tier map below needs them whether or not
  // redaction is on, and it is the same single query either way.
  const bucketNodes = await pbList<{
    id: string;
    kind: string;
    props: Record<string, unknown> | null;
  }>("nodes", { filter: `tenant = ${pbStr(tenantId)} && kind = 'bucket'` });

  const privateIds = opts.redact ? privateBucketIds(bucketNodes) : new Set<string>();

  const bucketTierOf = new Map(
    bucketNodes.map((b) => [b.id, Number((b.props as { bucket?: number } | null)?.bucket) || null]),
  );

  const rows = txns.map((t) => ({
    id: t.id,
    direction: (t.direction === "in" ? "in" : "out") as "out" | "in",
    // Derived rather than read straight off the row, so records written before
    // the bucket became authoritative still resolve correctly here.
    kind: deriveKind({
      kind: t.kind,
      direction: t.direction,
      bucketTier: t.wallet_node ? (bucketTierOf.get(t.wallet_node) ?? null) : null,
    }),
    amount: Number(t.amount),
    currency: t.currency || "MYR",
    occurred_at: t.occurred_at,
    vendor: t.expand?.vendor_node?.label ?? null,
    source: t.source || null,
    bucketId: t.wallet_node ?? null,
    memberId: t.member ?? null,
  }));

  // The amount and the date survive; the vendor becomes "Personal". A partner
  // still sees that money moved — just not what it bought.
  return redactPrivate(rows, {
    privateIds,
    viewerMemberId: opts.viewerMemberId,
    enabled: Boolean(opts.redact),
  }).map(({ bucketId, memberId, ...rest }) => ({
    ...rest,
    isPrivate: Boolean(bucketId && privateIds.has(bucketId)) && rest.vendor === PRIVATE_LABEL,
  }));
}

// Build a compact, graph-grounded context string for the AI (or the fallback).
function buildContext(projection: BucketProjection[]): string {
  return projection
    .map(
      (b) =>
        `- ${b.bucket_label}: allocated RM${b.allocated}, projected spend RM${b.projected_spend}, ` +
        `projected balance RM${b.projected_balance} (${b.status})`,
    )
    .join("\n");
}

// Deterministic, marital-safe fallback insight from the projection alone.
//
// ── AN UNFUNDED BUCKET IS NOT A BUCKET THAT IS DOING WELL ────────────────
//
// Until 2026-08-26 this looked for `over_budget` and `at_risk` and treated
// EVERYTHING ELSE as cause for congratulation — including `unfunded`, which
// projectBuckets assigns to any bucket with no allocation, and including the
// empty projection of a household that has declared nothing at all.
//
// So a brand-new household saw "every bucket is on track and your Savings are
// funding on schedule" above an Ask Honey box that, on the same screen, said it
// did not know their monthly income. Both sentences were about the same
// household and only one of them could be true. Praise for a plan that does not
// exist is the worse of the two, and it is also the one that stops the user
// declaring the income that would make every other number work.
function ruleBasedInsight(projection: BucketProjection[], locale: Locale): string {
  const over = projection.filter((b) => b.status === "over_budget");
  const risk = projection.filter((b) => b.status === "at_risk");
  const unfunded = projection.filter((b) => b.status === "unfunded");

  // A real overspend outranks an unfunded bucket: it is money already moving.
  if (over.length > 0) {
    const b = over[0];
    const gap = Math.abs(b.projected_balance);
    return t(locale, "honey.over", { bucket: dataLabel(locale, b.bucket_label), gap: gap.toFixed(0), alloc: b.allocated });
  }
  if (risk.length > 0) {
    const b = risk[0];
    return t(locale, "honey.risk", { bucket: dataLabel(locale, b.bucket_label), alloc: b.allocated });
  }
  // Nothing funded anywhere — including no buckets at all. Says the same thing
  // Ask Honey says, and points at the same screen, so the two agree.
  if (projection.length === 0 || unfunded.length === projection.length) {
    return t(locale, "honey.unfunded.all");
  }
  if (unfunded.length > 0) {
    return t(locale, "honey.unfunded.some", { bucket: dataLabel(locale, unfunded[0].bucket_label) });
  }
  return t(locale, "honey.ontrack");
}

/**
 * ⚠️ THIS SENDS THE HOUSEHOLD'S OWN DATA TO A CLOUD MODEL, and for a long time
 * it asked nobody. buildContext() interpolates real bucket labels — the comment
 * in lib/gemini.ts uses "Ma's dialysis" as its example, which is exactly the
 * kind of label people write — alongside exact RM figures. It is class 2, it ran
 * on every dashboard render, and the only gate was `isGeminiConfigured()`.
 *
 * The receipt and statement routes had been given a consent check; this one was
 * missed because it does not look like an upload. It is the same disclosure: a
 * third party outside Malaysia receives what this household earns, owes and
 * spends it on. `userId` is required rather than optional so that a future
 * caller has to think about whose data it is holding.
 *
 * Declining costs nothing that matters — ruleBasedInsight() is a real insight
 * computed here from the same projection, not an error state.
 */
export async function getHoneyInsight(
  projection: BucketProjection[],
  locale: Locale = "en",
  userId?: string | null,
): Promise<{ text: string; source: "gemini" | "rule-based" }> {
  // Nothing is funded ⇒ there is no plan to comment on, and the model is not
  // asked. `buildContext` would hand it a list of zeroes (or an empty string)
  // and a model given no facts writes encouragement anyway — which is exactly
  // the sentence this fix exists to stop showing.
  const funded = projection.some((b) => b.status !== "unfunded");
  if (!isGeminiConfigured() || !funded) {
    return { text: ruleBasedInsight(projection, locale), source: "rule-based" };
  }
  // Consent, checked before the snapshot is built rather than after — building
  // it is what assembles the labels and figures into one string.
  const local = isLocalProvider(activeAiProvider());
  if (!(await aiCloudDataAllowed(userId, { local }))) {
    return { text: ruleBasedInsight(projection, locale), source: "rule-based" };
  }
  try {
    const text = await honeyInsight(buildContext(projection), locale, undefined, userId ?? null);
    return { text, source: "gemini" };
  } catch {
    return { text: ruleBasedInsight(projection, locale), source: "rule-based" };
  }
}
