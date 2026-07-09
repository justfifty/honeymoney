export function rm(amount: number): string {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(amount);
}

// ── Multi-currency display ────────────────────────────────────────────────
// Stored/seed amounts are in the tenant's base currency (MYR). A display
// currency converts from that base at an approximate reference rate and formats
// in the currency's own locale. Rates are indicative (not live FX) — good enough
// to show the app works across currencies; flag "≈" in the UI.
export interface CurrencyDef {
  code: string;
  symbol: string;
  locale: string;
  perMYR: number; // 1 MYR ≈ this many units of the currency
  zeroDp?: boolean;
}

export const CURRENCIES: CurrencyDef[] = [
  { code: "MYR", symbol: "RM", locale: "en-MY", perMYR: 1 },
  { code: "SGD", symbol: "S$", locale: "en-SG", perMYR: 0.30 },
  { code: "THB", symbol: "฿", locale: "th-TH", perMYR: 7.7 },
  { code: "CNY", symbol: "¥", locale: "zh-CN", perMYR: 1.55 },
  { code: "JPY", symbol: "¥", locale: "ja-JP", perMYR: 34, zeroDp: true },
  { code: "USD", symbol: "$", locale: "en-US", perMYR: 0.22 },
  { code: "GBP", symbol: "£", locale: "en-GB", perMYR: 0.17 },
];

export type CurrencyCode = string;
const CCY_BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function normalizeCurrency(code?: string): CurrencyCode {
  return code && CCY_BY_CODE.has(code) ? code : "MYR";
}

// Convert an amount entered in `code` back to the base currency (MYR) for
// storage, so the graph math stays in one currency.
export function toMYR(amount: number, code: string): number {
  const c = CCY_BY_CODE.get(code) ?? CURRENCIES[0];
  return Math.round((amount / c.perMYR) * 100) / 100;
}

export function symbolOf(code: string): string {
  return (CCY_BY_CODE.get(code) ?? CURRENCIES[0]).symbol;
}

// Format a base-MYR amount in the chosen currency. `round` drops decimals for
// compact chart labels; JPY is always whole.
export function fmtMoney(amountMYR: number, code: string, opts: { round?: boolean } = {}): string {
  const c = CCY_BY_CODE.get(code) ?? CURRENCIES[0];
  const value = amountMYR * c.perMYR;
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
