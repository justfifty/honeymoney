// Ask Honey — STAGE 1 of 3: parse intent.
//
//   parse (here) → compute (askCompute.ts) → narrate (askNarrate.ts)
//
// This file turns a sentence into a small typed object and NOTHING else. It
// never touches the database, never computes a figure, and never phrases an
// answer. That separation is the whole point: stage 2 owns every number, so a
// model can be wrong about what was asked without being able to be wrong about
// what is true.
//
// ── WHY THE ALLOWLIST IS THE SCOPE CONTROL ─────────────────────────────────
//
// A system prompt saying "don't give investment advice" is a request. `IntentKind`
// is a boundary: an intent that is not in this union cannot reach stage 2, so
// there is no code path that computes an answer to "which unit trust should I
// buy?" — not a reluctant one, not a hedged one, none. The prompt still says it
// too, because defence in depth is cheap, but the union is what actually holds.
//
// Out-of-scope classification runs FIRST and wins outright. Otherwise
// "should I invest my RM5,000 bonus?" parses as afford(5000) — a perfectly
// well-formed in-scope intent, answered with a confident irrelevance. The
// number is the trap: it makes the wrong reading look right.

export type DeclineReason =
  | "product_recommendation"
  | "investment"
  | "debt_restructure"
  | "tax_position"
  | "not_your_money";

export type IntentKind =
  // ── in scope: arithmetic on the household's own records ──
  | "afford"
  | "income_change"
  | "goal_timing"
  | "spending_summary"
  | "hscore_explain"
  | "buffer"
  | "statutory"
  // ── in scope, but unanswerable as asked ──
  | "needs_price"
  // ── declined ──
  | "out_of_scope"
  | "unclear";

export interface Intent {
  kind: IntentKind;
  /** RM figure the user supplied. NEVER a figure we supplied for them. */
  amount?: number;
  pct?: number;
  /** What they asked about ("a TV"), sanitised — used to ask for a price. */
  label?: string;
  category?: string;
  /** "every month" / "monthly" — changes the arithmetic entirely. */
  recurring?: boolean;
  declineReason?: DeclineReason;
}

export const IN_SCOPE: IntentKind[] = [
  "afford",
  "income_change",
  "goal_timing",
  "spending_summary",
  "hscore_explain",
  "buffer",
  "statutory",
];

// ── out of scope ────────────────────────────────────────────────────────────
//
// Each of these is a DIFFERENT PRODUCT with a different risk profile, and in
// Malaysia most of them are licensed activity. Declining is not timidity; it is
// the difference between a budgeting tool and one that needs a licence.
// The decline is routed to the existing regulatory-safe directory rather than
// left as a dead end — the user asked something reasonable, just not of us.
const DECLINE: { reason: DeclineReason; re: RegExp }[] = [
  {
    reason: "investment",
    re: /\b(invest|investing|investment|stock|stocks|share market|shares|crypto|bitcoin|ethereum|unit trust|asnb|amanah saham|etf|reit|forex|trading|portfolio|dividend)\b/i,
  },
  {
    reason: "debt_restructure",
    re: /\b(consolidat\w*|restructur\w*|refinanc\w*|balance transfer|akpk|bankrupt\w*|settle my (debt|loan)|debt management)\b/i,
  },
  {
    reason: "tax_position",
    re: /\b(tax relief|tax deduction|tax refund|income tax|lhdn|e-?filing|taxable|tax bracket|capital gains)\b/i,
  },
  {
    reason: "product_recommendation",
    re: /\b(which|what|best|recommend|suggest|compare|better|should i (?:take|get|sign))\b[^?]{0,40}\b(loan|insurance|takaful|policy|credit card|card|bank|account|mortgage|financing|provider|broker)\b|\b(loan|insurance|takaful|credit card)\b[^?]{0,25}\b(should|recommend|suggest|best|better)\b/i,
  },
];

// EPF / SOCSO / EIS rates are published statutory FACTS, not a tax position, and
// lib/statutory.ts already grounds them in verified figures. Deliberately kept
// in scope — "what's my EPF on RM4,000?" is arithmetic, while "what tax relief
// can I claim?" is a position on someone's filing. The line is whether the
// answer varies with circumstances we cannot see.
const STATUTORY_RE = /\b(epf|kwsp|socso|perkeso|eis|sip|statutory|take[- ]?home|gaji bersih)\b/i;

// ── number parsing ──────────────────────────────────────────────────────────

/**
 * Pull an RM figure out of the sentence.
 *
 * Prefers an explicitly-marked amount ("RM2,000") over a bare number, because a
 * bare number in "what if income drops 20" is a percentage wearing a disguise.
 * Returns null rather than a default — see needs_price. A default here is how a
 * budgeting tool starts inventing prices.
 */
export function parseAmount(q: string): number | null {
  const marked = q.match(/rm\s*([\d,]+(?:\.\d+)?)\s*(k\b)?/i);
  if (marked) {
    const n = Number(marked[1].replace(/,/g, ""));
    if (Number.isFinite(n)) return marked[2] ? n * 1000 : n;
  }
  // "1.5k" / "20k"
  const k = q.match(/\b([\d,]+(?:\.\d+)?)\s*k\b/i);
  if (k) {
    const n = Number(k[1].replace(/,/g, ""));
    if (Number.isFinite(n)) return n * 1000;
  }
  // A bare number, but not one that is immediately a percentage or a year.
  const bare = q.match(/\b(\d{2,}(?:,\d{3})*(?:\.\d+)?)\b(?!\s*%)/);
  if (bare) {
    const n = Number(bare[1].replace(/,/g, ""));
    if (Number.isFinite(n) && !(n >= 1990 && n <= 2100)) return n;
  }
  return null;
}

export function parsePct(q: string): number | null {
  const m = q.match(/(\d{1,3}(?:\.\d+)?)\s*(?:%|per\s?cent|percent|peratus)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
}

/**
 * What the user wants to buy, for the "tell me a price" reply.
 *
 * Sanitised hard and capped: this string is the ONE piece of raw user text that
 * reaches the narration, so it is stripped to letters, digits and spaces. A
 * label is a noun, not a payload.
 */
function parseLabel(q: string): string | undefined {
  const m = q.match(
    /\b(?:afford|buy|get|purchase|beli|mampu(?:kah)?)\b\s+(?:a|an|the|some|us|me|myself)?\s*([^?.,!]{2,40})/i,
  );
  if (!m) return undefined;
  const clean = m[1]
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  if (!clean || /^\d+$/.test(clean)) return undefined;
  // Strip a trailing time-phrase so "a TV this month" asks about a TV.
  return clean.replace(/\s+(this|next|every)\s+(month|year|week)$/i, "").trim() || undefined;
}

const AFFORD_RE =
  /\b(afford|can (?:we|i) (?:buy|get|spend)|mampu|boleh (?:kami|saya) beli|budget for|spare)\b/i;
const INCOME_RE = /\b(income|salary|gaji|pay|wage|earn)\b/i;
const DROP_RE = /\b(drop|drops|fall|falls|cut|lose|lost|reduce[sd]?|less|turun|down|hilang)\b/i;
const RISE_RE = /\b(rise|rises|increase[sd]?|raise|more|up|naik|bonus)\b/i;
const GOAL_RE = /\b(goal|target|save (?:up )?for|when will|how long until|reach|sasaran|matlamat)\b/i;
const SUMMARY_RE =
  /\b(where (?:did|does)|how much (?:did|do|have)|spend(?:ing)? on|breakdown|summary|pattern|most on|biggest)\b/i;
const HSCORE_RE = /\b(h-?score|score|band|rating|improve my|how (?:do|can) (?:i|we) improve)\b/i;
const BUFFER_RE =
  /\b(buffer|emergency|how long (?:could|can|would) (?:we|i) last|runway|survive|kecemasan)\b/i;

/**
 * Deterministic intent parse. **Works with no model at all** — this is the
 * floor, not the fallback. A model may later be asked for a second opinion on a
 * sentence this cannot classify, but its answer is validated back through
 * `validateIntent` into exactly this shape before anything acts on it.
 */
export function parseIntent(question: string): Intent {
  const q = question.trim();
  if (!q) return { kind: "unclear" };

  // Declines win. See the header — a well-formed in-scope reading of an
  // out-of-scope question is more dangerous than no reading at all.
  for (const d of DECLINE) {
    if (d.re.test(q)) return { kind: "out_of_scope", declineReason: d.reason };
  }

  const amount = parseAmount(q) ?? undefined;
  const pct = parsePct(q) ?? undefined;
  const recurring =
    /\b(every month|monthly|per month|a month|each month|sebulan|setiap bulan)\b/i.test(q);

  if (
    INCOME_RE.test(q) &&
    (DROP_RE.test(q) || RISE_RE.test(q)) &&
    (pct !== undefined || amount !== undefined)
  ) {
    return { kind: "income_change", pct, amount, recurring };
  }

  if (AFFORD_RE.test(q)) {
    // The brief's sharpest requirement: an affordability question with no price
    // is ASKED ABOUT, never guessed at and never looked up. Guessing turns a
    // budgeting tool into a product recommender — a different product with a
    // different risk profile — and a looked-up price is someone else's TV.
    if (amount === undefined) return { kind: "needs_price", label: parseLabel(q) };
    return { kind: "afford", amount, label: parseLabel(q), recurring };
  }

  if (STATUTORY_RE.test(q)) return { kind: "statutory", amount };
  if (BUFFER_RE.test(q)) return { kind: "buffer" };
  if (HSCORE_RE.test(q)) return { kind: "hscore_explain" };
  if (GOAL_RE.test(q)) return { kind: "goal_timing", amount };
  if (SUMMARY_RE.test(q)) return { kind: "spending_summary" };

  // A bare amount with no verb is very likely an affordability question.
  if (amount !== undefined) return { kind: "afford", amount, recurring };

  return { kind: "unclear" };
}

/**
 * The gate every model-produced intent must pass.
 *
 * A model is allowed to *classify*; it is not allowed to define the type. This
 * rebuilds the object field by field from an unknown value, so an unexpected
 * `kind`, an amount smuggled in as a string, or an extra key carrying a nudge
 * to stage 3 all end up as `unclear` rather than as instructions.
 */
export function validateIntent(raw: unknown): Intent {
  if (!raw || typeof raw !== "object") return { kind: "unclear" };
  const o = raw as Record<string, unknown>;

  const kind = o.kind;
  const allowed: IntentKind[] = [...IN_SCOPE, "needs_price", "out_of_scope", "unclear"];
  if (typeof kind !== "string" || !allowed.includes(kind as IntentKind)) return { kind: "unclear" };

  const num = (v: unknown, max: number): number | undefined => {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > max) return undefined;
    return Math.round(v * 100) / 100;
  };
  const clean = (v: unknown): string | undefined => {
    if (typeof v !== "string") return undefined;
    const s = v
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
    return s || undefined;
  };

  const out: Intent = { kind: kind as IntentKind };
  const amount = num(o.amount, 1e9);
  if (amount !== undefined) out.amount = amount;
  const pct = num(o.pct, 100);
  if (pct !== undefined) out.pct = pct;
  if (typeof o.recurring === "boolean") out.recurring = o.recurring;
  const label = clean(o.label);
  if (label) out.label = label;
  const category = clean(o.category);
  if (category) out.category = category;

  const reasons: DeclineReason[] = [
    "product_recommendation",
    "investment",
    "debt_restructure",
    "tax_position",
    "not_your_money",
  ];
  if (typeof o.declineReason === "string" && reasons.includes(o.declineReason as DeclineReason)) {
    out.declineReason = o.declineReason as DeclineReason;
  }

  // An afford intent that arrives without a price becomes a request for one.
  // A model that helpfully filled in "a TV is about RM2,000" is exactly the
  // failure this whole file exists to prevent, and it would arrive looking
  // perfectly valid.
  if (out.kind === "afford" && out.amount === undefined) {
    return { kind: "needs_price", label: out.label };
  }

  return out;
}
