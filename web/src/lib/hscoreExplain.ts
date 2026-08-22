// Where each H-Score criterion's number comes from — and what it cannot see.
//
// Task 8 of the 2026-08-22 brief: "a score is an opinion expressed as a number;
// the weights encode a view". This module is that view, written down and made
// displayable, so a household can check the arithmetic instead of being asked to
// trust it.
//
// It COMPUTES NOTHING. Every figure it describes is read back from the same
// ScoreInputs that lib/hscore.ts scored — the brief's standing constraint is that
// H-Score computation must not change as a side effect, and a second module doing
// its own maths is precisely how two surfaces start disagreeing. If a number here
// ever differs from the ring above it, this file is wrong, not hscore.ts.
//
// ── THE FOUR MEASURED FINDINGS THIS FILE EXISTS TO SURFACE ─────────────────
//
// Measured against the live seeded household on 2026-08-22, not reasoned about.
// The brief asks that a criterion low from THIN DATA be visually distinct from
// one low from the household's finances. There turns out to be a third case,
// which is worse than either: a criterion low because of how the data model
// works, where the household did everything right and the score punished them.
//
//   1. RECORDING SAVINGS LOWERS THE SAVINGS RATE. `savingsMonthly` is
//      `max(0, savingsAllocated − savingsWithdrawn)`, where the allocated half
//      comes only from allocation EDGES (the plan) and the withdrawn half is
//      TRANSACTIONS against a tier-2 bucket. One RM500 record on Savings moved
//      the live score 81 → 79. The same record as a credit changed nothing. A
//      transaction can only ever reduce this criterion, never raise it.
//   2. NO TRANSACTION IS EVER INCOME. Income is summed from `income_source`
//      nodes' declared monthly amounts. A salary credit recorded as a
//      transaction does not appear. This is also why a transfer cannot be
//      mistaken for income — the brief asked; it cannot, because nothing can.
//   3. DEBT IS DECLARED, NOT OBSERVED. `debtService` reads `obligation` nodes'
//      stated monthly repayment. A loan the household never told us about
//      scores as zero debt, which flatters the score.
//   4. THE SCORE IS HOUSEHOLD-WIDE. Nothing here filters by member.
//
// None of these are fixed here. Task 8 is a display task; fixing 1 and 2 changes
// H-Score computation, which the brief reserves for a deliberate decision. They
// are SHOWN instead, which is the honest interim: a user who saved RM500 and
// watched their score fall deserves to be told why.

import type { ComponentKey, ScoreInputs, SubScore } from "./hscore";
import { WINDOW_DAYS, AMORTISE_MONTHS, MIN_TXNS_30D } from "./hscore";

export type FeedKind = "counts" | "ignored" | "caution";

export interface FeedNote {
  kind: FeedKind;
  /** i18n key. */
  key: string;
}

export interface CriterionExplain {
  key: ComponentKey;
  /** Points this criterion can contribute, out of 100. The weight, stated. */
  weight: number;
  /** i18n key for the one-line arithmetic, e.g. "Savings ÷ net income". */
  formulaKey: string;
  /** Numerator and denominator, read back from the inputs the score used. */
  parts: (i: ScoreInputs) => { top: number; bottom: number } | null;
  /** What feeds this number, what it ignores, and what to be careful of. */
  notes: FeedNote[];
  /**
   * The records that produced it, as a /records query — level three of the
   * brief's tap-through. `null` where no transaction feeds the criterion at all,
   * which is itself the finding worth showing.
   */
  recordsHref: string | null;
}

export const EXPLAIN: Record<ComponentKey, CriterionExplain> = {
  savingsRate: {
    key: "savingsRate",
    weight: 30,
    formulaKey: "hscore.c.savingsRate.hint",
    parts: (i) => ({ top: i.savingsMonthly, bottom: i.netIncomeMonthly }),
    notes: [
      { kind: "counts", key: "hscore.feed.savings.counts" },
      { kind: "caution", key: "hscore.feed.savings.caution" }, // finding 1
      { kind: "ignored", key: "hscore.feed.savings.ignored" },
    ],
    recordsHref: "/records?range=90d",
  },
  essentialBurden: {
    key: "essentialBurden",
    weight: 25,
    formulaKey: "hscore.c.essentialBurden.hint",
    parts: (i) => ({ top: i.mustPaidMonthly, bottom: i.netIncomeMonthly }),
    notes: [
      { kind: "counts", key: "hscore.feed.essentials.counts" },
      { kind: "counts", key: "hscore.feed.essentials.amortised" },
      { kind: "ignored", key: "hscore.feed.essentials.ignored" },
    ],
    recordsHref: "/records?range=90d",
  },
  debtService: {
    key: "debtService",
    weight: 20,
    formulaKey: "hscore.c.debtService.hint",
    parts: (i) => ({ top: i.debtRepaymentsMonthly, bottom: i.grossIncomeMonthly }),
    notes: [
      { kind: "counts", key: "hscore.feed.debt.counts" },
      { kind: "caution", key: "hscore.feed.debt.caution" }, // finding 3
    ],
    // No transaction feeds this — it is read from obligation nodes.
    recordsHref: null,
  },
  emergencyBuffer: {
    key: "emergencyBuffer",
    weight: 20,
    formulaKey: "hscore.c.emergencyBuffer.hint",
    parts: (i) => ({ top: i.liquidSavings, bottom: i.mustPaidMonthly }),
    notes: [
      { kind: "counts", key: "hscore.feed.buffer.counts" },
      { kind: "ignored", key: "hscore.feed.buffer.ignored" },
    ],
    recordsHref: null,
  },
  personalCap: {
    key: "personalCap",
    weight: 5,
    formulaKey: "hscore.c.personalCap.hint",
    parts: () => null, // months, not a ratio
    notes: [
      { kind: "counts", key: "hscore.feed.personal.counts" },
      { kind: "caution", key: "hscore.feed.personal.naming" }, // the name mismatch
    ],
    recordsHref: "/records?range=90d",
  },
};

/** Weights must sum to 100, or the ring is lying about being out of 100. */
export const TOTAL_WEIGHT = Object.values(EXPLAIN).reduce((s, e) => s + e.weight, 0);

export const METHODOLOGY = {
  windowDays: WINDOW_DAYS,
  amortiseMonths: AMORTISE_MONTHS,
  minTxns30d: MIN_TXNS_30D,
} as const;

/**
 * Is this criterion low because the household has little data, or because of
 * their actual finances? The brief requires the two to be visually distinct, and
 * they are genuinely different messages: one asks for more input, the other
 * describes a real position.
 *
 * "Thin" is deliberately not the same test as the global confidence gate. A
 * household can clear the gate overall and still have one criterion resting on
 * nothing — debtService with no obligation nodes scores full marks and means
 * nothing, which reads as "excellent" when it should read as "unknown".
 */
export function isThin(key: ComponentKey, i: ScoreInputs): boolean {
  switch (key) {
    case "savingsRate":
      // No income declared ⇒ the denominator is invented, so the ratio is noise.
      return i.netIncomeMonthly <= 0;
    case "essentialBurden":
      return i.netIncomeMonthly <= 0 || i.mustPaidMonthly <= 0;
    case "debtService":
      // Zero declared debt is indistinguishable from debt never told to us.
      return i.grossIncomeMonthly <= 0 || i.debtRepaymentsMonthly <= 0;
    case "emergencyBuffer":
      return i.mustPaidMonthly <= 0 || i.liquidSavings <= 0;
    case "personalCap":
      return i.privacyCapMonthly <= 0;
    default:
      return false;
  }
}

/**
 * What would move this criterion, as a plain description of consequence rather
 * than an instruction. "Saving RM200 more a month would take this from 12% to
 * 15%" — never "you should save more".
 *
 * Returns null where the lever is not a ringgit amount the user controls
 * directly, rather than inventing one.
 */
export function leverFor(
  s: SubScore,
  i: ScoreInputs,
): { key: string; vars: Record<string, string | number> } | null {
  if (s.points >= s.max) return { key: "hscore.lever.maxed", vars: {} };

  switch (s.key) {
    case "savingsRate": {
      if (i.netIncomeMonthly <= 0) return null;
      // One percentage point of net income, in ringgit. Descriptive: this is
      // what a point costs, not a target anyone is being set.
      const perPoint = i.netIncomeMonthly / 100;
      return {
        key: "hscore.lever.savings",
        vars: { rm: Math.round(perPoint), from: Math.round(s.measure * 100) },
      };
    }
    case "essentialBurden": {
      if (i.netIncomeMonthly <= 0) return null;
      return {
        key: "hscore.lever.essentials",
        vars: { rm: Math.round(i.netIncomeMonthly / 100), from: Math.round(s.measure * 100) },
      };
    }
    case "emergencyBuffer": {
      if (i.mustPaidMonthly <= 0) return null;
      return {
        key: "hscore.lever.buffer",
        vars: { rm: Math.round(i.mustPaidMonthly), months: Math.round(s.measure * 10) / 10 },
      };
    }
    case "debtService":
      return { key: "hscore.lever.debt", vars: {} };
    case "personalCap":
      return { key: "hscore.lever.personal", vars: {} };
    default:
      return null;
  }
}
