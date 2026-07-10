// Admin analytics: roll up page_views + costs + ai_usage into the numbers the
// admin dashboard shows. Server-side only (superuser reads via PocketBase).

import { pbList } from "./pocketbase";

export interface PageView {
  id: string;
  path: string;
  ip: string;
  country: string;
  city: string;
  referrer: string;
  ua: string;
  session: string;
  user: string;
  duration_ms: number;
  created: string;
}

export interface Cost {
  id: string;
  label: string;
  category: string;
  amount: number;
  currency: string;
  vendor: string;
  incurred_on: string;
  note: string;
}

interface AiUsageRow {
  id: string;
  fn: string;
  prompt_tokens: number;
  output_tokens: number;
  total_tokens: number;
  created: string;
}

// Indicative gemini-2.0-flash pricing (USD per token) — flag as an estimate.
const FLASH_IN_PER_TOKEN = 0.1 / 1_000_000;
const FLASH_OUT_PER_TOKEN = 0.4 / 1_000_000;

export interface Analytics {
  totalVisits: number;
  uniqueVisitors: number;
  countries: number;
  avgDurationMs: number;
  topPages: { path: string; count: number; avgMs: number }[];
  topCountries: { country: string; count: number }[];
  topIps: { ip: string; count: number }[];
  recent: PageView[];
  costs: Cost[];
  costByCurrency: { currency: string; total: number }[];
  ai: {
    prompt: number;
    output: number;
    total: number;
    byFn: { fn: string; calls: number; total: number }[];
    estUsd: number;
  };
  totalSpendUsd: number; // USD costs + estimated AI spend
}

function count<T>(items: T[], key: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it) || "—";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function topN(m: Map<string, number>, n: number): { key: string; count: number }[] {
  return [...m.entries()]
    .map(([key, c]) => ({ key, count: c }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export async function getAnalytics(): Promise<Analytics> {
  const [views, costs, usage] = await Promise.all([
    pbList<PageView>("page_views", { sort: "-created", perPage: 500 }),
    pbList<Cost>("costs", { sort: "-incurred_on", perPage: 200 }),
    pbList<AiUsageRow>("ai_usage", { sort: "-created", perPage: 500 }),
  ]);

  const totalVisits = views.length;
  const uniqueVisitors = new Set(views.map((v) => v.session || v.ip || v.id)).size;

  const countryCounts = count(views, (v) => v.country);
  const pageCounts = count(views, (v) => v.path);
  const ipCounts = count(views, (v) => v.ip);

  // avg duration per page (only rows with a recorded duration)
  const durByPath = new Map<string, { sum: number; n: number }>();
  const allDur: number[] = [];
  for (const v of views) {
    const d = Number(v.duration_ms) || 0;
    if (d > 0) {
      allDur.push(d);
      const e = durByPath.get(v.path) ?? { sum: 0, n: 0 };
      e.sum += d;
      e.n += 1;
      durByPath.set(v.path, e);
    }
  }
  const avgDurationMs = allDur.length
    ? Math.round(allDur.reduce((a, b) => a + b, 0) / allDur.length)
    : 0;

  const topPages = topN(pageCounts, 12).map((p) => {
    const d = durByPath.get(p.key);
    return { path: p.key, count: p.count, avgMs: d && d.n ? Math.round(d.sum / d.n) : 0 };
  });

  // costs by currency
  const ccy = new Map<string, number>();
  for (const c of costs) {
    const cur = c.currency || "USD";
    ccy.set(cur, (ccy.get(cur) ?? 0) + (Number(c.amount) || 0));
  }
  const costByCurrency = [...ccy.entries()].map(([currency, total]) => ({
    currency,
    total: Math.round(total * 100) / 100,
  }));

  // AI usage
  let prompt = 0;
  let output = 0;
  let total = 0;
  const fnMap = new Map<string, { calls: number; total: number }>();
  for (const u of usage) {
    prompt += Number(u.prompt_tokens) || 0;
    output += Number(u.output_tokens) || 0;
    total += Number(u.total_tokens) || 0;
    const e = fnMap.get(u.fn) ?? { calls: 0, total: 0 };
    e.calls += 1;
    e.total += Number(u.total_tokens) || 0;
    fnMap.set(u.fn, e);
  }
  const estUsd =
    Math.round((prompt * FLASH_IN_PER_TOKEN + output * FLASH_OUT_PER_TOKEN) * 10000) / 10000;

  const usdCosts = costByCurrency.find((c) => c.currency === "USD")?.total ?? 0;
  const totalSpendUsd = Math.round((usdCosts + estUsd) * 100) / 100;

  return {
    totalVisits,
    uniqueVisitors,
    countries: [...countryCounts.keys()].filter((k) => k && k !== "—").length,
    avgDurationMs,
    topPages,
    topCountries: topN(countryCounts, 12).map((c) => ({ country: c.key, count: c.count })),
    topIps: topN(ipCounts, 12).map((c) => ({ ip: c.key, count: c.count })),
    recent: views.slice(0, 30),
    costs,
    costByCurrency,
    ai: {
      prompt,
      output,
      total,
      byFn: [...fnMap.entries()].map(([fn, e]) => ({ fn, calls: e.calls, total: e.total })),
      estUsd,
    },
    totalSpendUsd,
  };
}
