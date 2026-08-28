// Subscription & bill radar: find recurring charges in the transaction history —
// same vendor, similar amount, at a regular cadence — so the household sees its
// subscriptions and upcoming bills in one place ("money found"). Read-only
// heuristics over the graph; no AI needed, so it always works.

import { pbStr, pbListAll } from "./pocketbase";
import { inHouseholdTotals } from "./attribution";

const round = (v: number) => Math.round(v * 100) / 100;

interface Txn {
  amount: number;
  occurred_at: string;
  vendor_node: string;
  expand?: { vendor_node?: { label: string } };
}

export interface Recurring {
  vendor: string;
  amount: number; // typical (median) amount
  count: number;
  cadenceDays: number; // median interval between charges
  lastSeen: string; // ISO
  nextLikely: string; // ISO
}

export async function detectRecurring(
  tenantId: string,
  asOf: Date = new Date(),
): Promise<{ items: Recurring[]; monthlyTotal: number }> {
  const since = new Date(asOf.getTime() - 150 * 86_400_000).toISOString().replace("T", " ");
  const txns = await pbListAll<Txn>("transactions", {
    filter: `tenant = ${pbStr(tenantId)} && occurred_at >= ${pbStr(since)} && vendor_node != '' && ${inHouseholdTotals}`,
    sort: "occurred_at",
    expand: "vendor_node",
  });

  const byVendor = new Map<string, { amount: number; date: Date }[]>();
  for (const t of txns) {
    const label = t.expand?.vendor_node?.label;
    if (!label) continue;
    const list = byVendor.get(label) ?? [];
    list.push({ amount: Math.abs(Number(t.amount)), date: new Date(t.occurred_at.replace(" ", "T")) });
    byVendor.set(label, list);
  }

  const items: Recurring[] = [];
  for (const [vendor, list] of byVendor) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Similar amounts only (a subscription is steady) — median ± 15%.
    const amounts = list.map((x) => x.amount).sort((a, b) => a - b);
    const medAmt = amounts[Math.floor(amounts.length / 2)];
    const steady = list.filter((x) => Math.abs(x.amount - medAmt) <= medAmt * 0.15);
    if (steady.length < 2) continue;

    // Regular cadence: median gap between weekly and quarterly-ish.
    const gaps: number[] = [];
    for (let i = 1; i < steady.length; i++) {
      gaps.push((steady[i].date.getTime() - steady[i - 1].date.getTime()) / 86_400_000);
    }
    gaps.sort((a, b) => a - b);
    const medGap = gaps[Math.floor(gaps.length / 2)];
    if (medGap < 6 || medGap > 95) continue;

    const last = steady[steady.length - 1].date;
    items.push({
      vendor,
      amount: round(medAmt),
      count: steady.length,
      cadenceDays: Math.round(medGap),
      lastSeen: last.toISOString(),
      nextLikely: new Date(last.getTime() + medGap * 86_400_000).toISOString(),
    });
  }

  items.sort((a, b) => b.amount / b.cadenceDays - a.amount / a.cadenceDays);
  const monthlyTotal = round(items.reduce((s, i) => s + i.amount * (30 / Math.max(1, i.cadenceDays)), 0));
  return { items, monthlyTotal };
}
