// Ask Honey — STAGE 2 of 3: compute.
//
//   parse (askIntent.ts) → compute (here) → narrate (askNarrate.ts)
//
// **Every number the user ever sees is produced in this file.** It is pure: no
// database, no network, no model, no clock beyond what it is handed. Give it
// the same facts twice and it answers identically, which is the property that
// makes an affordability figure safe to act on.
//
// ── WHY THIS IS NOT THE FALLBACK ───────────────────────────────────────────
//
// The version this replaces handed a context blob and the raw question to a
// model and said "answer, grounded in these numbers" — and kept a deterministic
// path only for when no API key was set. So the two paths computed DIFFERENT
// THINGS: the good path did arithmetic, and the path everyone actually used did
// not. Whether your affordability answer was calculated or generated depended
// on an environment variable.
//
// Now there is one engine. The model's entire job is phrasing, and stage 3
// checks its phrasing against `facts` before showing it. A hallucinated
// affordability figure is worse than no answer — it will be believed and acted
// on, by someone who asked precisely because they did not know.
//
// ── THE SAME ENGINE THAT COMPUTES H-SCORE ──────────────────────────────────
//
// "What would this purchase do to us?" is answered by applying the purchase to
// `ScoreInputs` and calling `computeHScore` — the identical function behind
// /hscore. Not a parallel approximation of it. If the two ever disagreed, the
// user would be told two different truths about one household, and would have
// no way to tell which was the real one.

import {
  WINDOW_DAYS,
  computeHScore,
  bandFor,
  type Band,
  type Confidence,
  type HScore,
  type ScoreInputs,
} from "./hscore";
import type { DeclineReason, Intent, IntentKind } from "./askIntent";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);

// ── the facts stage 2 reasons over ─────────────────────────────────────────

export interface GoalFact {
  label: string;
  target: number;
  saved: number;
  monthly: number;
}

export interface HouseholdFacts {
  inputs: ScoreInputs;
  confidence: Confidence;
  hscore: HScore;
  /** Unspent, unallocated money projected to remain this month. */
  headroomThisMonth: number;
  allocatedMonthly: number;
  /**
   * Category-level totals ALREADY FILTERED to what this viewer may see.
   * Filtering here rather than in the narration is deliberate: a redaction
   * applied at the last moment is one refactor away from being skipped.
   */
  categoryTotals: { label: string; amount: number }[];
  goals: GoalFact[];
  history: { days: number; txnCount: number; monthsWithData: number };
}

// ── confidence ─────────────────────────────────────────────────────────────

export type ConfidenceLevel = "high" | "fair" | "thin";

export interface AskConfidence {
  level: ConfidenceLevel;
  /** i18n key explaining the level in the user's own terms. */
  reasonKey: string;
  /**
   * i18n key for what to DO about it — paired with `reasonKey`, because the two
   * are not interchangeable. There used to be one suggestion for every decline,
   * so a household with no declared income was told "log a couple more weeks
   * and ask me again": advice that cannot work, since income is read from
   * declared sources and never from transactions (lib/hscoreExplain.ts). They
   * could log for a year and get the same refusal.
   */
  fixKey: string;
  vars: Record<string, string | number>;
  /**
   * False ⇒ Honey declines to project and says why. Not a hedge appended to a
   * confident answer: below this floor the projection is not worth making, and
   * "based on 4 records" dressed up as a forecast is a lie with a caveat on it.
   */
  projectable: boolean;
}

/** Records and days below which no projection is honest. */
export const MIN_TXNS_TO_PROJECT = 8;
export const MIN_DAYS_TO_PROJECT = 14;

/**
 * The questions that are literally a ratio to declared income, and so cannot be
 * answered at all without it.
 *
 * Everything NOT in this set was refused for the same reason until 2026-08-26,
 * and should not have been. "How far along is our Japan trip?" is answered from
 * the goal's own balance; "how many months of buffer do we have?" from savings
 * over must-paid spending. Neither divides by income. A household that had
 * logged records and set goals but not yet declared a salary was told, for
 * every question it asked, to go and declare a salary — including for the
 * questions its existing data already answered.
 */
const NEEDS_INCOME: ReadonlySet<IntentKind> = new Set<IntentKind>(["afford", "income_change"]);

/**
 * Questions about what IS rather than what WILL BE. They survive the thin-data
 * floor because describing a balance is not projecting from one.
 */
const DESCRIBES_PRESENT: ReadonlySet<IntentKind> = new Set<IntentKind>([
  "hscore_explain",
  "spending_summary",
  "goal_timing",
]);

/**
 * `kind` omitted ⇒ assessed for the household as a whole, where a missing
 * income is disqualifying. Passing the kind narrows that to the questions the
 * missing income actually blocks.
 */
export function assessAskConfidence(f: HouseholdFacts, kind?: IntentKind): AskConfidence {
  const { txnCount, days, monthsWithData } = f.history;
  const incomeMatters = kind === undefined || NEEDS_INCOME.has(kind);
  const noIncome = incomeMatters && f.inputs.netIncomeMonthly <= 0;

  if (noIncome) {
    return {
      level: "thin",
      reasonKey: "ask.conf.noIncome",
      fixKey: "ask.thin.fix.noIncome",
      vars: {},
      projectable: false,
    };
  }
  if (txnCount < MIN_TXNS_TO_PROJECT || days < MIN_DAYS_TO_PROJECT) {
    return {
      level: "thin",
      reasonKey: "ask.conf.tooThin",
      fixKey: "ask.thin.fix.records",
      vars: { txns: txnCount, days },
      projectable: false,
    };
  }
  if (f.confidence.ok && monthsWithData >= 3) {
    return { level: "high", reasonKey: "ask.conf.high", fixKey: "", vars: { months: monthsWithData }, projectable: true };
  }
  // Projectable, but say so plainly rather than in a footnote.
  const weeks = Math.max(1, Math.round(days / 7));
  return { level: "fair", reasonKey: "ask.conf.fair", fixKey: "", vars: { weeks, txns: txnCount }, projectable: true };
}

// ── the outcome ────────────────────────────────────────────────────────────

export interface Outcome {
  kind: IntentKind;
  declineReason?: DeclineReason;
  label?: string;
  /**
   * **The number allowlist.** Every figure that may appear in the answer, in
   * any language, from either the template or the model. Stage 3 checks the
   * model's prose against this set and discards prose containing anything else.
   * A prompt asking a model not to invent numbers is a request; this is the
   * enforcement.
   */
  facts: Record<string, number>;
  confidence: AskConfidence;
  /** Set when the answer is "I won't guess at that" rather than an answer. */
  cannotAnswer?: boolean;
}

// ── applying a change to the score ─────────────────────────────────────────

/**
 * Re-score the household as if `mutate` had happened.
 *
 * The confidence object rides along unchanged: a hypothetical purchase does not
 * change how much history exists, and letting a what-if quietly improve the
 * data-confidence gate would let the user imagine their way to a better score.
 */
function rescore(f: HouseholdFacts, mutate: (i: ScoreInputs) => ScoreInputs): HScore {
  return computeHScore(mutate({ ...f.inputs }), f.confidence);
}

const bufferMonthsOf = (i: ScoreInputs) => safeDiv(i.liquidSavings, i.mustPaidMonthly);

// ── the computations ───────────────────────────────────────────────────────

export function compute(intent: Intent, f: HouseholdFacts): Outcome {
  const conf = assessAskConfidence(f, intent.kind);

  // Declines and requests-for-input never reach the arithmetic — and never
  // carry a number, so there is nothing for stage 3 to get wrong.
  if (intent.kind === "out_of_scope") {
    return { kind: "out_of_scope", declineReason: intent.declineReason, facts: {}, confidence: conf, cannotAnswer: true };
  }
  if (intent.kind === "needs_price") {
    return { kind: "needs_price", label: intent.label, facts: {}, confidence: conf, cannotAnswer: true };
  }
  if (intent.kind === "unclear") {
    return { kind: "unclear", facts: {}, confidence: conf, cannotAnswer: true };
  }

  // The thin-data floor. Below it the honest answer is why we won't project,
  // not a projection with a disclaimer stapled on. H-Score explanation survives
  // it because that describes what IS, not what WILL BE.
  if (!conf.projectable && !DESCRIBES_PRESENT.has(intent.kind)) {
    return { kind: intent.kind, facts: {}, confidence: conf, cannotAnswer: true };
  }

  switch (intent.kind) {
    case "afford":
      return { ...computeAfford(intent, f), confidence: conf };
    case "income_change":
      return { ...computeIncomeChange(intent, f), confidence: conf };
    case "buffer":
      return { ...computeBuffer(f), confidence: conf };
    case "goal_timing":
      return { ...computeGoalTiming(intent, f, conf.projectable), confidence: conf };
    case "spending_summary":
      return { ...computeSpendingSummary(f), confidence: conf };
    case "hscore_explain":
      return { ...computeHScoreExplain(f), confidence: conf };
    default:
      // `statutory` is answered by lib/statutory.ts, which owns the verified
      // rate tables; it carries no household arithmetic and so no facts.
      return { kind: intent.kind, facts: {}, confidence: conf };
  }
}

/**
 * "Can we afford RM X?"
 *
 * Answered with CONSEQUENCE, not verdict. The brief is emphatic and it is right:
 * "you can't afford it" is a judgement about a household we cannot see the whole
 * of — a family may have excellent reasons to spend past their headroom, and a
 * tool that scolds them gets closed. "Your buffer goes from 2.4 months to 1.6,
 * and your H-Score from 72 to 64" is the same arithmetic with the decision left
 * where it belongs.
 */
function computeAfford(intent: Intent, f: HouseholdFacts): Omit<Outcome, "confidence"> {
  const amount = r2(intent.amount ?? 0);
  const recurring = Boolean(intent.recurring);

  // ── A ONE-OFF IS NOT A NEW HABIT ─────────────────────────────────────────
  //
  // `savingsMonthly` is a monthly AVERAGE over H-Score's 90-day window, so
  // subtracting a whole lump sum from it models a household that stopped saving
  // permanently. Measured against the demo household, a single RM2,000 holiday
  // came out as a 13-point drop — because it zeroed the savings rate outright —
  // which is not what buying one thing does to anybody.
  //
  // The lump is amortised across the same window that H-Score amortises road
  // tax and school fees over, for the same reason: one large legitimate payment
  // must not crater the month.
  //
  // It is charged ONCE. Money spent either comes out of what the household
  // would have added to savings, or out of what is already in the pot — not
  // both. Applying both effects double-counts a single purchase across two
  // criteria and roughly doubles its apparent cost, which is how a RM2,000
  // holiday came out looking like a life event.
  //
  // So the savings FLOW absorbs what it can across the window, and only the
  // excess touches the STOCK. Buy something you could have saved for and your
  // emergency buffer is genuinely untouched; buy something larger and it is
  // genuinely not.
  const windowMonths = WINDOW_DAYS / 30;
  const absorbable = f.inputs.savingsMonthly * windowMonths;
  const fromFlow = recurring ? amount : Math.min(amount, absorbable);
  const stockHit = recurring ? 0 : amount - fromFlow;
  const flowHit = recurring ? amount : fromFlow / windowMonths;

  // A recurring commitment larger than what the household saves stops being a
  // slower save and becomes a fixed burden — a different criterion entirely.
  const burdenHit = recurring ? Math.max(0, amount - f.inputs.savingsMonthly) : 0;

  const applied = (i: ScoreInputs): ScoreInputs => ({
    ...i,
    savingsMonthly: Math.max(0, i.savingsMonthly - flowHit),
    liquidSavings: Math.max(0, i.liquidSavings - stockHit),
    mustPaidMonthly: i.mustPaidMonthly + burdenHit,
  });

  const after = rescore(f, applied);

  const bufferBefore = bufferMonthsOf(f.inputs);
  const bufferAfter = bufferMonthsOf(applied(f.inputs));

  const facts: Record<string, number> = {
    amount,
    headroom: r2(f.headroomThisMonth),
    bufferBefore: r1(bufferBefore),
    bufferAfter: r1(bufferAfter),
    scoreBefore: f.hscore.score,
    scoreAfter: after.score,
    scoreDelta: Math.abs(after.score - f.hscore.score),
  };

  if (amount > f.headroomThisMonth) {
    facts.shortfall = r2(amount - f.headroomThisMonth);
    // How many months of headroom this purchase represents — offered as an
    // observation, never as "finance it over 12 months instead", which would be
    // recommending a credit product we are not licensed to recommend.
    facts.monthsOfHeadroom = Math.max(2, Math.ceil(safeDiv(amount, Math.max(1, f.headroomThisMonth))));
  }

  return { kind: "afford", label: intent.label, facts };
}

/** "What if income drops 20%?" — same engine, income scaled. */
function computeIncomeChange(intent: Intent, f: HouseholdFacts): Omit<Outcome, "confidence"> {
  const net = f.inputs.netIncomeMonthly;
  const newNet =
    intent.pct !== undefined ? r2(net * (1 - intent.pct / 100)) : r2(Math.max(0, net - (intent.amount ?? 0)));
  const ratio = safeDiv(newNet, net);

  const after = rescore(f, (i) => ({
    ...i,
    netIncomeMonthly: newNet,
    grossIncomeMonthly: r2(i.grossIncomeMonthly * ratio),
    // Essentials do not shrink when income does — that is precisely what makes
    // an income drop hurt, and modelling them as falling in step would produce
    // a reassuring answer that is false.
    savingsMonthly: Math.max(0, r2(i.savingsMonthly - (net - newNet))),
  }));

  const facts: Record<string, number> = {
    newIncome: newNet,
    oldIncome: r2(net),
    drop: r2(net - newNet),
    allocated: r2(f.allocatedMonthly),
    scoreBefore: f.hscore.score,
    scoreAfter: after.score,
    scoreDelta: Math.abs(after.score - f.hscore.score),
  };
  if (intent.pct !== undefined) facts.pct = intent.pct;

  const gap = r2(f.allocatedMonthly - newNet);
  if (gap > 0) facts.gap = gap;
  else facts.spare = Math.abs(gap);

  return { kind: "income_change", facts };
}

function computeBuffer(f: HouseholdFacts): Omit<Outcome, "confidence"> {
  return {
    kind: "buffer",
    facts: {
      bufferMonths: r1(bufferMonthsOf(f.inputs)),
      liquidSavings: r2(f.inputs.liquidSavings),
      mustPaid: r2(f.inputs.mustPaidMonthly),
    },
  };
}

/**
 * "How far along is the Japan trip?"
 *
 * Two answers, and the split is the whole point. WHERE THE GOAL STANDS is a
 * balance — saved, target, what is left — and it is true whatever else is
 * missing. WHEN IT LANDS is a forecast, and needs a credible monthly pace.
 *
 * So a household with thin history or no saving flow yet gets the balance and
 * an honest "no date yet", instead of the refusal it used to get. Withholding a
 * number we hold, because a DIFFERENT number would have been a guess, taught
 * the user that Honey knows nothing — when what it could not do was only the
 * date.
 */
function computeGoalTiming(
  intent: Intent,
  f: HouseholdFacts,
  projectable: boolean,
): Omit<Outcome, "confidence"> {
  const goal = f.goals[0];
  if (!goal || goal.target <= 0) {
    return { kind: "goal_timing", facts: {}, cannotAnswer: true };
  }
  const remaining = Math.max(0, r2(goal.target - goal.saved));
  // The goal's own contribution when it has one, else what the household
  // actually saves. Never a number we wished for on their behalf.
  const monthly = goal.monthly > 0 ? goal.monthly : f.inputs.savingsMonthly;
  // No `months` fact ⇒ stage 3 states the balance and says why there is no date.
  // The absence of the key IS the signal, so a date can never be narrated from
  // a pace that was never computed.
  if (!projectable || monthly <= 0) {
    return {
      kind: "goal_timing",
      label: goal.label,
      facts: { remaining, target: r2(goal.target), saved: r2(goal.saved) },
    };
  }
  return {
    kind: "goal_timing",
    label: goal.label,
    facts: {
      target: r2(goal.target),
      saved: r2(goal.saved),
      remaining,
      monthly: r2(monthly),
      months: Math.ceil(safeDiv(remaining, monthly)),
    },
  };
}

function computeSpendingSummary(f: HouseholdFacts): Omit<Outcome, "confidence"> {
  const top = [...f.categoryTotals].sort((a, b) => b.amount - a.amount).slice(0, 3);
  if (!top.length) return { kind: "spending_summary", facts: {}, cannotAnswer: true };
  const facts: Record<string, number> = { total: r2(top.reduce((s, c) => s + c.amount, 0)) };
  top.forEach((c, idx) => {
    facts[`cat${idx + 1}`] = r2(c.amount);
  });
  return { kind: "spending_summary", label: top.map((c) => c.label).join(" · "), facts };
}

function computeHScoreExplain(f: HouseholdFacts): Omit<Outcome, "confidence"> {
  const weakest = [...f.hscore.subScores].sort(
    (a, b) => a.points / a.max - b.points / b.max,
  )[0];
  const facts: Record<string, number> = { score: f.hscore.score };
  if (weakest) {
    facts.weakestPoints = r1(weakest.points);
    facts.weakestMax = weakest.max;
  }
  return { kind: "hscore_explain", label: weakest?.key, facts };
}

// ── band movement, for the narration ───────────────────────────────────────

export function bandChange(before: number, after: number): { from: Band; to: Band; changed: boolean } {
  const from = bandFor(before);
  const to = bandFor(after);
  return { from, to, changed: from !== to };
}
