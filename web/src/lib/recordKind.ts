// Record kinds — the three-way model behind the two buttons.
//
// Task 1 of the 2026-08-22 brief. The user sees `+` and `−`. Underneath there
// are THREE kinds, because two is not enough to describe household money
// honestly:
//
//   outflow   money leaving the household        − Must-paid, − Spendings, − Others
//   inflow    money entering the household       + Income, + Others
//   transfer  money moving WITHIN the household  + Savings, and partner ↔ partner
//
// The distinction that matters is the third one. A savings deposit is not
// income: the household is not richer for having moved RM500 from one pocket to
// another, and counting it as income would inflate every ratio built on income —
// savings rate, essential burden, debt service, all of them. Equally, paying a
// partner back RM200 is not spending: at household level it nets to zero, and a
// Sankey that draws it as money leaving shows money disappearing that never left.
//
// The user is never asked "is this a transfer?". It is INFERRED from where the
// money is going, which is the whole reason the two-button design works.

import { PRIVATE_TIER } from "./privacy";

export type RecordKind = "inflow" | "outflow" | "transfer";
export type Sign = "in" | "out";

/** Bucket tiers, named. 1 = must-paid, 2 = savings, 3 = spendings/personal. */
export const MUST_PAID_TIER = 1;
export const SAVINGS_TIER = 2;
export const SPENDINGS_TIER = 3;

/**
 * The categories behind each button.
 *
 * `Others` appears on BOTH sides and must never share a key. `income_other` and
 * `expense_other` are distinct on purpose: they are opposite directions of money
 * flow, and a single `other` bucket would make "what came in that I can't
 * classify" and "what went out that I can't classify" indistinguishable forever.
 * Splitting them later means migrating every row that used the shared key and
 * guessing which side each belonged to — cheap now, painful then.
 */
export const PLUS_CATEGORIES = ["income", "savings", "income_other"] as const;
export const MINUS_CATEGORIES = ["must_paid", "spendings", "expense_other"] as const;

export type PlusCategory = (typeof PLUS_CATEGORIES)[number];
export type MinusCategory = (typeof MINUS_CATEGORIES)[number];
export type Category = PlusCategory | MinusCategory;

/** Which button a category sits behind. */
export function signOf(category: Category): Sign {
  return (PLUS_CATEGORIES as readonly string[]).includes(category) ? "in" : "out";
}

/**
 * The kind a category produces.
 *
 * `savings` is the interesting one: it is on the `+` side, because the user is
 * putting money away and `+` is what that feels like, but it produces a
 * TRANSFER rather than an inflow.
 */
export function kindOf(category: Category): RecordKind {
  if (category === "savings") return "transfer";
  return signOf(category) === "in" ? "inflow" : "outflow";
}

/** The bucket tier a category should land in, where one is implied. */
export function tierFor(category: Category): number | null {
  switch (category) {
    case "must_paid":
      return MUST_PAID_TIER;
    case "savings":
      return SAVINGS_TIER;
    case "spendings":
      return SPENDINGS_TIER;
    default:
      // income, income_other and expense_other imply no tier — see the note on
      // determinism below.
      return null;
  }
}

/**
 * 🛑 REPORTED, NOT SOLVED: category → bucket is NOT deterministic, so the brief's
 * "drop the From bucket field" cannot be done as written.
 *
 * Measured against the live seeded household on 2026-08-22: it has NINE tier-1
 * buckets (Rent · Utilities · Education · Transport · Kids & School · Statutory ·
 * Income Tax · Insurance · Bills & Subscriptions) and THREE tier-3 (Groceries ·
 * Personal — Aiman · Personal — Siti). "Must-paid" therefore maps to nine
 * different places, and households can add more at any tier from FlexibleInput.
 *
 * The brief's own condition applies: removing the field would RELOCATE the
 * ambiguity rather than remove it — the record still has to land somewhere
 * specific, and something would have to pick. So the bucket stays, but it stops
 * being a question: `defaultBucketFor` picks the household's own most-used
 * bucket in that tier and the user only touches it to override.
 *
 * That is the honest version of what the brief wanted: the FIELD is no longer
 * data entry, but the CHOICE still exists for the cases where it matters.
 */
export function isCategoryBucketDeterministic(
  buckets: { id: string; tier: number }[],
): boolean {
  const perTier = new Map<number, number>();
  for (const b of buckets) perTier.set(b.tier, (perTier.get(b.tier) ?? 0) + 1);
  return [...perTier.values()].every((n) => n <= 1);
}

/**
 * The bucket a category should default to: the one this household actually uses
 * most in that tier. Falls back to the first in the tier, then to nothing.
 *
 * `usage` is a count per bucket id — the caller supplies it from the household's
 * own history, which is the only defensible way to pick between nine equally
 * valid "must-paid" buckets.
 */
export function defaultBucketFor(
  category: Category,
  buckets: { id: string; tier: number }[],
  usage: Map<string, number> = new Map(),
): string | null {
  const tier = tierFor(category);
  if (tier === null) return null;
  const inTier = buckets.filter((b) => b.tier === tier);
  if (!inTier.length) return null;
  return inTier.sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0))[0].id;
}

/**
 * Derive the kind of a record that predates the `kind` field.
 *
 * Old rows carry `direction` ("in" | "out", empty meaning "out") and a wallet
 * bucket. That is enough to reconstruct all three kinds, and reconstructing on
 * READ is why the migration rewrites nothing:
 *
 *   direction "in"  + tier-2 bucket → transfer   (a savings deposit)
 *   direction "out" + tier-2 bucket → transfer   (a savings withdrawal)
 *   direction "in"                  → inflow
 *   otherwise                       → outflow
 *
 * The tier-2 rule is the one that matters: those rows were being counted as
 * spending, and treating them as transfers is what stops a savings deposit
 * reading as money leaving the household.
 */
export function deriveKind(row: {
  kind?: string | null;
  direction?: string | null;
  bucketTier?: number | null;
}): RecordKind {
  if (row.kind === "inflow" || row.kind === "outflow" || row.kind === "transfer") return row.kind;
  if (row.bucketTier === SAVINGS_TIER) return "transfer";
  return row.direction === "in" ? "inflow" : "outflow";
}

/**
 * Does this record change what the household owns in total?
 *
 * A transfer does not — which is exactly why a partner-to-partner repayment
 * NETS TO ZERO at household level, and why the Sankey must terminate transfers
 * at an in-household node rather than drawing them as flows leaving.
 */
export function movesHouseholdTotal(kind: RecordKind): boolean {
  return kind !== "transfer";
}

/**
 * The visual treatment. Deliberately NOT green/red.
 *
 * Red-green colour blindness is the common one — roughly one man in twelve — and
 * a money app that encodes "money in" versus "money out" in exactly those two
 * hues is unreadable to them. Orange and dark grey are distinguishable to every
 * form of colour vision deficiency AND in greyscale, where orange and grey
 * differ in lightness while red and green do not.
 *
 * The glyph is not decoration. `+` and `−` carry the meaning on their own, so
 * the colour is reinforcement — which is what makes the record type identifiable
 * in greyscale, as the release's definition of done requires.
 *
 * Two oranges, on purpose: the bright brand orange fails 4.5:1 against white as
 * text, so text and thin strokes use the darker one and fills use the bright one.
 */
export const SIGN_STYLE: Record<Sign, { glyph: string; text: string; fill: string; ring: string }> = {
  in: {
    glyph: "+",
    // #B45309 on white ≈ 5.9:1 — clears 4.5:1 for text.
    text: "text-amber-700 dark:text-amber-400",
    fill: "bg-amber-500 text-white",
    ring: "ring-amber-500",
  },
  out: {
    glyph: "−",
    text: "text-zinc-700 dark:text-zinc-300",
    fill: "bg-zinc-700 text-white dark:bg-zinc-600",
    ring: "ring-zinc-500",
  },
};

/** Is this bucket one of the private (tier-3) ones? Re-exported for callers. */
export function isPrivateTier(tier: number | null | undefined): boolean {
  return tier === PRIVATE_TIER;
}
