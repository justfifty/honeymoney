// Read path: bucket projection + recent spend + the "Honey" insight.
// PocketBase edition — the recursive allocation walk that Postgres did in
// bucket_projection() (see supabase/migrations/) is implemented here in TS.
// Falls back to a deterministic rule-based insight when Gemini is unconfigured.

import { pbList, pbStr } from "./pocketbase";
import { isGeminiConfigured } from "./config";
import { honeyInsight } from "./gemini";
import { t, type Locale } from "./i18n";
import { dataLabel } from "./dataLabels";
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
  wallet_node: string;
  vendor_node: string;
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
    pbList<PBNode>("nodes", { filter: `tenant = ${pbStr(tenantId)}` }),
    pbList<PBEdge>("edges", { filter: `tenant = ${pbStr(tenantId)}` }),
    pbList<PBTransaction>("transactions", {
      filter: `tenant = ${pbStr(tenantId)} && occurred_at >= ${pbStr(startStr)}`,
    }),
  ]);

  const allocated = computeAllocations(nodes, edges);

  const mtd = new Map<string, number>();
  for (const t of txns) {
    if (!t.wallet_node) continue;
    mtd.set(t.wallet_node, (mtd.get(t.wallet_node) ?? 0) + Number(t.amount));
  }

  return projectBuckets(nodes, allocated, mtd, asOf);
}

// Pure projection: given buckets (as nodes), their allocations, and month-to-date
// spend per bucket, produce the status-annotated projection. Factored out so the
// focus lens can pass member-filtered spend through the same math.
export function projectBuckets(
  nodes: Array<{ id: string; kind: string; label: string }>,
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
  amount: number;
  currency: string;
  occurred_at: string;
  vendor: string | null;
  source: string | null;
}

export async function getRecentSpend(
  tenantId: string,
  limit = 8,
): Promise<RecentSpend[]> {
  const txns = await pbList<PBTransaction>("transactions", {
    filter: `tenant = ${pbStr(tenantId)}`,
    sort: "-occurred_at",
    expand: "vendor_node",
    perPage: limit,
  });
  return txns.map((t) => ({
    id: t.id,
    amount: Number(t.amount),
    currency: t.currency || "MYR",
    occurred_at: t.occurred_at,
    vendor: t.expand?.vendor_node?.label ?? null,
    source: t.source || null,
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
function ruleBasedInsight(projection: BucketProjection[], locale: Locale): string {
  const over = projection.filter((b) => b.status === "over_budget");
  const risk = projection.filter((b) => b.status === "at_risk");

  if (over.length > 0) {
    const b = over[0];
    const gap = Math.abs(b.projected_balance);
    return t(locale, "honey.over", { bucket: dataLabel(locale, b.bucket_label), gap: gap.toFixed(0), alloc: b.allocated });
  }
  if (risk.length > 0) {
    const b = risk[0];
    return t(locale, "honey.risk", { bucket: dataLabel(locale, b.bucket_label), alloc: b.allocated });
  }
  return t(locale, "honey.ontrack");
}

export async function getHoneyInsight(
  projection: BucketProjection[],
  locale: Locale = "en",
): Promise<{ text: string; source: "gemini" | "rule-based" }> {
  if (!isGeminiConfigured()) {
    return { text: ruleBasedInsight(projection, locale), source: "rule-based" };
  }
  try {
    const text = await honeyInsight(buildContext(projection), locale);
    return { text, source: "gemini" };
  } catch {
    return { text: ruleBasedInsight(projection, locale), source: "rule-based" };
  }
}
