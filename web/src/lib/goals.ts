// Savings goals — the user's OWN targets, on their OWN time. Goals are `goal`
// nodes in the graph. Reaching a target is the reward, funded by spending
// discipline; no money is paid out (zero compliance risk).
//
// PROGRESS IS DERIVED, and that is the whole of Task 9's data model. Until
// 2026-08-23 a goal carried one opaque `props.current` that a button
// incremented, so RM8,000 of progress could be eight hundred logged transfers or
// one number somebody typed, and nothing could tell them apart. Now:
//
//     progress = sum(transactions linked to this goal) + manual adjustment
//
// and the two halves are reported separately, always, so the figure can be
// reconciled against the ledger. "RM8,000 tracked + RM2,000 you added manually"
// is a sentence a household can check; "RM10,000" is one they have to trust.
//
// The manual half is not a lesser thing — savings that happened before the app,
// or in an account it never sees, are real. It just has to be labelled, because
// it is the half no record backs.

import { pbList, pbFirst, pbCreate, pbUpdate, pbStr } from "./pocketbase";
import { requirePermission, AuthError } from "./household";

export const GOAL_CATEGORIES = [
  { key: "retirement", emoji: "🏖️", label: "Retirement" },
  { key: "trip", emoji: "✈️", label: "Trip / Holiday" },
  { key: "study", emoji: "🎓", label: "Study fund" },
  { key: "home", emoji: "🏠", label: "Home" },
  { key: "vehicle", emoji: "🚗", label: "Vehicle" },
  { key: "emergency", emoji: "🛡️", label: "Emergency fund" },
  { key: "wedding", emoji: "💍", label: "Wedding" },
  { key: "gift", emoji: "🎁", label: "Gift" },
  { key: "custom", emoji: "🎯", label: "Custom (your own)" },
] as const;

const EMOJI_BY_CAT: Record<string, string> = Object.fromEntries(GOAL_CATEGORIES.map((c) => [c.key, c.emoji]));

export interface Goal {
  id: string;
  name: string;
  target: number;
  /** tracked + manual. Never stored — always derived, so it cannot go stale. */
  current: number;
  /** Sum of the records linked to this goal. Reconcilable against the ledger. */
  tracked: number;
  /** What a human typed in. Real money, but no record backs it. */
  manual: number;
  /** Set when `manual` came from the pre-2026-08-23 opaque `current`. */
  manualMigrated: boolean;
  category: string;
  emoji: string;
  targetDate: string | null;
  /** Capped at 100 for the BAR only. Use `pctRaw` for the number shown. */
  pct: number;
  /** Uncapped. Past 100 is a success state, not an overflow bug. */
  pctRaw: number;
  remaining: number;
  /** Light history of target changes — a goal revised down repeatedly is real information. */
  targetHistory: { at: string; from: number; to: number }[];
}

interface GoalNode {
  id: string;
  label: string;
  props: Record<string, unknown> | null;
}

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * The manual half of a goal's progress, legacy-aware.
 *
 * Exported because H-Score's emergency buffer reads goal progress too, and there
 * must be exactly ONE answer to "how much is in this goal" — a second derivation
 * living in hscoreData.ts is how the savings criterion and the demo ended up
 * disagreeing in sign. See the note in lib/hscore.ts.
 */
export function goalManual(props: Record<string, unknown> | null): number {
  const explicit = props?.manual_adjustment;
  return round(Number(explicit !== undefined ? explicit : props?.current) || 0);
}

/**
 * Sum linked records per goal id. Voided rows are excluded: a voided transfer is
 * money that did not move, and counting it would be the ledger disagreeing with
 * itself.
 *
 * Callers must pass ALL-TIME records, not a window. Goal progress is a stock —
 * what you have — and feeding it only the last 90 days would quietly report a
 * three-year house deposit as three months of it.
 */
export function trackedByGoal(
  rows: { goal?: string; amount: number; voided?: boolean }[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of rows) {
    if (!t.goal || t.voided) continue;
    out.set(t.goal, (out.get(t.goal) ?? 0) + Number(t.amount));
  }
  return out;
}

function mapGoal(n: GoalNode, trackedById: Map<string, number>): Goal {
  const target = Number(n.props?.target) || 0;
  // Legacy `props.current` is READ as the manual figure when no explicit
  // manual_adjustment exists, rather than being rewritten into one by a data
  // migration. Two reasons, one of them learned the hard way today: a JSVM data
  // backfill in 1751900018 reported success and silently changed nothing, which
  // would have shown every household RM0 progress against goals they had really
  // funded. And interpreting old data on read is the same principle the H-Score
  // snapshots use — history says what it said; today's code knows how to read it.
  //
  // It is also exactly right on the merits: `current` only ever held a number a
  // human typed, which is precisely what the manual half means.
  const explicitManual = n.props?.manual_adjustment;
  const manual = goalManual(n.props);
  const tracked = round(trackedById.get(n.id) ?? 0);
  const current = round(tracked + manual);
  const category = String(n.props?.category ?? "custom");
  const pctRaw = target > 0 ? Math.round((current / target) * 100) : 0;
  return {
    id: n.id,
    name: n.label,
    target,
    current,
    tracked,
    manual,
    // True while the figure is still the legacy one — i.e. nobody has adjusted it
    // since goals learned to track records. Lets the UI explain where it came from.
    manualMigrated: explicitManual === undefined && Number(n.props?.current) > 0,
    category,
    emoji: String(n.props?.emoji ?? EMOJI_BY_CAT[category] ?? "🎯"),
    targetDate: (n.props?.target_date as string) || null,
    // The BAR clamps so it cannot draw past its container; the NUMBER does not,
    // because 120% of a goal is an achievement and rounding it down to 100%
    // quietly takes it away from whoever earned it.
    pct: Math.min(100, Math.max(0, pctRaw)),
    pctRaw,
    remaining: Math.max(0, round(target - current)),
    targetHistory: Array.isArray(n.props?.target_history)
      ? (n.props!.target_history as Goal["targetHistory"])
      : [],
  };
}

export async function listGoals(tenantId: string): Promise<Goal[]> {
  const [nodes, linked] = await Promise.all([
    pbList<GoalNode>("nodes", {
      filter: `tenant = ${pbStr(tenantId)} && kind = 'goal'`,
      sort: "created",
    }),
    // Every record pointing at a goal, in one query rather than one per goal.
    // Voided records are excluded: a voided transfer is money that did not move,
    // and leaving it in progress would be the ledger disagreeing with itself.
    pbList<{ goal?: string; amount: number; voided?: boolean }>("transactions", {
      filter: `tenant = ${pbStr(tenantId)} && goal != ''`,
      perPage: 1000,
    }),
  ]);

  const trackedById = trackedByGoal(linked);

  // Sorted by RAW percentage so a goal at 120% sorts above one at exactly 100,
  // rather than the two being tied by a cap that exists only for the bar.
  return nodes.map((n) => mapGoal(n, trackedById)).sort((a, b) => b.pctRaw - a.pctRaw);
}

export async function createGoal(input: {
  name: string;
  target: number;
  category?: string;
  targetDate?: string;
}): Promise<void> {
  const ctx = await requirePermission("manage_graph");
  const name = (input.name ?? "").trim();
  if (!name) throw new AuthError("Give your goal a name.", 400);
  const target = Number(input.target);
  if (!(target > 0)) throw new AuthError("Set a target amount above zero.", 400);
  const category = GOAL_CATEGORIES.some((c) => c.key === input.category) ? input.category! : "custom";
  await pbCreate("nodes", {
    tenant: ctx.tenant.id,
    kind: "goal",
    label: name.slice(0, 60),
    props: {
      target: round(target),
      manual_adjustment: 0,
      category,
      emoji: EMOJI_BY_CAT[category] ?? "🎯",
      target_date: input.targetDate || "",
      target_history: [],
    },
  });
}

async function goalNode(goalId: string, tenantId: string): Promise<GoalNode> {
  const node = await pbFirst<GoalNode>(
    "nodes",
    `id = ${pbStr(goalId)} && tenant = ${pbStr(tenantId)} && kind = 'goal'`,
  );
  if (!node) throw new AuthError("Goal not found in this household.", 404);
  return node;
}

/**
 * Adjust the MANUAL half — savings that happened outside the app. Named for what
 * it is, so it can never be confused in the UI with tracked progress.
 *
 * The old version of this clamped the total to the target
 * (`Math.min(target || Infinity, …)`), which made progress past 100% literally
 * unrepresentable — the brief is explicit that going past a target is a success
 * state and not an overflow bug, and a household that saved RM12,000 toward a
 * RM10,000 goal was being told they had saved RM10,000. The clamp is gone.
 *
 * Negative amounts are allowed: correcting an over-stated manual figure is a
 * normal thing to need, and the alternative is a number the user cannot fix.
 */
export async function adjustGoalManual(
  goalId: string,
  delta: number,
): Promise<{ manual: number; target: number }> {
  const ctx = await requirePermission("manage_graph");
  const node = await goalNode(goalId, ctx.tenant.id);
  const add = Number(delta);
  if (!Number.isFinite(add) || add === 0) throw new AuthError("Enter an amount.", 400);
  const target = Number(node.props?.target) || 0;
  const manual = round(Math.max(0, (Number(node.props?.manual_adjustment) || 0) + add));
  const props = { ...(node.props ?? {}), manual_adjustment: manual };
  // The migration note is only true of the ORIGINAL figure. Once a human has
  // touched it, it is theirs and saying otherwise would be wrong.
  delete (props as Record<string, unknown>).manual_adjustment_note;
  await pbUpdate("nodes", goalId, { props });
  return { manual, target };
}

/**
 * Edit a goal. Changing the target must NOT retroactively alter recorded
 * progress — tracked progress is the sum of real records and has nothing to do
 * with what the target happens to be today — so this only ever writes the target
 * and appends to its history.
 *
 * The history is kept because a goal revised down repeatedly is real information
 * about a household, and a target that silently rewrites itself hides it.
 */
export async function updateGoal(
  goalId: string,
  patch: { name?: string; target?: number; targetDate?: string | null },
): Promise<void> {
  const ctx = await requirePermission("manage_graph");
  const node = await goalNode(goalId, ctx.tenant.id);
  const props: Record<string, unknown> = { ...(node.props ?? {}) };
  const body: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new AuthError("Give your goal a name.", 400);
    body.label = name.slice(0, 60);
  }

  if (patch.target !== undefined) {
    const next = Number(patch.target);
    if (!(next > 0)) throw new AuthError("Set a target amount above zero.", 400);
    const from = Number(props.target) || 0;
    if (round(next) !== round(from)) {
      const history = Array.isArray(props.target_history) ? [...(props.target_history as unknown[])] : [];
      history.push({ at: new Date().toISOString(), from: round(from), to: round(next) });
      // Bounded: this is context, not an audit trail — the ledger is the audit
      // trail — and an unbounded array inside a props blob grows without limit.
      props.target_history = history.slice(-20);
      props.target = round(next);
    }
  }

  if (patch.targetDate !== undefined) props.target_date = patch.targetDate || "";

  body.props = props;
  await pbUpdate("nodes", goalId, body);
}

/**
 * Delete a goal. Records linked to it are UNLINKED, never deleted — a
 * household's ledger is not a goal's property, and money must not vanish from
 * history because a target was abandoned. The caller is responsible for warning
 * the user how many records this touches; `countLinkedRecords` is how it knows.
 */
export async function deleteGoal(goalId: string): Promise<{ unlinked: number }> {
  const ctx = await requirePermission("manage_graph");
  await goalNode(goalId, ctx.tenant.id);
  const linked = await pbList<{ id: string }>("transactions", {
    filter: `tenant = ${pbStr(ctx.tenant.id)} && goal = ${pbStr(goalId)}`,
    perPage: 1000,
  });
  for (const t of linked) await pbUpdate("transactions", t.id, { goal: "" });
  await pbUpdate("nodes", goalId, { props: { deleted: true } });
  return { unlinked: linked.length };
}

/** How many records a goal would unlink if deleted. For the confirm dialog. */
export async function countLinkedRecords(tenantId: string, goalId: string): Promise<number> {
  const rows = await pbList<{ id: string }>("transactions", {
    filter: `tenant = ${pbStr(tenantId)} && goal = ${pbStr(goalId)}`,
    perPage: 1000,
  });
  return rows.length;
}
