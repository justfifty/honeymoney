// H-Score — HoneyMoney's money health score (UI/UX spec v2).
//
// Five components, no engagement points inside the score: logging more does not
// make you healthier, and a score you can farm is a score nobody trusts.
//
//   Savings rate      30   savings ÷ net income
//   Essential burden  25   must-paid ÷ net income
//   Debt service      20   loan repayments ÷ gross income
//   Emergency buffer  20   liquid savings ÷ monthly must-paid
//   Privacy discipline 5   privacy spend vs the user's OWN cap, trailing 3 months
//
// Bands are Building / Steady / Strong / Thriving. Deliberately no "Fail":
// the households who most need this are the ones a failing grade drives away.
//
// Three mechanics make a live score usable rather than jumpy:
//   • a rolling 90-day window, so the score isn't nonsense on the 2nd
//   • amortisation of lumpy items over 12 months, so one legitimate RM2,400
//     road-tax payment doesn't crater the month
//   • hysteresis on the BAND only — sub-scores move instantly and visibly, but
//     the tier waits for the score to hold across the boundary for 7 days
//
// Pure and dependency-free by design: this runs client-side, over the user's own
// trailing data, so the score never needs to leave the device to be computed.

export type Band = "building" | "steady" | "strong" | "thriving";

export type ComponentKey = "savingsRate" | "essentialBurden" | "debtService" | "emergencyBuffer" | "privacyDiscipline";

export const WINDOW_DAYS = 90;
export const AMORTISE_MONTHS = 12;
export const HYSTERESIS_DAYS = 7;

/** Data-confidence gate — below these, the score shows as Provisional. */
export const MIN_TXNS_30D = 20;

export const BANDS: { band: Band; min: number; max: number }[] = [
  { band: "building", min: 0, max: 39 },
  { band: "steady", min: 40, max: 59 },
  { band: "strong", min: 60, max: 79 },
  { band: "thriving", min: 80, max: 100 },
];

export function bandFor(score: number): Band {
  return BANDS.find((b) => score >= b.min && score <= b.max)?.band ?? "building";
}

// ── Piecewise-linear anchors ────────────────────────────────────────────────
// Each curve is [measure, points], and the score interpolates linearly between
// neighbouring anchors. Anchors beat a formula here because they encode a
// judgement about what "good" means at each level, and that judgement is
// reviewable by a human who doesn't read code.

type Curve = [number, number][];

const CURVES: Record<ComponentKey, { max: number; curve: Curve; higherIsBetter: boolean }> = {
  // savings ÷ net income — more is better
  savingsRate: {
    max: 30,
    higherIsBetter: true,
    curve: [
      [0, 0],
      [0.05, 8],
      [0.1, 15],
      [0.15, 21],
      [0.2, 26],
      [0.25, 30],
    ],
  },
  // must-paid ÷ net income — less is better
  essentialBurden: {
    max: 25,
    higherIsBetter: false,
    curve: [
      [0.5, 25],
      [0.55, 21],
      [0.65, 15],
      [0.75, 8],
      [0.85, 0],
    ],
  },
  // debt repayments ÷ gross income — less is better
  debtService: {
    max: 20,
    higherIsBetter: false,
    curve: [
      [0.2, 20],
      [0.3, 17],
      [0.4, 12],
      [0.5, 6],
      [0.6, 0],
    ],
  },
  // liquid savings ÷ monthly must-paid, in months — more is better
  emergencyBuffer: {
    max: 20,
    higherIsBetter: true,
    curve: [
      [0.5, 0],
      [1, 5],
      [3, 12],
      [6, 18],
      [9, 20],
    ],
  },
  // months (of the trailing 3) the user stayed within their OWN privacy cap
  privacyDiscipline: {
    max: 5,
    higherIsBetter: true,
    curve: [
      [0, 0],
      [1, 2],
      [2, 4],
      [3, 5],
    ],
  },
};

/** Linear interpolation along an anchor curve, clamped at both ends. */
export function interpolate(curve: Curve, x: number): number {
  if (x <= curve[0][0]) return curve[0][1];
  const last = curve[curve.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < curve.length; i++) {
    const [x0, y0] = curve[i - 1];
    const [x1, y1] = curve[i];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return last[1];
}

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface ScoreInputs {
  /** Monthly averages over the rolling window, already amortised. */
  netIncomeMonthly: number;
  grossIncomeMonthly: number;
  savingsMonthly: number;
  mustPaidMonthly: number;
  debtRepaymentsMonthly: number;
  /** A stock, not a flow: what's actually liquid right now. */
  liquidSavings: number;
  /** The user's own privacy cap, and their trailing 3 months of privacy spend. */
  privacyCapMonthly: number;
  privacyTrailing3: number[];
}

export interface SubScore {
  key: ComponentKey;
  points: number;
  max: number;
  /** The underlying ratio (or months, for the buffer) — what the UI labels. */
  measure: number;
  /** Rendered as a percentage by the UI? False for the buffer, which is months. */
  isRatio: boolean;
}

export interface Confidence {
  /** False ⇒ render the ring greyed and the score as "Provisional". */
  ok: boolean;
  /** Exactly what's missing, so the UI can say so rather than just withhold. */
  missing: Array<"income" | "transactions" | "buckets">;
  txns30d: number;
}

export interface HScore {
  score: number;
  /** The band the score alone implies, before hysteresis. */
  rawBand: Band;
  /** What the user is actually shown — see applyHysteresis(). */
  band: Band;
  subScores: SubScore[];
  confidence: Confidence;
}

// ── The score ───────────────────────────────────────────────────────────────

function sub(key: ComponentKey, measure: number, isRatio = true): SubScore {
  const { max, curve } = CURVES[key];
  const safe = Number.isFinite(measure) ? measure : 0;
  return { key, points: Math.round(interpolate(curve, safe) * 10) / 10, max, measure: safe, isRatio };
}

const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);

export function computeSubScores(i: ScoreInputs): SubScore[] {
  const monthsWithinCap = i.privacyTrailing3.filter(
    (spend) => i.privacyCapMonthly > 0 && spend <= i.privacyCapMonthly,
  ).length;

  return [
    sub("savingsRate", safeDiv(i.savingsMonthly, i.netIncomeMonthly)),
    sub("essentialBurden", safeDiv(i.mustPaidMonthly, i.netIncomeMonthly)),
    sub("debtService", safeDiv(i.debtRepaymentsMonthly, i.grossIncomeMonthly)),
    sub("emergencyBuffer", safeDiv(i.liquidSavings, i.mustPaidMonthly), false),
    sub("privacyDiscipline", monthsWithinCap, false),
  ];
}

export function computeHScore(inputs: ScoreInputs, confidence: Confidence): HScore {
  const subScores = computeSubScores(inputs);
  const score = Math.round(subScores.reduce((s, c) => s + c.points, 0));
  const rawBand = bandFor(score);
  return { score, rawBand, band: rawBand, subScores, confidence };
}

// ── Data-confidence gate ────────────────────────────────────────────────────
// The honest answer to "how do you score without bank links": we say what we
// don't yet know, instead of projecting false precision from three receipts.

export function assessConfidence(input: {
  incomeDeclared: boolean;
  txns30d: number;
  bucketsWithEntries: number;
  bucketsTotal: number;
}): Confidence {
  const missing: Confidence["missing"] = [];
  if (!input.incomeDeclared) missing.push("income");
  if (input.txns30d < MIN_TXNS_30D) missing.push("transactions");
  if (input.bucketsWithEntries < input.bucketsTotal || input.bucketsTotal === 0) missing.push("buckets");
  return { ok: missing.length === 0, missing, txns30d: input.txns30d };
}

// ── Hysteresis ──────────────────────────────────────────────────────────────
// Sub-scores are allowed to twitch — that's feedback. The BAND is an identity
// ("I'm Steady"), and an identity that flips twice a week is worthless. So a new
// band has to hold for 7 consecutive days before it's awarded or withdrawn.

export interface BandState {
  /** The band currently shown to the user. */
  band: Band;
  /** A different band the raw score has been sitting in, and since when. */
  pendingBand?: Band;
  pendingSince?: string; // ISO date
}

const DAY_MS = 86_400_000;

export function applyHysteresis(
  rawBand: Band,
  prior: BandState | null,
  asOf: Date = new Date(),
  holdDays = HYSTERESIS_DAYS,
): BandState {
  if (!prior) return { band: rawBand };
  if (rawBand === prior.band) return { band: prior.band }; // back home, clear any pending

  if (prior.pendingBand !== rawBand) {
    // A new candidate band — start its clock.
    return { band: prior.band, pendingBand: rawBand, pendingSince: asOf.toISOString() };
  }

  const since = new Date(prior.pendingSince ?? asOf.toISOString()).getTime();
  const heldDays = (asOf.getTime() - since) / DAY_MS;
  if (heldDays >= holdDays) return { band: rawBand };

  return { band: prior.band, pendingBand: rawBand, pendingSince: prior.pendingSince };
}

// ── Amortisation ────────────────────────────────────────────────────────────
// Road tax, annual insurance, school fees, Raya. A household that pays RM2,400
// once a year is not having a catastrophic month — it's having an ordinary year.

export interface AmortisableTxn {
  amount: number;
  occurredAt: string;
  /** Set when the user flags an entry as annual/recurring during capture. */
  recurrence?: "annual" | "monthly" | null;
}

/**
 * Monthly-equivalent total over the rolling window: annual items contribute
 * 1/12 of their value, everything else contributes at face value, and the whole
 * lot is divided by the window length in months.
 */
export function monthlyEquivalent(
  txns: AmortisableTxn[],
  asOf: Date = new Date(),
  windowDays = WINDOW_DAYS,
): number {
  const from = asOf.getTime() - windowDays * DAY_MS;
  let total = 0;
  for (const t of txns) {
    const ts = new Date(t.occurredAt.replace(" ", "T")).getTime();
    if (!Number.isFinite(ts) || ts < from || ts > asOf.getTime()) continue;
    total += t.recurrence === "annual" ? t.amount / AMORTISE_MONTHS : t.amount;
  }
  const months = windowDays / 30;
  return Math.round((total / months) * 100) / 100;
}

// ── "What moved your score" ─────────────────────────────────────────────────
// Deterministic on purpose. An LLM writing this sentence could hallucinate a
// financial claim; a template over the largest sub-score delta cannot. This is
// the same invariant the rest of the app runs on — AI proposes, it never asserts.

export interface ScoreMovement {
  /** i18n key for the sentence template. */
  key: string;
  vars: Record<string, string | number>;
}

export function describeMovement(current: HScore, previous: HScore | null): ScoreMovement | null {
  if (!previous) return null;

  const delta = current.score - previous.score;
  if (delta === 0) return { key: "hscore.moved.flat", vars: {} };

  const prevByKey = new Map(previous.subScores.map((s) => [s.key, s]));
  let biggest: { key: ComponentKey; from: number; to: number; delta: number } | null = null;

  for (const s of current.subScores) {
    const p = prevByKey.get(s.key);
    if (!p) continue;
    const d = s.points - p.points;
    if (!biggest || Math.abs(d) > Math.abs(biggest.delta)) {
      biggest = { key: s.key, from: p.measure, to: s.measure, delta: d };
    }
  }

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const isRatio = current.subScores.find((s) => s.key === biggest?.key)?.isRatio ?? true;
  const fmt = (v: number) => (isRatio ? pct(v) : `${Math.round(v * 10) / 10}`);

  return {
    key: delta > 0 ? "hscore.moved.up" : "hscore.moved.down",
    vars: {
      points: Math.abs(delta),
      component: biggest ? `hscore.c.${biggest.key}` : "",
      from: biggest ? fmt(biggest.from) : "",
      to: biggest ? fmt(biggest.to) : "",
    },
  };
}

// ── Next best action ────────────────────────────────────────────────────────
// The Building tier gets a named ringgit gap rather than applause. This computes
// it: how much more per month into the weakest component reaches the next band.

export function pointsToNextBand(score: number): number {
  const next = BANDS.find((b) => b.min > score);
  return next ? next.min - score : 0;
}

/**
 * RM/month more into savings that would close the gap to the next band.
 * Returns null when savings isn't the effective lever (already maxed, or no
 * income declared to compute a rate against).
 */
export function savingsGapToNextBand(inputs: ScoreInputs, score: number): number | null {
  const needed = pointsToNextBand(score);
  if (needed <= 0 || inputs.netIncomeMonthly <= 0) return null;

  const { curve, max } = CURVES.savingsRate;
  const currentPoints = interpolate(curve, safeDiv(inputs.savingsMonthly, inputs.netIncomeMonthly));
  const targetPoints = currentPoints + needed;
  if (targetPoints > max) return null;

  // Invert the curve: find the rate that yields targetPoints.
  for (let i = 1; i < curve.length; i++) {
    const [x0, y0] = curve[i - 1];
    const [x1, y1] = curve[i];
    if (targetPoints <= y1) {
      const rate = x0 + ((targetPoints - y0) / (y1 - y0)) * (x1 - x0);
      const gap = rate * inputs.netIncomeMonthly - inputs.savingsMonthly;
      return gap > 0 ? Math.round(gap) : null;
    }
  }
  return null;
}
