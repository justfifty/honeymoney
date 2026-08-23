// Ask Honey — the orchestrator.
//
//   parse (askIntent.ts) → compute (askCompute.ts) → narrate (askNarrate.ts)
//
// This file gathers the facts, runs the three stages in order, and enforces the
// two rules that make the feature safe to ship: the model never produces a
// number, and Honey sees only what the person asking is allowed to see.
//
// ── WHAT THIS REPLACED, AND WHY IT HAD TO GO ───────────────────────────────
//
// The previous version built a context string, appended the raw question, and
// asked a model to "answer, grounded in these numbers". Three problems, in
// ascending order of seriousness:
//
//   1. The model did the arithmetic. Grounding it in a context blob makes a
//      wrong figure LESS likely, not impossible — and an affordability number is
//      believed precisely because the person asking could not work it out
//      themselves. Now stage 2 computes and stage 3 is checked against it.
//
//   2. The deterministic path was a fallback for when no API key was set, so
//      the two paths answered different questions with different rigour.
//      Whether your answer was calculated or generated depended on an
//      environment variable. Now there is one engine and the model only phrases.
//
//   3. **It read the whole household.** `getBucketProjection(tenantId)` and a
//      household-wide income sum, with no notion of who was asking. Task 6 gave
//      records a `visibility` and a `paid_by`, and the record list honours them
//      — but Honey did not, so a partner's private spending was reachable
//      through a conversational side channel. The record list said no and the
//      chat box said yes, about the same rows, on the same screen. Every fact
//      below that could carry record-level detail now goes through
//      `getSpendRecords(..., { viewerMemberId, redact })` — the same filter, in
//      the same query, as the list.
//
// H-Score, income and bucket allocations stay household-level ON PURPOSE: they
// are already on /hscore and /dashboard for both partners, and a shared score
// that changed depending on who asked would be a different and worse lie.

import { aiGenerate } from "./ai";
import { getBucketProjection } from "./projection";
import { getHScore } from "./hscoreData";
import { getSpendRecords } from "./records";
import { listGoals } from "./goals";
import { isProviderConfigured, activeAiProvider } from "./config";
import { STATUTORY_FACTS, isStatutoryQuestion, statutoryAnswer } from "./statutory";
import { parseIntent, type Intent } from "./askIntent";
import { compute, type HouseholdFacts, type Outcome } from "./askCompute";
import { narrateTemplate, narratePrompt, verifyNumbers, NARRATE_SYSTEM } from "./askNarrate";
import { t, type Locale } from "./i18n";

export interface HoneyAnswer {
  answer: string;
  /**
   * How the WORDS were produced. Never how the numbers were produced — those
   * are always stage 2. "ai" means a model phrased a computed result and the
   * result survived the number check.
   */
  source: "ai" | "computed";
  kind: Outcome["kind"];
  confidence: Outcome["confidence"]["level"];
  /** True when a model answer was discarded for containing an unknown number. */
  rephrasedByFallback?: boolean;
}

const WINDOW_DAYS = 90;
const DAY_MS = 86_400_000;

export interface AskOptions {
  viewerMemberId?: string | null;
  /** Off for the fictional demo personas, whose "private" spend is invented. */
  redact?: boolean;
}

// ── fact gathering ─────────────────────────────────────────────────────────

async function gatherFacts(tenantId: string, opts: AskOptions): Promise<HouseholdFacts> {
  const now = new Date();
  const from = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);

  const [hs, projection, records, goals] = await Promise.all([
    getHScore(tenantId, { persist: false }),
    getBucketProjection(tenantId),
    // The privacy boundary. Same function, same filter, same query as the
    // record list — so the two can never drift apart into disagreeing about
    // what this viewer may see.
    getSpendRecords(tenantId, from, now, {
      viewerMemberId: opts.viewerMemberId,
      redact: opts.redact ?? true,
    }),
    listGoals(tenantId).catch(() => []),
  ]);

  const byBucket = new Map<string, number>();
  for (const r of records) {
    const label = r.bucketLabel ?? "Unsorted";
    byBucket.set(label, (byBucket.get(label) ?? 0) + Math.abs(r.amount));
  }

  const days = records.length
    ? Math.max(
        1,
        Math.round(
          (now.getTime() - new Date(records[records.length - 1].occurred_at).getTime()) / DAY_MS,
        ),
      )
    : 0;
  const months = new Set(records.map((r) => r.occurred_at.slice(0, 7)));

  return {
    inputs: hs.inputs,
    confidence: hs.confidence,
    hscore: hs,
    headroomThisMonth:
      Math.round(projection.reduce((s, b) => s + Math.max(0, b.projected_balance), 0) * 100) / 100,
    allocatedMonthly: Math.round(projection.reduce((s, b) => s + b.allocated, 0) * 100) / 100,
    categoryTotals: [...byBucket].map(([label, amount]) => ({ label, amount })),
    goals: goals.map((g) => ({
      label: g.name,
      target: g.target,
      saved: g.current,
      // A goal's own monthly contribution is not modelled yet, so this is 0 and
      // stage 2 falls back to what the household actually saves. Deliberately
      // not an assumed contribution: a made-up monthly figure would produce a
      // made-up target date, which is exactly the class of answer this whole
      // pipeline exists to prevent.
      monthly: 0,
    })),
    history: { days, txnCount: records.length, monthsWithData: months.size },
  };
}

// ── the pipeline ───────────────────────────────────────────────────────────

export async function askHoney(
  question: string,
  tenantId: string,
  locale: Locale = "en",
  opts: AskOptions = {},
): Promise<HoneyAnswer> {
  // ── STAGE 1: what were they asking? ──
  const intent: Intent = parseIntent(question);

  // Declines and requests for a price cost nothing to answer and must not leak
  // a database read, so they short-circuit before any household data is
  // touched. "How much is a TV?" should not query anyone's ledger.
  if (intent.kind === "out_of_scope" || intent.kind === "needs_price" || intent.kind === "unclear") {
    const outcome = compute(intent, EMPTY_FACTS);
    return {
      answer: narrateTemplate(outcome, locale),
      source: "computed",
      kind: outcome.kind,
      confidence: outcome.confidence.level,
    };
  }

  const facts = await gatherFacts(tenantId, opts);

  // Statutory rates are owned by lib/statutory.ts, which holds the verified
  // tables. Kept whole rather than folded into stage 2: EPF is not a fact about
  // this household, and mixing published rates into the household's own
  // arithmetic is how a wrong rate acquires the authority of a real balance.
  if (intent.kind === "statutory" || isStatutoryQuestion(question)) {
    const wage = intent.amount ?? facts.inputs.grossIncomeMonthly;
    if (wage > 0) {
      return {
        answer: statutoryAnswer(Math.round(wage * 100) / 100),
        source: "computed",
        kind: "statutory",
        confidence: "high",
      };
    }
  }

  // ── STAGE 2: compute. Every number the user sees is born here. ──
  const outcome = compute(intent, facts);

  // ── STAGE 3: narrate. ──
  const template = narrateTemplate(outcome, locale);

  // No key, nothing to compute, or nothing to say — the template IS the answer,
  // and it is a correct one. Not a degraded mode.
  if (!isProviderConfigured(activeAiProvider()) || outcome.cannotAnswer || !Object.keys(outcome.facts).length) {
    return {
      answer: template,
      source: "computed",
      kind: outcome.kind,
      confidence: outcome.confidence.level,
    };
  }

  try {
    const facts_ = outcome.kind === "statutory" ? `\n\n${STATUTORY_FACTS}` : "";
    const prose = await aiGenerate(narratePrompt(outcome, question, locale) + facts_, {
      system: NARRATE_SYSTEM,
      fn: "askHoney",
      meta: { tenantId, source: "web" },
    });

    // The enforcement. A model that introduced any figure stage 2 did not
    // compute loses its answer entirely — no partial credit, no repair pass.
    // Repairing it would mean deciding which of its numbers to trust, and the
    // whole point is that we cannot.
    const check = verifyNumbers(prose, outcome);
    if (!check.ok) {
      return {
        answer: template,
        source: "computed",
        kind: outcome.kind,
        confidence: outcome.confidence.level,
        rephrasedByFallback: true,
      };
    }
    return { answer: prose, source: "ai", kind: outcome.kind, confidence: outcome.confidence.level };
  } catch {
    return {
      answer: template,
      source: "computed",
      kind: outcome.kind,
      confidence: outcome.confidence.level,
    };
  }
}

/**
 * A zero household, for the questions answered before any data is read.
 *
 * Real zeros rather than optimistic defaults: if this ever reached the
 * arithmetic by mistake it would produce an obviously-wrong answer rather than
 * a plausible one, and an obviously-wrong answer gets reported.
 */
const EMPTY_FACTS: HouseholdFacts = {
  inputs: {
    netIncomeMonthly: 0,
    grossIncomeMonthly: 0,
    savingsMonthly: 0,
    mustPaidMonthly: 0,
    debtRepaymentsMonthly: 0,
    liquidSavings: 0,
    privacyCapMonthly: 0,
    privacyTrailing3: [],
  },
  confidence: { ok: false, missing: ["income", "transactions", "buckets"], txns30d: 0 },
  hscore: {
    score: 0,
    rawBand: "building",
    band: "building",
    subScores: [],
    confidence: { ok: false, missing: [], txns30d: 0 },
  },
  headroomThisMonth: 0,
  allocatedMonthly: 0,
  categoryTotals: [],
  goals: [],
  history: { days: 0, txnCount: 0, monthsWithData: 0 },
};

/** The persistent, visible line under the chat surface. Never in settings. */
export const scopeNoticeKey = "ask.scopeNotice";
export const scopeNotice = (locale: Locale) => t(locale, scopeNoticeKey);
