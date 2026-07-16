// Savings goals — the user's OWN targets, on their OWN time. Goals are `goal`
// nodes in the graph (props: target, current, category, emoji, target_date), so
// this reuses the existing model — no migration. Reaching a target is the reward,
// funded by spending discipline; no money is paid out (zero compliance risk).

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
  current: number;
  category: string;
  emoji: string;
  targetDate: string | null;
  pct: number;
  remaining: number;
}

interface GoalNode {
  id: string;
  label: string;
  props: Record<string, unknown> | null;
}

const round = (v: number) => Math.round(v * 100) / 100;

function mapGoal(n: GoalNode): Goal {
  const target = Number(n.props?.target) || 0;
  const current = Number(n.props?.current) || 0;
  const category = String(n.props?.category ?? "custom");
  return {
    id: n.id,
    name: n.label,
    target,
    current,
    category,
    emoji: String(n.props?.emoji ?? EMOJI_BY_CAT[category] ?? "🎯"),
    targetDate: (n.props?.target_date as string) || null,
    pct: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
    remaining: Math.max(0, round(target - current)),
  };
}

export async function listGoals(tenantId: string): Promise<Goal[]> {
  const nodes = await pbList<GoalNode>("nodes", {
    filter: `tenant = ${pbStr(tenantId)} && kind = 'goal'`,
    sort: "created",
  });
  return nodes.map(mapGoal).sort((a, b) => b.pct - a.pct);
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
      current: 0,
      category,
      emoji: EMOJI_BY_CAT[category] ?? "🎯",
      target_date: input.targetDate || "",
    },
  });
}

// Move money toward a goal (from savings you've controlled into being). Bumps the
// goal's `current`; the target itself is the reward when it reaches 100%.
export async function contributeGoal(goalId: string, amount: number): Promise<{ current: number; target: number }> {
  const ctx = await requirePermission("manage_graph");
  const node = await pbFirst<GoalNode>(
    "nodes",
    `id = ${pbStr(goalId)} && tenant = ${pbStr(ctx.tenant.id)} && kind = 'goal'`,
  );
  if (!node) throw new AuthError("Goal not found in this household.", 404);
  const add = Number(amount);
  if (!(add > 0)) throw new AuthError("Enter an amount above zero.", 400);
  const target = Number(node.props?.target) || 0;
  const current = round(Math.min(target || Infinity, (Number(node.props?.current) || 0) + add));
  await pbUpdate("nodes", goalId, { props: { ...(node.props ?? {}), current } });
  return { current, target };
}
