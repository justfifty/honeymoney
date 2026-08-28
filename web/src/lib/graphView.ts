// Read model for the knowledge-graph visualization (/graph page):
// nodes grouped by role + edges with their monthly RM flow.

import { pbListAll, pbStr } from "./pocketbase";
import { countsAsSpend } from "./recordKind";

export interface GNode {
  id: string;
  kind: string;
  label: string;
  props: Record<string, unknown> | null;
}

export interface GEdge {
  id: string;
  src_node: string;
  dst_node: string;
  rel: string;
  amount: number;
  percentage: number;
  valid_to: string;
}

export interface GraphView {
  nodes: GNode[];
  edges: Array<{
    src: string;
    dst: string;
    rel: string;
    flow: number; // RM this month (allocation amount or month-to-date spend)
    label: string;
  }>;
}

export async function getGraphView(tenantId: string): Promise<GraphView> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const startStr = monthStart.toISOString().replace("T", " ");

  const [nodes, edges, txns] = await Promise.all([
    pbListAll<GNode>("nodes", { filter: `tenant = ${pbStr(tenantId)}` }),
    pbListAll<GEdge>("edges", { filter: `tenant = ${pbStr(tenantId)}` }),
    pbListAll<{
      wallet_node: string;
      vendor_node: string;
      amount: number;
      direction?: string;
      voided?: boolean;
      kind?: string | null;
    }>("transactions", {
      filter: `tenant = ${pbStr(tenantId)} && occurred_at >= ${pbStr(startStr)}`,
    }),
  ]);

  const income = nodes.filter((n) => n.kind === "income_source");
  const monthlyOf = (id: string) =>
    Number(income.find((n) => n.id === id)?.props?.monthly_amount) || 0;

  // month-to-date spend per wallet->vendor pair
  const spendByPair = new Map<string, number>();
  for (const t of txns) {
    if (!t.wallet_node || !t.vendor_node) continue;
    // Was missing entirely: this map summed EVERY row, so an inflow was drawn as
    // spend and a voided record was counted as money gone. See countsAsSpend().
    if (!countsAsSpend(t)) continue;
    const key = `${t.wallet_node}→${t.vendor_node}`;
    spendByPair.set(key, (spendByPair.get(key) ?? 0) + Number(t.amount));
  }

  const out: GraphView["edges"] = [];
  for (const e of edges) {
    if (e.valid_to) continue; // only active edges
    if (e.rel === "ALLOCATES_FIXED" || e.rel === "FUNDS") {
      out.push({
        src: e.src_node, dst: e.dst_node, rel: e.rel,
        flow: e.amount || 0,
        label: `RM ${(e.amount || 0).toLocaleString()}`,
      });
    } else if (e.rel === "ALLOCATES_PCT") {
      const flow = (monthlyOf(e.src_node) * (e.percentage || 0)) / 100;
      out.push({
        src: e.src_node, dst: e.dst_node, rel: e.rel,
        flow,
        label: `${e.percentage}% ≈ RM ${flow.toLocaleString()}`,
      });
    } else if (e.rel === "SPENT_AT") {
      const flow = spendByPair.get(`${e.src_node}→${e.dst_node}`) ?? 0;
      out.push({
        src: e.src_node, dst: e.dst_node, rel: e.rel,
        flow,
        label: flow > 0 ? `RM ${flow.toLocaleString()} mtd` : "linked",
      });
    } else if (e.rel === "CONTRIBUTES_TO" || e.rel === "OWES") {
      out.push({ src: e.src_node, dst: e.dst_node, rel: e.rel, flow: 0, label: e.rel.toLowerCase().replace("_", " ") });
    }
  }

  // spending pairs that exist as transactions but have no explicit edge yet
  for (const [key, flow] of spendByPair) {
    const [src, dst] = key.split("→");
    if (!out.some((e) => e.src === src && e.dst === dst && e.rel === "SPENT_AT")) {
      out.push({ src, dst, rel: "SPENT_AT", flow, label: `RM ${flow.toLocaleString()} mtd` });
    }
  }

  return { nodes, edges: out };
}
