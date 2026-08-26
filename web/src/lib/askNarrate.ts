// Ask Honey — STAGE 3 of 3: narrate.
//
//   parse (askIntent.ts) → compute (askCompute.ts) → narrate (here)
//
// Stage 3 is given finished numbers and asked for a sentence. It may choose
// words, order and emphasis. It may not do arithmetic, and — the part that
// matters — it is not *trusted* not to.
//
// ── THE PROMPT IS A REQUEST; THE CHECK IS THE ENFORCEMENT ──────────────────
//
// "Never invent figures" has been in the system prompt this whole time, and a
// system prompt is a request made of a system that is probabilistic by
// construction. So every number in the model's prose is extracted and checked
// against `outcome.facts` — the allowlist stage 2 produced. One unrecognised
// figure and the whole answer is discarded in favour of the template.
//
// That trade is deliberate and one-sided: the cost of a false rejection is a
// slightly stiffer sentence, and the cost of a false acceptance is a household
// acting on an affordability number nobody computed. The failure mode is not
// "the model lies" — it is "the model rounds 2.4 to 2 and reads perfectly."
//
// ── WORKS WITH NO MODEL AT ALL ─────────────────────────────────────────────
//
// `narrateTemplate` is the floor, not the fallback: fully i18n'd, always
// correct, and what every user sees when no key is configured. AI improves
// phrasing; it is not load-bearing, and nothing about the ANSWER changes when
// it is switched off — only the prose.

import { t, type Locale } from "./i18n";
import { bandChange, type Outcome } from "./askCompute";
import type { DeclineReason } from "./askIntent";

// ── the number allowlist ───────────────────────────────────────────────────

/**
 * Every numeric string the answer is permitted to contain.
 *
 * Rounding a given number is not inventing one, so the floor, ceiling and
 * nearest integer of each fact are admitted too — otherwise a model writing
 * "about 2 months" for a buffer of 2.4 would be thrown away for being helpful.
 * Anything else is a figure that entered the sentence from outside stage 2.
 */
export function allowedNumbers(outcome: Outcome): Set<string> {
  const out = new Set<string>();
  const add = (n: number) => {
    if (!Number.isFinite(n)) return;
    out.add(String(n));
    out.add(String(Math.round(n * 100) / 100));
    out.add(String(Math.round(n * 10) / 10));
  };
  for (const v of Object.values(outcome.facts)) {
    add(v);
    add(Math.round(v));
    add(Math.floor(v));
    add(Math.ceil(v));
  }
  // Both bands' worth of context is descriptive, not numeric, but the score
  // boundaries can legitimately appear when explaining a band.
  return out;
}

/**
 * Extract every number from prose and confirm each one is allowed.
 *
 * Deliberately conservative about what counts as a number: a bare "2" in
 * "2 months" is checked exactly as strictly as "RM2,438.10", because the
 * plausible-looking small number is the one that slips past a reader.
 */
export function verifyNumbers(text: string, outcome: Outcome): { ok: boolean; offending: string[] } {
  const allowed = allowedNumbers(outcome);
  const offending: string[] = [];
  const matches = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  for (const raw of matches) {
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const forms = [String(n), String(Math.round(n * 100) / 100), String(Math.round(n * 10) / 10)];
    if (!forms.some((f) => allowed.has(f))) offending.push(raw);
  }
  return { ok: offending.length === 0, offending };
}

// ── template narration ─────────────────────────────────────────────────────

const money = (n: number) =>
  `RM${n.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: n % 1 === 0 ? 0 : 2 })}`;

const DECLINE_KEY: Record<DeclineReason, string> = {
  product_recommendation: "ask.decline.product",
  investment: "ask.decline.investment",
  debt_restructure: "ask.decline.debt",
  tax_position: "ask.decline.tax",
  not_your_money: "ask.decline.notYours",
};

/**
 * The deterministic answer. Every branch reads only from `outcome.facts`, so
 * the template is incapable of stating something stage 2 did not compute.
 */
export function narrateTemplate(outcome: Outcome, locale: Locale): string {
  const f = outcome.facts;
  const T = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);

  if (outcome.kind === "out_of_scope") {
    const key = outcome.declineReason ? DECLINE_KEY[outcome.declineReason] : "ask.decline.generic";
    return `${T(key)} ${T("ask.decline.routed")}`;
  }

  if (outcome.kind === "needs_price") {
    // The single most important sentence in this file. See askIntent.ts.
    return outcome.label
      ? T("ask.needsPrice.labelled", { label: outcome.label })
      : T("ask.needsPrice.bare");
  }

  if (outcome.kind === "unclear") return T("ask.unclear");

  // Thin data: say why we will not project, rather than projecting quietly.
  if (outcome.cannotAnswer && !outcome.confidence.projectable) {
    return `${T(outcome.confidence.reasonKey, outcome.confidence.vars)} ${T(outcome.confidence.fixKey)}`;
  }
  if (outcome.cannotAnswer) return T("ask.cannotAnswer");

  const hedge = outcome.confidence.level === "fair" ? ` ${T(outcome.confidence.reasonKey, outcome.confidence.vars)}` : "";

  switch (outcome.kind) {
    case "afford": {
      const band = bandChange(f.scoreBefore, f.scoreAfter);
      const consequence = T("ask.afford.consequence", {
        bufferBefore: f.bufferBefore,
        bufferAfter: f.bufferAfter,
        scoreBefore: f.scoreBefore,
        scoreAfter: f.scoreAfter,
      });
      const bandNote = band.changed
        ? " " + T("ask.afford.bandChange", { from: T(`hscore.band.${band.from}`), to: T(`hscore.band.${band.to}`) })
        : "";
      const head =
        f.shortfall !== undefined
          ? T("ask.afford.over", {
              amount: money(f.amount),
              shortfall: money(f.shortfall),
              headroom: money(f.headroom),
            })
          : T("ask.afford.fits", { amount: money(f.amount), headroom: money(f.headroom) });
      return `${head} ${consequence}${bandNote}${hedge}`;
    }

    case "income_change": {
      const head =
        f.pct !== undefined
          ? T("ask.income.headPct", { pct: f.pct, newIncome: money(f.newIncome) })
          : T("ask.income.headAmount", { drop: money(f.drop), newIncome: money(f.newIncome) });
      const body =
        f.gap !== undefined
          ? T("ask.income.short", { allocated: money(f.allocated), gap: money(f.gap) })
          : T("ask.income.fits", { allocated: money(f.allocated), spare: money(f.spare) });
      const score = T("ask.income.score", { scoreBefore: f.scoreBefore, scoreAfter: f.scoreAfter });
      return `${head} ${body} ${score}${hedge}`;
    }

    case "buffer":
      return `${T("ask.buffer.main", {
        months: f.bufferMonths,
        liquid: money(f.liquidSavings),
        mustPaid: money(f.mustPaid),
      })}${hedge}`;

    case "goal_timing": {
      // No `months` ⇒ stage 2 had a balance but no credible pace. State the
      // balance, then say plainly why there is no date — rather than the old
      // behaviour, which withheld the balance too.
      if (f.months === undefined) {
        return `${T("ask.goal.progress", {
          label: outcome.label ?? "",
          saved: money(f.saved),
          target: money(f.target),
          remaining: money(f.remaining),
        })} ${T(outcome.confidence.projectable ? "ask.goal.noPace" : "ask.goal.noDate")}`;
      }
      return `${T("ask.goal.main", {
        label: outcome.label ?? "",
        remaining: money(f.remaining),
        monthly: money(f.monthly),
        months: f.months,
      })}${hedge}`;
    }

    case "spending_summary":
      return `${T("ask.summary.main", { labels: outcome.label ?? "", total: money(f.total) })}${hedge}`;

    case "hscore_explain":
      return `${T("ask.hscore.main", {
        score: f.score,
        component: outcome.label ? T(`hscore.c.${outcome.label}`) : "",
        points: f.weakestPoints ?? 0,
        max: f.weakestMax ?? 0,
      })}${hedge}`;

    default:
      return T("ask.unclear");
  }
}

// ── the model's brief ──────────────────────────────────────────────────────

/**
 * Stage 3's system prompt.
 *
 * It says "explain, do not derive" — and `verifyNumbers` enforces it, because a
 * system prompt is the wrong place to put a guarantee. It also repeats the
 * scope boundary that `IntentKind` already enforces structurally: cheap, and
 * defence in depth costs nothing when the real boundary is elsewhere.
 */
export const NARRATE_SYSTEM = `You are "Honey", HoneyMoney's financial wellness companion for Malaysian families.

You will be given FINAL, ALREADY-CALCULATED numbers. Your only job is to phrase them warmly.

ABSOLUTE RULES:
- Do NOT calculate anything. Do NOT introduce any number that is not in the list you are given
  — no estimates, no totals of your own, no prices, no percentages you worked out.
- Do NOT give financial advice. Never say "you should buy / sell / invest / refinance", never
  recommend a loan, insurance, card or investment product.
- Answer with CONSEQUENCE, not verdict. Never say "you can afford this" or "you can't afford
  this" — state what it would do to their buffer and H-Score and leave the decision to them.
- Marital-safe: never blame a spouse, never interrogate a past purchase, never itemise personal
  spending. Talk about the shared plan, not the person.
- 2-3 short sentences. Warm, plain, forward-looking. Use RM for money.`;

export function narratePrompt(outcome: Outcome, question: string, locale: Locale): string {
  const facts = Object.entries(outcome.facts)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  const lang = locale === "en" ? "" : `\n\nReply in the user's language (${locale}).`;
  return [
    `Their question: ${question}`,
    ``,
    `The calculated result (these are the ONLY numbers you may use):`,
    facts || "(none — this question has no arithmetic)",
    ``,
    `A correct plain answer, for reference — you may re-phrase it more warmly, but you may not`,
    `change any number in it:`,
    narrateTemplate(outcome, locale),
    ``,
    `Now write the answer.${lang}`,
  ].join("\n");
}

// ── the wire: what stage 3 is allowed to send ───────────────────────────────
//
// Everything above this line runs on our own hardware. Everything below decides
// what may leave it.
//
// narratePrompt(), directly above, sends the user's RAW QUESTION and the fully
// rendered template — every computed figure, and every user-authored bucket
// label the template interpolated. In a financial app the typed sentence is the
// most sensitive artifact in the pipeline ("can we afford the IVF round"), and
// stage 3 never needed it: stage 1 already reduced that sentence to a typed
// Intent. It is kept for the local-provider path, where nothing leaves the
// machine and the extra context genuinely improves the phrasing.
//
// For a cloud provider the model gets names instead of values. It writes
// "{amount} would leave you {bufferAfter} months of buffer", and the figures are
// substituted back here after the check below passes. Not minimised personal
// data — none. That is the difference between "we send only what is needed" and
// "we send nothing about you", and only the second is a sentence you can put in
// a privacy notice without a lawyer flinching.

/** How large a change is, without saying how large. Derived here, from exact
 *  figures, so the ordinal is trustworthy and the figures stay home. */
export type Impact = "minor" | "moderate" | "significant";

export function impactOf(outcome: Outcome): Impact | undefined {
  const d = outcome.facts.scoreDelta;
  if (d === undefined) return undefined;
  return d >= 8 ? "significant" : d >= 3 ? "moderate" : "minor";
}

/** Placeholder tokens the model is given, and the only ones it may use back. */
const slot = (name: string) => `{${name}}`;

/**
 * The payload. Built by construction from an allowlist — never by filtering a
 * richer object — which is the outbound twin of validateIntent(). That
 * asymmetry was the bug: what came BACK from a model was rebuilt field by
 * field, and what went OUT was assembled by string concatenation.
 */
export interface Wire {
  kind: string;
  locale: string;
  slots: string[];
  impact?: Impact;
}

export function toWire(outcome: Outcome, locale: Locale): Wire {
  const w: Wire = {
    kind: outcome.kind,
    locale,
    slots: Object.keys(outcome.facts).map(slot),
  };
  const impact = impactOf(outcome);
  if (impact) w.impact = impact;
  return w;
}

/**
 * The tripwire.
 *
 * A rule that is not tested is a rule that gets edited out by someone who did
 * not know it was load-bearing. This asserts the payload carries no digits and
 * no characters outside a deliberately narrow set, so a future field holding a
 * vendor name or an RM figure fails here rather than at the provider.
 */
export function wireIsClean(w: Wire): boolean {
  const s = JSON.stringify(w);
  if (/\d/.test(s)) return false;
  return /^[A-Za-z0-9_{}",:\[\]\s.\-]*$/.test(s.replace(/\d/g, ""));
}

export const WIRE_SYSTEM = `${NARRATE_SYSTEM}

You are writing with PLACEHOLDERS, not numbers. You will be given slot names such
as {amount} or {bufferAfter}. Use them exactly as written, wherever the figure
belongs in your sentence.

- Write NO digits at all. Not a year, not a count, not "2-3". If you need a
  quantity, use a slot or write the word.
- Use only the slots you are given. Do not invent one, and do not use a slot
  twice unless the sentence genuinely repeats that figure.
- You will never be told what any figure IS, and you must not imply you know.
  Do not write "a small amount" or "a healthy buffer" — you cannot see them.`;

export function wirePrompt(w: Wire): string {
  const lang = w.locale === "en" ? "" : `\nWrite in the user's language (${w.locale}).`;
  const impact = w.impact ? `\nThe overall effect on their score is: ${w.impact}.` : "";
  return [
    `Question type: ${w.kind}`,
    `Slots you may use: ${w.slots.join(" ")}`,
    impact,
    ``,
    `Write two or three warm, plain sentences placing every slot where its figure`,
    `belongs. Remember: no digits.${lang}`,
  ].join("\n");
}

/**
 * Put the real figures back, or refuse the answer.
 *
 * Returns null when the prose used a slot that does not exist, or wrote a digit
 * of its own — both of which mean the model produced a figure rather than a
 * place for one. There is no repair pass, for the same reason verifyNumbers has
 * none: repairing it would mean deciding which of its numbers to trust.
 */
export function restoreWire(prose: string, outcome: Outcome): string | null {
  if (/\d/.test(prose)) return null;

  const known = new Set(Object.keys(outcome.facts));
  const used = [...prose.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]);
  if (used.some((name) => !known.has(name))) return null;
  if (!used.length) return null; // an answer with no figures in it answers nothing

  let out = prose;
  for (const name of used) {
    const v = outcome.facts[name];
    // Money-shaped facts read as money; counts, months and scores read bare.
    // MONEY_SLOTS is explicit rather than inferred from magnitude, because
    // guessing wrong renders a score of 72 as "RM72".
    const text = MONEY_SLOTS.has(name) ? money(v) : String(v);
    out = out.split(slot(name)).join(text);
  }
  // Belt and braces: the restored prose goes through the same allowlist the
  // template path uses, so a substitution bug cannot ship a figure stage 2
  // never computed.
  return verifyNumbers(out, outcome).ok ? out : null;
}

const MONEY_SLOTS = new Set([
  "amount", "headroom", "shortfall", "newIncome", "oldIncome", "drop", "allocated",
  "gap", "spare", "liquidSavings", "mustPaid", "target", "saved", "remaining",
  "monthly", "total", "cat1", "cat2", "cat3",
]);
