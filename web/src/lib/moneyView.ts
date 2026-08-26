// Read model for the money-monitoring visualizations (treemap · sankey · tree).
// Aggregates the same knowledge graph into the shapes each chart needs:
// income sources, per-bucket allocation vs spend, vendor-level spend, and goals.
// Reuses getBucketProjection() so the allocation walk stays in one place.

import { pbList, pbStr } from "./pocketbase";
import { getBucketProjection } from "./projection";
import { collapsePrivateVendors, privateBucketIds } from "./privacy";
import { countsAsSpend } from "./recordKind";
import type { BucketProjection } from "./types";

interface PBNode {
  id: string;
  kind: string;
  label: string;
  props: Record<string, unknown> | null;
}

interface PBTxn {
  wallet_node: string;
  vendor_node: string;
  amount: number;
  direction?: string;
  voided?: boolean;
  member?: string;
}

export interface MoneyIncome {
  id: string;
  label: string;
  monthly: number;
}

export interface MoneyBucket extends BucketProjection {
  tier: number; // 1 = must-paid, 2 = savings, 3 = privacy/personal
}

export interface VendorSpend {
  bucketId: string;
  vendorId: string;
  vendorLabel: string;
  amount: number; // month-to-date RM
  /** Who logged it — drives the contributor split on the dashboard. */
  memberId?: string;
}

export interface MoneyGoal {
  id: string;
  label: string;
  target: number;
  current: number;
}

export interface MoneyView {
  incomes: MoneyIncome[];
  buckets: MoneyBucket[];
  vendorSpend: VendorSpend[];
  goals: MoneyGoal[];
  totalIncome: number;
  totalAllocated: number;
  totalSpent: number; // month-to-date
  /** Month-to-date spend transactions counted (voided and credits excluded). */
  txnCount: number;
}

export interface MoneyViewOpts {
  /** The member doing the viewing — their own private spend stays itemised. */
  viewerMemberId?: string | null;
  /**
   * Enforce the tier-3 privacy promise. Off for the seeded demo personas, where
   * the vendor breakdown under every bucket is the whole point of /graph.
   */
  redact?: boolean;
}

// The three tiers of a household's money. The engine keys off
// bucket.props.bucket = 1|2|3; these are the names it wears in the UI.
//
// Tier 3 is where the privacy promise lives: personal money, bounded by the
// user's OWN cap rather than policed by anyone else (see lib/privacy.ts and the
// personalCap component in lib/hscore.ts).

export interface CategoryMeta {
  label: string;
  badge: string;
}

export const CATEGORY_META: Record<number, CategoryMeta> = {
  1: { label: "Must-paid", badge: "\u{1F3E0}" },
  2: { label: "Savings", badge: "\u{1F3AF}" },
  3: { label: "Spendings", badge: "\u{1F512}" },
};

export function tierLabel(tier: number): string {
  return CATEGORY_META[tier]?.label ?? "Other";
}

/** Roster roles a household can assign. */
export const ROLE_OPTIONS: string[] = ["owner", "partner", "member", "child", "dependent"];

export async function getMoneyView(tenantId: string, opts: MoneyViewOpts = {}): Promise<MoneyView> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const startStr = monthStart.toISOString().replace("T", " ");

  const [projection, nodes, txns] = await Promise.all([
    getBucketProjection(tenantId),
    pbList<PBNode>("nodes", { filter: `tenant = ${pbStr(tenantId)}` }),
    pbList<PBTxn>("transactions", {
      filter: `tenant = ${pbStr(tenantId)} && occurred_at >= ${pbStr(startStr)}`,
    }),
  ]);

  const propOf = new Map(nodes.map((n) => [n.id, n.props]));
  const labelOf = new Map(nodes.map((n) => [n.id, n.label]));

  const incomes: MoneyIncome[] = nodes
    .filter((n) => n.kind === "income_source")
    .map((n) => ({ id: n.id, label: n.label, monthly: Number(n.props?.monthly_amount) || 0 }))
    .sort((a, b) => b.monthly - a.monthly);

  const goals: MoneyGoal[] = nodes
    .filter((n) => n.kind === "goal")
    .map((n) => ({
      id: n.id,
      label: n.label,
      target: Number(n.props?.target) || 0,
      current: Number(n.props?.current) || 0,
    }));

  const buckets: MoneyBucket[] = projection.map((b) => ({
    ...b,
    tier: Number((propOf.get(b.bucket_id) as Record<string, unknown> | null)?.bucket) || 3,
  }));

  // Vendor-level month-to-date spend, grouped by bucket + vendor + who logged it.
  // The member is carried through for two reasons: the contributor split on the
  // dashboard, and so private-bucket rows can be collapsed for everyone except
  // the person they belong to. "|" separates the parts — PocketBase ids are
  // 15 alphanumeric characters, so it can never collide.
  const SEP = "|";
  const agg = new Map<string, number>();
  let txnCount = 0;
  for (const t of txns) {
    if (!t.wallet_node || !t.vendor_node) continue;
    // A voided record is evidence, not spending — counting it would inflate the
    // projection, the health score and the shortfall date alike.
    // Same predicate as /graph, so the two can no longer disagree about the
    // same rows — which they did, visibly, until 2026-08-26.
    if (!countsAsSpend(t)) continue;
    txnCount += 1;
    const k = [t.wallet_node, t.vendor_node, t.member ?? ""].join(SEP);
    agg.set(k, (agg.get(k) ?? 0) + Number(t.amount));
  }

  const rawVendorSpend = [...agg.entries()]
    .map(([k, amount]) => {
      const [bucketId, vendorId, memberId] = k.split(SEP);
      return {
        bucketId,
        vendorId,
        vendorLabel: labelOf.get(vendorId) ?? "Unknown",
        amount,
        memberId: memberId || "",
      };
    })
    .sort((a, b) => b.amount - a.amount);

  // The tier-3 promise applied to the graph read path: another member's personal
  // vendors fold into a single "Personal" entry. The bucket total is preserved
  // by construction, because nothing is dropped — only relabelled.
  const vendorSpend: VendorSpend[] = collapsePrivateVendors(rawVendorSpend, {
    privateIds: privateBucketIds(nodes),
    viewerMemberId: opts.viewerMemberId,
    enabled: Boolean(opts.redact),
    isOtherMember: (r) => Boolean(r.memberId) && r.memberId !== opts.viewerMemberId,
  });

  const totalIncome = incomes.reduce((s, i) => s + i.monthly, 0);
  const totalAllocated = buckets.reduce((s, b) => s + b.allocated, 0);
  const totalSpent = vendorSpend.reduce((s, v) => s + v.amount, 0);

  return { incomes, buckets, vendorSpend, goals, totalIncome, totalAllocated, totalSpent, txnCount };
}
