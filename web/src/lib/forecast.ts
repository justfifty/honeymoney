// "Sees It Coming" — the warning, not the report.
//
// The projection in lib/projection.ts already answers "where will the month end
// up". That is still a post-mortem written in advance: it tells a household the
// size of the hole without telling them when they fall in or what closes it.
//
// This module answers the two questions that actually change a decision:
//   • WHEN does the plan run dry, at this pace?      → shortfallDay
//   • WHAT single change closes the gap?             → fix
//
// Pure, over the MoneyView the caller already loaded. No queries, no AI — so the
// warning survives an unconfigured provider and an offline day.

import { PRIVATE_TIER } from "./privacy";
import type { MoneyView } from "./moneyView";

export interface ForecastFix {
  /** Vendor label(s) to cut back on — never a private-bucket vendor. */
  labels: string[];
  /** RM reduction over the rest of the month that closes the gap. */
  amount: number;
}

export interface Forecast {
  /** Day-of-month the allocated plan is exhausted, if that falls inside the month. */
  shortfallDay: number | null;
  shortfallDate: Date | null;
  /** RM the month is projected to end over plan. 0 when inside plan. */
  gap: number;
  dailyBurn: number;
  /** RM/day that would still land the month exactly on plan. */
  safeDailySpend: number;
  daysLeft: number;
  fix: ForecastFix | null;
}

const round = (v: number) => Math.round(v * 100) / 100;

function monthWindow(asOf: Date) {
  const daysInMonth = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0).getDate();
  const elapsed = Math.max(1, asOf.getDate());
  return { daysInMonth, elapsed, daysLeft: Math.max(0, daysInMonth - elapsed) };
}

/**
 * Which vendor to name in the fix. Deliberately excludes Must-paid (tier 1) —
 * "spend less on rent" is not advice a household can act on this month — and
 * excludes private buckets, because naming a partner's personal vendor would
 * breach the tier-3 promise through the back door (see lib/privacy.ts).
 */
function pickFix(money: MoneyView, gap: number): ForecastFix | null {
  if (gap <= 0) return null;

  const tierOf = new Map(money.buckets.map((b) => [b.bucket_id, b.tier]));
  const candidates = money.vendorSpend
    .filter((v) => {
      const tier = tierOf.get(v.bucketId);
      return tier !== undefined && tier !== 1 && tier !== PRIVATE_TIER;
    })
    .sort((a, b) => b.amount - a.amount);

  if (candidates.length === 0) return null;

  // Only claim one change fixes it if that change is actually big enough to.
  // Otherwise name the two largest, so the number stays honest.
  const top = candidates[0];
  if (top.amount >= gap || candidates.length === 1) {
    return { labels: [top.vendorLabel], amount: round(gap) };
  }
  return { labels: [top.vendorLabel, candidates[1].vendorLabel], amount: round(gap) };
}

export function computeForecast(money: MoneyView, asOf: Date = new Date()): Forecast {
  const { daysInMonth, elapsed, daysLeft } = monthWindow(asOf);

  const totalAllocated = money.buckets.reduce((s, b) => s + b.allocated, 0);
  const totalProjected = money.buckets.reduce((s, b) => s + b.projected_spend, 0);
  const spent = money.totalSpent;

  const dailyBurn = spent / elapsed;
  const gap = round(Math.max(0, totalProjected - totalAllocated));

  // The day the plan is exhausted at the current pace. Only meaningful while the
  // household is still burning money and the crossing lands inside this month —
  // "short by the 47th" is not a warning, it's a bug.
  let shortfallDay: number | null = null;
  if (dailyBurn > 0 && totalAllocated > 0) {
    const day = Math.ceil(totalAllocated / dailyBurn);
    if (day <= daysInMonth && day >= elapsed) shortfallDay = day;
    // Already past it: the plan is spent and the month isn't over.
    else if (day < elapsed) shortfallDay = elapsed;
  }

  const remainingBudget = Math.max(0, totalAllocated - spent);
  const safeDailySpend = daysLeft > 0 ? round(remainingBudget / daysLeft) : 0;

  return {
    shortfallDay,
    shortfallDate: shortfallDay ? new Date(asOf.getFullYear(), asOf.getMonth(), shortfallDay) : null,
    gap,
    dailyBurn: round(dailyBurn),
    safeDailySpend,
    daysLeft,
    fix: pickFix(money, gap),
  };
}

/** Is there anything worth warning about? Keeps the callers' conditions honest. */
export function hasWarning(f: Forecast): boolean {
  return f.gap > 0 && f.shortfallDay !== null;
}

/**
 * The English ordinal for the shortfall day ("24th"). Used only by the English
 * copy path and the Telegram nudge; the localised UI interpolates the plain
 * number into a per-language sentence instead.
 */
export function ordinal(day: number): string {
  const rem100 = day % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${day}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[day % 10] ?? "th";
  return `${day}${suffix}`;
}
