// Records / time-schedule read path: list a tenant's transactions over a date
// range and roll them up by day / week / month for spending audit + review.
// Server-side only (uses the PocketBase superuser client).

import { pbList, pbStr } from "./pocketbase";

export interface SpendRecord {
  id: string;
  amount: number; // base currency (MYR)
  currency: string;
  occurred_at: string; // ISO
  vendor: string | null;
  source: string | null;
}

export type Period = "day" | "week" | "month";

export interface PeriodGroup {
  key: string; // stable id, e.g. "2026-07-10"
  label: string; // human label, e.g. "Fri, 10 Jul"
  sortTs: number; // period-start epoch ms (desc sort)
  total: number; // sum of amounts (MYR)
  count: number;
  records: SpendRecord[];
}

interface PBTxn {
  id: string;
  amount: number;
  currency: string;
  occurred_at: string;
  source: string;
  expand?: { vendor_node?: { label: string } };
}

// PocketBase stores datetimes as "YYYY-MM-DD HH:MM:SS.sssZ" — match projection.ts.
function pbTime(d: Date): string {
  return d.toISOString().replace("T", " ");
}

// Named ranges → [from, to]. "all" reaches back far enough to catch any seed.
export function rangeBounds(range: string, now = new Date()): { from: Date; to: Date } {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); // end of today
  const from = new Date(to);
  switch (range) {
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
    case "365d":
      from.setDate(from.getDate() - 365);
      break;
    case "all":
      from.setFullYear(2000, 0, 1);
      break;
    case "90d":
    default:
      from.setDate(from.getDate() - 90);
  }
  return { from, to };
}

export async function getSpendRecords(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<SpendRecord[]> {
  const filter =
    `tenant = ${pbStr(tenantId)} && ` +
    `occurred_at >= ${pbStr(pbTime(from))} && occurred_at <= ${pbStr(pbTime(to))}`;
  const txns = await pbList<PBTxn>("transactions", {
    filter,
    sort: "-occurred_at",
    expand: "vendor_node",
    perPage: 500,
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

// Monday-based week start (local time).
function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Mon=0 … Sun=6
  x.setDate(x.getDate() - dow);
  return x;
}

function periodStart(d: Date, period: Period): Date {
  if (period === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  if (period === "week") return startOfWeek(d);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function periodLabel(start: Date, period: Period): string {
  if (period === "month") {
    return start.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
  }
  if (period === "week") {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const a = start.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
    const b = end.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
    return `${a} – ${b}`;
  }
  return start.toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" });
}

// Group records into period buckets, newest first, records within newest first.
export function groupByPeriod(records: SpendRecord[], period: Period): PeriodGroup[] {
  const groups = new Map<string, PeriodGroup>();
  for (const r of records) {
    const d = new Date(r.occurred_at);
    if (Number.isNaN(d.getTime())) continue;
    const start = periodStart(d, period);
    const key = start.toISOString();
    let g = groups.get(key);
    if (!g) {
      g = { key, label: periodLabel(start, period), sortTs: start.getTime(), total: 0, count: 0, records: [] };
      groups.set(key, g);
    }
    g.total += r.amount;
    g.count += 1;
    g.records.push(r);
  }
  const out = [...groups.values()];
  out.sort((a, b) => b.sortTs - a.sortTs);
  for (const g of out) g.total = Math.round(g.total * 100) / 100;
  return out;
}

export interface RecordsSummary {
  total: number;
  count: number;
  periods: number;
  busiest: { label: string; total: number } | null;
}

export function summarize(groups: PeriodGroup[]): RecordsSummary {
  const total = Math.round(groups.reduce((s, g) => s + g.total, 0) * 100) / 100;
  const count = groups.reduce((s, g) => s + g.count, 0);
  const busiest = groups.reduce<PeriodGroup | null>(
    (top, g) => (!top || g.total > top.total ? g : top),
    null,
  );
  return {
    total,
    count,
    periods: groups.length,
    busiest: busiest ? { label: busiest.label, total: busiest.total } : null,
  };
}
