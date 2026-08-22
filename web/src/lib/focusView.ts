// Focus lens for /graph: slice the knowledge graph to a single income stream,
// bucket, vendor, category (tier), or PERSON — then every view re-renders through
// that lens. Structural focuses (node/tier) keep full allocations and all-member
// spend; a person focus re-weights spend to that member's transactions only.
//
// One read, one focus applied, both the graph-view and money-view shapes derived,
// so the six visualizations consume filtered data unchanged.

import { pbList, pbStr } from "./pocketbase";
import { computeAllocations, projectBuckets } from "./projection";
import { CATEGORY_META, ROLE_OPTIONS, type MoneyView, type CategoryMeta } from "./moneyView";
import { collapsePrivateVendors, privateBucketIds } from "./privacy";
import type { GNode } from "./graphView";
import { dataLabel } from "./dataLabels";
import type { Locale } from "./i18n";

interface RawNode {
  id: string;
  kind: string;
  label: string;
  props: Record<string, unknown> | null;
}
interface RawEdge {
  id: string;
  src_node: string;
  dst_node: string;
  rel: string;
  amount: number;
  percentage: number;
  valid_to: string;
}
interface RawTxn {
  wallet_node: string;
  vendor_node: string;
  amount: number;
  member: string;
  /** inflow · outflow · transfer. Absent on rows that predate Task 1. */
  kind?: string | null;
  direction?: string | null;
  /** Task 9: the goal a transfer was put toward, if any. */
  goal?: string | null;
  voided?: boolean;
}
interface Member {
  id: string;
  display_name: string;
  role: string;
}

export interface GraphEdge {
  src: string;
  dst: string;
  rel: string;
  flow: number;
  label: string;
}

export type FocusKind = "all" | "node" | "member" | "tier";
export interface Focus {
  kind: FocusKind;
  id?: string;
  tier?: number;
}

export function parseFocus(raw?: string): Focus {
  if (!raw || raw === "all") return { kind: "all" };
  const i = raw.indexOf(":");
  const k = i === -1 ? raw : raw.slice(0, i);
  const v = i === -1 ? "" : raw.slice(i + 1);
  if (k === "node" && v) return { kind: "node", id: v };
  if (k === "member" && v) return { kind: "member", id: v };
  if (k === "tier" && v) return { kind: "tier", tier: Number(v) };
  return { kind: "all" };
}

export function focusToParam(f: Focus): string {
  if (f.kind === "all") return "all";
  if (f.kind === "tier") return `tier:${f.tier}`;
  return `${f.kind}:${f.id}`;
}

export interface FocusOption {
  value: string; // focus param, e.g. "node:ndgroc111111111"
  label: string;
  badge: string;
  hint?: string;
}
export interface FocusGroups {
  income: FocusOption[];
  bucket: FocusOption[];
  vendor: FocusOption[];
  member: FocusOption[];
  category: FocusOption[];
}

export interface FocusedView {
  graph: { nodes: GNode[]; edges: GraphEdge[] };
  money: MoneyView;
  focus: Focus;
  focusLabel: string;
  focusBadge: string;
  focusId: string | null; // node to highlight in graph views (structural node focus)
  scope: "structure" | "person"; // person = spend re-weighted to one member
  groups: FocusGroups;
  memberCount: number;
  tierMeta: Record<number, CategoryMeta>; // tier 1|2|3 display names
  roleOptions: string[]; // roster roles a household can assign
  personas: Array<{ id: string; name: string }>; // households the viewer may switch between
}

const KIND_BADGE: Record<string, string> = {
  income_source: "💰",
  bucket: "🪣",
  vendor: "🏪",
  goal: "🎯",
  obligation: "📄",
};

const rm0 = (n: number) => `RM ${Math.round(n).toLocaleString()}`;

// Build graph-view edges (rel + monthly RM flow) from raw edges + a spend map.
function buildEdges(
  nodes: RawNode[],
  edges: RawEdge[],
  spendByPair: Map<string, number>,
): GraphEdge[] {
  const income = nodes.filter((n) => n.kind === "income_source");
  const monthlyOf = (id: string) => Number(income.find((n) => n.id === id)?.props?.monthly_amount) || 0;

  const out: GraphEdge[] = [];
  for (const e of edges) {
    if (e.valid_to) continue;
    if (e.rel === "ALLOCATES_FIXED" || e.rel === "FUNDS") {
      out.push({ src: e.src_node, dst: e.dst_node, rel: e.rel, flow: e.amount || 0, label: rm0(e.amount || 0) });
    } else if (e.rel === "ALLOCATES_PCT") {
      const flow = (monthlyOf(e.src_node) * (e.percentage || 0)) / 100;
      out.push({ src: e.src_node, dst: e.dst_node, rel: e.rel, flow, label: `${e.percentage}% ≈ ${rm0(flow)}` });
    } else if (e.rel === "SPENT_AT") {
      const flow = spendByPair.get(`${e.src_node} ${e.dst_node}`) ?? 0;
      out.push({ src: e.src_node, dst: e.dst_node, rel: e.rel, flow, label: flow > 0 ? `${rm0(flow)} mtd` : "linked" });
    } else if (e.rel === "CONTRIBUTES_TO" || e.rel === "OWES") {
      out.push({ src: e.src_node, dst: e.dst_node, rel: e.rel, flow: 0, label: e.rel.toLowerCase().replace("_", " ") });
    }
  }
  // spend pairs with no explicit edge yet
  for (const [key, flow] of spendByPair) {
    const [src, dst] = key.split(" ");
    if (!out.some((e) => e.src === src && e.dst === dst && e.rel === "SPENT_AT")) {
      out.push({ src, dst, rel: "SPENT_AT", flow, label: `${rm0(flow)} mtd` });
    }
  }
  return out;
}

// Directional flow-slice: focus node + everything upstream (funds it) and
// downstream (it funds / spends), following the graph edges.
function flowSlice(focusId: string, edges: GraphEdge[]): Set<string> {
  const outAdj = new Map<string, string[]>();
  const inAdj = new Map<string, string[]>();
  for (const e of edges) {
    (outAdj.get(e.src) ?? outAdj.set(e.src, []).get(e.src)!).push(e.dst);
    (inAdj.get(e.dst) ?? inAdj.set(e.dst, []).get(e.dst)!).push(e.src);
  }
  const keep = new Set<string>([focusId]);
  const walk = (start: string, adj: Map<string, string[]>) => {
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const nxt of adj.get(cur) ?? []) {
        if (!keep.has(nxt)) {
          keep.add(nxt);
          stack.push(nxt);
        }
      }
    }
  };
  walk(focusId, outAdj);
  walk(focusId, inAdj);
  return keep;
}

// `allowedPersonaIds` limits which tenants may appear in the persona switcher —
// the demo personas for anonymous visitors, or the viewer's OWN households when
// signed in. Without it, only the current tenant is offered. Real users' private
// households must never leak into this list.
export async function getFocusedView(
  tenantId: string,
  focus: Focus,
  locale: Locale = "en",
  allowedPersonaIds?: string[],
  privacy: { viewerMemberId?: string | null; redact?: boolean } = {},
): Promise<FocusedView> {
  const dl = (s: string) => dataLabel(locale, s);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const startStr = monthStart.toISOString().replace("T", " ");

  const [nodes, edges, txns, members, tenants] = await Promise.all([
    pbList<RawNode>("nodes", { filter: `tenant = ${pbStr(tenantId)}` }),
    pbList<RawEdge>("edges", { filter: `tenant = ${pbStr(tenantId)}` }),
    pbList<RawTxn>("transactions", { filter: `tenant = ${pbStr(tenantId)} && occurred_at >= ${pbStr(startStr)}` }),
    pbList<Member>("members", { filter: `tenant = ${pbStr(tenantId)}`, sort: "created" }),
    pbList<{ id: string; name: string; kind: string }>("tenants", { sort: "created" }),
  ]);

  // Only the current tenant + explicitly-allowed personas are exposed — never the
  // full tenant list, which now includes every consumer's private household.
  //
  // The caller's list is also the running ORDER. The demo switcher is meant to
  // read individual → couple → family, and sorting by `created` scrambles that
  // into whatever sequence the seeds happened to run in.
  const byId = new Map(tenants.map((t) => [t.id, t]));
  const personas: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  for (const id of [...(allowedPersonaIds ?? []), tenantId]) {
    const t = byId.get(id);
    if (!t || seen.has(id)) continue;
    seen.add(id);
    personas.push({ id, name: dl(t.name || id) });
  }
  const tierMeta = CATEGORY_META;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const labelOf = (id: string) => nodeById.get(id)?.label ?? "Unknown";

  // ── selector options (fully data-driven; any roster size) ─────────────
  const byKind = (k: string) => nodes.filter((n) => n.kind === k);
  const groups: FocusGroups = {
    income: byKind("income_source").map((n) => ({ value: `node:${n.id}`, label: dl(n.label), badge: "💰", hint: n.props?.monthly_amount ? `${rm0(Number(n.props.monthly_amount))}/mo` : undefined })),
    bucket: byKind("bucket").sort((a, b) => a.label.localeCompare(b.label)).map((n) => ({ value: `node:${n.id}`, label: dl(n.label), badge: "🪣" })),
    vendor: byKind("vendor").sort((a, b) => a.label.localeCompare(b.label)).map((n) => ({ value: `node:${n.id}`, label: dl(n.label), badge: "🏪" })),
    member: members.map((m) => ({ value: `member:${m.id}`, label: dl(m.display_name), badge: "🧑", hint: m.role })),
    category: [...new Set(byKind("bucket").map((n) => Number(n.props?.bucket) || 3))]
      .sort((a, b) => a - b)
      .map((t) => ({ value: `tier:${t}`, label: dl(tierMeta[t]?.label ?? "Other"), badge: tierMeta[t]?.badge ?? "🗂️" })),
  };

  // ── spend maps, re-weighted to a member when a person focus is active ──
  const scope: "structure" | "person" = focus.kind === "member" ? "person" : "structure";
  const allInScope = scope === "person" ? txns.filter((t) => t.member === focus.id) : txns;

  // Tier 2 = savings. Needed to derive the kind of rows written before Task 1.
  const savingsBucketIds = new Set(
    nodes.filter((n) => n.kind === "bucket" && Number(n.props?.bucket) === 2).map((n) => n.id),
  );

  // ── TRANSFERS ARE NOT SPENDING ──────────────────────────────────────────
  //
  // Every transaction with a bucket and a vendor used to become a bucket→vendor
  // flow, which meant a savings deposit — a TRANSFER since Task 1 — drew as
  // money leaving the household. The brief names this exactly: "if transfers
  // render as flows leaving the household, the diagram shows money disappearing
  // that never left, which is the misreading a household finance app cannot
  // afford."
  //
  // THE CHOICE, and it is stated on the chart as the brief requires: transfers
  // TERMINATE AT AN IN-HOUSEHOLD NODE rather than being excluded. Excluding them
  // would be simpler and is the other permitted option, but it makes a household
  // that saved RM1,000 this month look like one that earned RM1,000 less — the
  // money would simply be missing from the picture. Terminating shows where it
  // actually went, which is the whole point of a Sankey.
  //
  // Task 9's goals are the clean destination the brief anticipated: a transfer
  // linked to a goal terminates at that goal. One that is not linked terminates
  // at its savings bucket, which is still inside the household.
  const isTransfer = (t: RawTxn) =>
    t.kind === "transfer" ||
    // Derived for rows written before the kind field existed, matching
    // lib/recordKind.ts: anything against a tier-2 bucket is a transfer.
    (!t.kind && savingsBucketIds.has(t.wallet_node));

  const spendTxns = allInScope.filter((t) => !t.voided && !isTransfer(t));
  const transferTxns = allInScope.filter((t) => !t.voided && isTransfer(t));

  // Bucket → goal, for transfers that were put toward one. Money terminating at
  // a goal is money the household still has.
  const transferByGoal = new Map<string, number>();
  for (const t of transferTxns) {
    if (!t.goal || !t.wallet_node) continue;
    const pair = `${t.wallet_node} ${t.goal}`;
    transferByGoal.set(pair, (transferByGoal.get(pair) ?? 0) + Number(t.amount));
  }
  const spendByPair = new Map<string, number>();
  const spendByBucket = new Map<string, number>();
  // Who logged each pair, so the tier-3 collapse below knows whose spend it is.
  // A pair touched by more than one member is shared, not personal.
  const memberOfPair = new Map<string, string>();
  let txnCount = 0;
  for (const t of spendTxns) {
    if (!t.wallet_node || !t.vendor_node) continue;
    txnCount += 1;
    const pair = `${t.wallet_node} ${t.vendor_node}`;
    spendByPair.set(pair, (spendByPair.get(pair) ?? 0) + Number(t.amount));
    spendByBucket.set(t.wallet_node, (spendByBucket.get(t.wallet_node) ?? 0) + Number(t.amount));
    const seen = memberOfPair.get(pair);
    memberOfPair.set(pair, seen === undefined ? (t.member ?? "") : seen === (t.member ?? "") ? seen : "");
  }

  const allEdges = buildEdges(nodes, edges, spendByPair);

  // Transfers, drawn terminating inside the household rather than leaving it.
  for (const [pair, flow] of transferByGoal) {
    const [src, dst] = pair.split(" ");
    if (!nodes.some((n) => n.id === dst)) continue; // goal deleted since
    allEdges.push({ src, dst, rel: "SAVED_INTO", flow, label: `${rm0(flow)} saved` });
  }
  const allocated = computeAllocations(nodes, edges);

  // ── which nodes survive the lens ──────────────────────────────────────
  let keep: Set<string>;
  let focusLabel = "Whole graph";
  let focusBadge = "🌐";
  let focusId: string | null = null;

  if (focus.kind === "node" && focus.id && nodeById.has(focus.id)) {
    keep = flowSlice(focus.id, allEdges);
    const n = nodeById.get(focus.id)!;
    focusLabel = dl(n.label);
    focusBadge = KIND_BADGE[n.kind] ?? "•";
    focusId = focus.id;
  } else if (focus.kind === "tier" && focus.tier) {
    const tierBuckets = nodes.filter((n) => n.kind === "bucket" && (Number(n.props?.bucket) || 3) === focus.tier);
    keep = new Set(tierBuckets.map((b) => b.id));
    // add each bucket's upstream income + downstream vendors/goals
    for (const b of tierBuckets) for (const id of flowSlice(b.id, allEdges)) keep.add(id);
    focusLabel = dl(tierMeta[focus.tier]?.label ?? "Category");
    focusBadge = tierMeta[focus.tier]?.badge ?? "🗂️";
  } else if (scope === "person" && focus.id) {
    // buckets the member spent from + vendors they used + upstream income/goals
    keep = new Set<string>();
    for (const [pair] of spendByPair) {
      const [w, v] = pair.split(" ");
      keep.add(w);
      keep.add(v);
    }
    for (const bId of [...keep]) {
      if (nodeById.get(bId)?.kind === "bucket") for (const id of flowSlice(bId, allEdges)) keep.add(id);
    }
    const m = members.find((mm) => mm.id === focus.id);
    focusLabel = dl(m?.display_name ?? "Member");
    focusBadge = "🧑";
  } else {
    keep = new Set(nodes.map((n) => n.id));
  }

  // ── filter graph to the lens ──────────────────────────────────────────
  const keptNodes = nodes.filter((n) => keep.has(n.id));
  const graphNodes: GNode[] = keptNodes.map((n) => ({ id: n.id, kind: n.kind, label: dl(n.label), props: n.props }));
  const graphEdges = allEdges.filter((e) => keep.has(e.src) && keep.has(e.dst));

  // ── money view over the lens (allocations full; spend per the lens) ────
  const bucketProj = projectBuckets(keptNodes, allocated, spendByBucket);
  const buckets = bucketProj.map((b) => ({
    ...b,
    bucket_label: dl(b.bucket_label),
    tier: Number(nodeById.get(b.bucket_id)?.props?.bucket) || 3,
  }));

  const incomes = keptNodes
    .filter((n) => n.kind === "income_source")
    .map((n) => ({ id: n.id, label: dl(n.label), monthly: Number(n.props?.monthly_amount) || 0 }))
    .sort((a, b) => b.monthly - a.monthly);

  const goals = keptNodes
    .filter((n) => n.kind === "goal")
    .map((n) => ({ id: n.id, label: dl(n.label), target: Number(n.props?.target) || 0, current: Number(n.props?.current) || 0 }));

  const vendorSpend = collapsePrivateVendors(
    [...spendByPair.entries()]
      .map(([pair, amount]) => {
        const [bucketId, vendorId] = pair.split(" ");
        return {
          bucketId,
          vendorId,
          vendorLabel: labelOf(vendorId),
          amount,
          memberId: memberOfPair.get(pair) ?? "",
        };
      })
      .filter((v) => keep.has(v.bucketId) && keep.has(v.vendorId))
      .sort((a, b) => b.amount - a.amount),
    {
      privateIds: privateBucketIds(nodes),
      viewerMemberId: privacy.viewerMemberId,
      enabled: Boolean(privacy.redact),
      isOtherMember: (r) => Boolean(r.memberId) && r.memberId !== privacy.viewerMemberId,
    },
  );

  const money: MoneyView = {
    incomes,
    buckets,
    vendorSpend,
    goals,
    totalIncome: incomes.reduce((s, i) => s + i.monthly, 0),
    totalAllocated: buckets.reduce((s, b) => s + b.allocated, 0),
    totalSpent: vendorSpend.reduce((s, v) => s + v.amount, 0),
    txnCount,
  };

  return {
    graph: { nodes: graphNodes, edges: graphEdges },
    money,
    focus,
    focusLabel,
    focusBadge,
    focusId,
    scope,
    groups,
    memberCount: members.length,
    tierMeta,
    roleOptions: ROLE_OPTIONS,
    personas,
  };
}
