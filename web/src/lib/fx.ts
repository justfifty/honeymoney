// Live foreign-exchange rates, with the source recorded for every single rate.
//
// Why not OANDA: OANDA's rate feed requires a paid fxTrade/Exchange-Rates
// account, and this app's whole premise is RM 0 + local-first. Instead we use
// two free, citable, no-key official sources and fall back gracefully:
//
//   1. Bank Negara Malaysia (BNM) Open API — the Malaysian central bank's own
//      published rates. Authoritative for a Malaysian product, and the right
//      thing to cite to a Malaysian judge.
//   2. European Central Bank, via Frankfurter — covers what BNM doesn't.
//   3. The last rate we successfully stored in PocketBase (works offline).
//   4. The hard-coded indicative table in format.ts (never leaves the user
//      stuck, but is always labelled "indicative", never passed off as live).
//
// Each currency independently records which of those four it came from, so the
// UI can show "SGD · Bank Negara Malaysia · 14 Jul 2026" and mean it.
// To swap in OANDA later, add a provider here — nothing else changes.

import { pbCreate, pbList, pbStr } from "./pocketbase";
import { isPocketBaseConfigured } from "./config";
import { CURRENCIES, type RateTable, type RateSource } from "./format";

const BASE = "MYR";
const CACHE_MS = 6 * 60 * 60 * 1000; // 6h — central banks publish at most daily
const FETCH_TIMEOUT_MS = 4000;

export const SOURCE_LABEL: Record<RateSource, string> = {
  bnm: "Bank Negara Malaysia",
  ecb: "European Central Bank",
  cache: "Last known rate (offline)",
  indicative: "Indicative — not live",
};

export const SOURCE_URL: Record<RateSource, string> = {
  bnm: "https://www.bnm.gov.my/exchange-rates",
  ecb: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
  cache: "",
  indicative: "",
};

let memo: { table: RateTable; at: number } | null = null;
// One refresh in flight at a time, shared by every concurrent request. Without
// it, a burst of cold requests each opened its own pair of provider calls.
let inflight: Promise<RateTable> | null = null;
// Best table assembled so far by the in-flight refresh — what a cold render
// falls back to when its budget runs out, instead of the indicative table.
let partial: RateTable | null = null;

// How long a COLD render (no memo at all) is allowed to wait on the central
// banks before it gives up and renders the indicative table. BNM measures
// 400 ms-1 s and the timeout below is 4 s, so this is the difference between a
// first page view that takes a beat and one that takes five seconds. Whatever
// the refresh finds still lands in the memo for the very next request.
const COLD_WAIT_MS = Number(process.env.FX_COLD_WAIT_MS ?? 700);

const QUOTES = CURRENCIES.map((c) => c.code).filter((c) => c !== BASE);

async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

// ── Provider 1: Bank Negara Malaysia ────────────────────────────────────────
// BNM quotes MYR *per `unit` of foreign currency* (e.g. 100 THB = 12.9 MYR), so
// invert to get our convention: 1 MYR = `perMYR` foreign units.
interface BnmRow {
  currency_code: string;
  unit: number;
  rate: { date: string; middle_rate: number } | null;
}

async function fetchBNM(): Promise<Partial<RateTable>> {
  const res = await timedFetch("https://api.bnm.gov.my/public/exchange-rate?session=1200&quote=rm", {
    headers: { Accept: "application/vnd.BNM.API.v1+json" },
  });
  if (!res.ok) throw new Error(`BNM ${res.status}`);
  const json = (await res.json()) as { data?: BnmRow[] };
  const out: Partial<RateTable> = {};
  for (const row of json.data ?? []) {
    const code = row.currency_code?.toUpperCase();
    const mid = row.rate?.middle_rate;
    if (!code || !QUOTES.includes(code) || !mid || !row.unit) continue;
    // mid MYR buys `unit` of foreign → 1 MYR buys unit/mid
    const perMYR = row.unit / mid;
    if (!Number.isFinite(perMYR) || perMYR <= 0) continue;
    out[code] = {
      perMYR,
      source: "bnm",
      sourceUrl: SOURCE_URL.bnm,
      asOf: row.rate?.date ?? "",
    };
  }
  return out;
}

// ── Provider 2: ECB via Frankfurter ─────────────────────────────────────────
// Frankfurter already quotes "units of X per 1 base", which is our convention.
async function fetchECB(): Promise<Partial<RateTable>> {
  const url = `https://api.frankfurter.dev/v1/latest?base=${BASE}&symbols=${QUOTES.join(",")}`;
  const res = await timedFetch(url);
  if (!res.ok) throw new Error(`ECB ${res.status}`);
  const json = (await res.json()) as { date?: string; rates?: Record<string, number> };
  const out: Partial<RateTable> = {};
  for (const [code, perMYR] of Object.entries(json.rates ?? {})) {
    if (!QUOTES.includes(code) || !Number.isFinite(perMYR) || perMYR <= 0) continue;
    out[code] = {
      perMYR,
      source: "ecb",
      sourceUrl: SOURCE_URL.ecb,
      asOf: json.date ?? "",
    };
  }
  return out;
}

// ── Provider 3: last known good, from our own cache table ───────────────────
async function fetchCached(): Promise<Partial<RateTable>> {
  if (!isPocketBaseConfigured()) return {};
  const rows = await pbList<{
    quote: string;
    rate: number;
    source: string;
    source_url: string;
    as_of: string;
  }>("fx_rates", {
    filter: `base = ${pbStr(BASE)}`,
    sort: "-fetched_at",
    perPage: 200,
  });
  const out: Partial<RateTable> = {};
  for (const r of rows) {
    if (out[r.quote]) continue; // rows are newest-first, so the first wins
    if (!Number.isFinite(r.rate) || r.rate <= 0) continue;
    out[r.quote] = {
      perMYR: r.rate,
      // it *was* live once; label it honestly as a stale copy of that source
      source: "cache",
      sourceUrl: r.source_url || "",
      asOf: r.as_of || "",
      staleFrom: (r.source as RateSource) || undefined,
    };
  }
  return out;
}

// ── Provider 4: the indicative table shipped in the code ────────────────────
function staticTable(): RateTable {
  const out = {} as RateTable;
  for (const c of CURRENCIES) {
    out[c.code] = {
      perMYR: c.perMYR,
      source: "indicative",
      sourceUrl: "",
      asOf: "",
    };
  }
  return out;
}

async function persist(table: RateTable): Promise<void> {
  if (!isPocketBaseConfigured()) return;
  const now = new Date().toISOString().replace("T", " ");
  await Promise.all(
    Object.entries(table)
      // never write our own fallbacks back into the cache — that would launder
      // an indicative rate into something that later looks like a real one
      .filter(([, r]) => r.source === "bnm" || r.source === "ecb")
      .map(([quote, r]) =>
        pbCreate("fx_rates", {
          base: BASE,
          quote,
          rate: r.perMYR,
          source: r.source,
          source_url: r.sourceUrl,
          as_of: r.asOf ? `${r.asOf} 00:00:00.000Z` : now,
          fetched_at: now,
        }).catch(() => undefined),
      ),
  );
}

export interface RatesResult {
  table: RateTable;
  fetchedAt: string;
  /** Distinct sources actually used, for the "Rates from …" footnote. */
  sources: RateSource[];
  live: boolean;
}

// Merge all providers, best-source-first, one currency at a time. Single-flight:
// concurrent callers share one refresh rather than each opening their own.
function refresh(): Promise<RateTable> {
  if (inflight) return inflight;
  inflight = (async () => {
    // Each provider merges into `partial` the instant IT settles, rather than
    // everything waiting on the slowest. That matters for the cold path below:
    // the ECB feed measures ~30-450 ms and BNM ~400-1000 ms, so a first render
    // that gave up on the whole batch got the indicative table even though a
    // real one had already arrived.
    const rank: Record<string, number> = { indicative: 0, cache: 1, ecb: 2, bnm: 3 };
    const merge = (src: Partial<RateTable>) => {
      const next = { ...(partial ?? staticTable()) };
      for (const [code, rate] of Object.entries(src)) {
        // Providers land in arbitrary order, so compare by authority rather
        // than by arrival — otherwise a slow ECB could overwrite BNM.
        if (rate && rank[rate.source] >= rank[next[code]?.source ?? "indicative"]) {
          next[code] = rate;
        }
      }
      next[BASE] = { perMYR: 1, source: "bnm", sourceUrl: SOURCE_URL.bnm, asOf: "" };
      partial = next;
    };
    partial = staticTable();

    const [bnm, ecb, cached] = await Promise.all([
      fetchBNM().then((r) => (merge(r), r)).catch(() => ({}) as Partial<RateTable>),
      fetchECB().then((r) => (merge(r), r)).catch(() => ({}) as Partial<RateTable>),
      fetchCached().then((r) => (merge(r), r)).catch(() => ({}) as Partial<RateTable>),
    ]);

    const table = staticTable();
    // lowest priority first — each better source overwrites the last
    for (const src of [cached, ecb, bnm]) {
      for (const [code, rate] of Object.entries(src)) {
        if (rate) table[code] = rate;
      }
    }
    table[BASE] = { perMYR: 1, source: "bnm", sourceUrl: SOURCE_URL.bnm, asOf: "" };

    const gotLive = Object.values(table).some((r) => r.source === "bnm" || r.source === "ecb");
    // NOT awaited. Writing ~12 rows to PocketBase is bookkeeping for the NEXT
    // cold start; making the page that triggered it wait for those writes to
    // land put a dozen round trips in front of the user's first paint.
    if (gotLive) void persist(table).catch(() => undefined);

    memo = { table, at: Date.now() };
    return table;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/**
 * Rates for rendering, with a hard rule: this is called from the ROOT LAYOUT, so
 * whatever it costs is paid by every page of the app before anything appears.
 *
 * Three cases, cheapest first:
 *   • Fresh memo      → returned instantly, no network at all.
 *   • Stale memo      → the stale table is returned INSTANTLY and the refresh
 *                       runs behind it (stale-while-revalidate). Rates that are
 *                       a few hours old are the correct trade against making
 *                       somebody wait to see their own balance; central banks
 *                       publish at most daily.
 *   • No memo (cold)  → wait, but only up to COLD_WAIT_MS. Past that the
 *                       indicative table renders — labelled "indicative", as it
 *                       always has been — and the refresh finishes in the
 *                       background so the next request is live.
 *
 * `force` (used by the /api/fx refresh path) still waits for the real thing.
 */
export async function getRates(opts: { force?: boolean } = {}): Promise<RatesResult> {
  if (opts.force) {
    const table = await refresh();
    return summarize(table, new Date().toISOString());
  }

  if (memo) {
    const age = Date.now() - memo.at;
    if (age >= CACHE_MS) void refresh().catch(() => undefined); // revalidate behind the response
    return summarize(memo.table, new Date(memo.at).toISOString());
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const table = await Promise.race([
      refresh().catch(() => partial ?? staticTable()),
      new Promise<RateTable>((resolve) => {
        timer = setTimeout(() => resolve(partial ?? staticTable()), COLD_WAIT_MS);
      }),
    ]);
    return summarize(table, new Date().toISOString());
  } finally {
    // Losing timer cleared, or it would hold the event loop open past the
    // response for as long as the budget lasts.
    if (timer) clearTimeout(timer);
  }
}

function summarize(table: RateTable, fetchedAt: string): RatesResult {
  const sources = [...new Set(Object.values(table).map((r) => r.source))];
  return {
    table,
    fetchedAt,
    sources,
    live: sources.includes("bnm") || sources.includes("ecb"),
  };
}
