export function rm(amount: number): string {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(amount);
}

// ── Multi-currency display ────────────────────────────────────────────────
// Stored/seed amounts are in the tenant's base currency (MYR). A display
// currency converts from that base and formats in the currency's own locale.
//
// The `perMYR` numbers below are the *fallback of last resort* — they are only
// used when no live rate can be obtained. At runtime lib/fx.ts fetches real
// rates (Bank Negara Malaysia, then ECB) and calls applyRates() to override
// them, so the UI can name the source of every figure it shows.
export interface CurrencyDef {
  code: string;
  symbol: string;
  locale: string;
  perMYR: number; // 1 MYR ≈ this many units of the currency
  zeroDp?: boolean;
}

export type RateSource = "bnm" | "ecb" | "cache" | "indicative";

export interface Rate {
  perMYR: number;
  source: RateSource;
  sourceUrl: string;
  asOf: string; // the rate's own publication date, "" if unknown
  /** For source: "cache" — which live source it originally came from. */
  staleFrom?: RateSource;
}

export type RateTable = Record<string, Rate>;

export const CURRENCIES: CurrencyDef[] = [
  { code: "MYR", symbol: "RM", locale: "en-MY", perMYR: 1 },
  { code: "SGD", symbol: "S$", locale: "en-SG", perMYR: 0.30 },
  { code: "THB", symbol: "฿", locale: "th-TH", perMYR: 7.7 },
  { code: "CNY", symbol: "¥", locale: "zh-CN", perMYR: 1.55 },
  { code: "HKD", symbol: "HK$", locale: "zh-HK", perMYR: 1.73 },
  { code: "TWD", symbol: "NT$", locale: "zh-TW", perMYR: 7.1, zeroDp: true },
  { code: "JPY", symbol: "¥", locale: "ja-JP", perMYR: 34, zeroDp: true },
  { code: "USD", symbol: "$", locale: "en-US", perMYR: 0.22 },
  { code: "GBP", symbol: "£", locale: "en-GB", perMYR: 0.17 },
];

export type CurrencyCode = string;
const CCY_BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

// The rate table in force for this process/tab. Starts as the indicative
// fallback and is replaced by applyRates() once live rates land — on the server
// from the root layout, in the browser from <FxRates>. Rates are global (not
// per-user), so a module-level table is safe to share across requests.
let activeRates: RateTable = Object.fromEntries(
  CURRENCIES.map((c) => [
    c.code,
    { perMYR: c.perMYR, source: "indicative" as RateSource, sourceUrl: "", asOf: "" },
  ]),
);

export function applyRates(table: RateTable): void {
  activeRates = { ...activeRates, ...table };
}

export function rateFor(code: string): Rate {
  return activeRates[code] ?? activeRates.MYR;
}

export function normalizeCurrency(code?: string): CurrencyCode {
  return code && CCY_BY_CODE.has(code) ? code : "MYR";
}

// Convert an amount entered in `code` back to the base currency (MYR) for
// storage, so the graph math stays in one currency.
export function toMYR(amount: number, code: string): number {
  return Math.round((amount / rateFor(code).perMYR) * 100) / 100;
}

// Convert a base-MYR amount out to a display currency.
export function fromMYR(amountMYR: number, code: string): number {
  return Math.round(amountMYR * rateFor(code).perMYR * 100) / 100;
}

export function symbolOf(code: string): string {
  return (CCY_BY_CODE.get(code) ?? CURRENCIES[0]).symbol;
}

// Format a base-MYR amount in the chosen currency. `round` drops decimals for
// compact chart labels; JPY is always whole.
export function fmtMoney(amountMYR: number, code: string, opts: { round?: boolean } = {}): string {
  const c = CCY_BY_CODE.get(code) ?? CURRENCIES[0];
  const value = amountMYR * rateFor(c.code).perMYR;
  const dp = c.zeroDp || opts.round ? 0 : 2;
  return new Intl.NumberFormat(c.locale, {
    style: "currency",
    currency: c.code,
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(value);
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

export const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  on_track: { label: "On track", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  at_risk: { label: "At risk", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  over_budget: { label: "Over budget", cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
  unfunded: { label: "Unfunded", cls: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400" },
};
