// What KIND of money is this? — the on-device, zero-token classifier.
//
// One table, two callers: the landing page's try-it box (app/TryItNow.tsx) and
// the signed-in Record screen (app/dashboard/AddTransaction.tsx). It used to
// live inside TryItNow as two regexes that knew about must-paid and savings and
// nothing else, which had two consequences:
//
//   1. The demo could not recognise INCOME. Typing "Salary 5000" into the
//      three-second hook on the landing page filed it as *Spendings* — the one
//      classification that is not merely imprecise but backwards, in front of
//      the judge the box exists to convince.
//   2. The signed-in form asked for the classification the demo performed for
//      free. A visitor got smart filing; a customer got a radio group.
//
// ── WHY A KEYWORD TABLE AND NOT A MODEL ────────────────────────────────────
//
// It must resolve in the same tick as the keystroke, work in flight mode, cost
// nothing, and survive the question every judge asks — "what happens when your
// AI is wrong?" — with an answer you can read. A household's own filing history
// still beats it, and lib/receipt.ts uses exactly that for the scanned path.
// This is the cold start, and the cold start only has to be right often enough
// to be worth accepting with one tap.
//
// ── THE ORDER IS THE DESIGN ────────────────────────────────────────────────
//
// Income is tested FIRST, because the words that mean earnings contain the
// words that mean bills: "rental income" contains *rent*, "EPF dividend"
// contains *EPF*, an "insurance payout" contains *insurance*. Testing the
// expense tables first files every one of them as money going OUT — the
// direction wrong, not merely the bucket.
//
// When two tables match, the answer is not more trustworthy for having been
// decided twice: it is less. `confidence` drops below the check-this threshold
// so the user is invited to correct it, and the correction is what the
// household's own filing history learns from.

import type { Category } from "./recordKind";

// ── the tables ─────────────────────────────────────────────────────────────

/**
 * Earnings — money the household is genuinely richer for.
 *
 * These, and only these, produce `category: "income"`, which is what creates the
 * `income_source` node (lib/graph.ts) that every income figure in the app reads.
 * Anything vaguer belongs in the table below it.
 */
const INCOME =
  /\b(salary|salaries|gaji|payslip|payday|wage|wages|upah|paycheck|bonus|bonuses|komisen|commission|freelance|invoice|consulting fee|dividend|dividends|dividen|rental income|rent received|sewa diterima|royalty|royalties|royalti|pension|pencen|annuity|elaun|allowance|stipend|honorarium|part-time|sambilan|side hustle|earnings|pendapatan|takings|payout)\b|工资|薪水|薪金|奖金|花红|佣金|股息|租金收入|收入|சம்பளம்|வருமானம்|वेतन|तनख्वाह|आय/i;

/**
 * Money in that is NOT earnings — a refund, a rebate, a gift, a windfall.
 *
 * Kept apart from `income` on purpose. A refund is money coming back, not money
 * being earned, and folding the two together is exactly how an RM19 Grab refund
 * became an RM19/month salary in a live household (NEXT.md, 2026-08-26). It
 * records as an inflow, stays out of spend, and never claims to be a salary.
 */
const INCOME_OTHER =
  /\b(refund|refunded|rebate|cashback|reimburse|reimbursed|reimbursement|paid me back|pulangan|bayaran balik|ganti rugi|gift|hadiah|angpow|angpau|ang pow|duit raya|inheritance|pusaka|prize|winnings|lottery|menang|sale proceeds)\b|退款|返现|回扣|红包|中奖|பரிசு|वापसी|उपहार|इनाम/i;

/** Money moved into the household's own savings — a transfer, never income. */
const SAVINGS =
  /\b(save|saving|savings|simpan|simpanan|tabung|asb|asnb|invest|investment|labur|pelaburan|emergency fund|dana kecemasan|fd|fixed deposit|unit trust|epf|kwsp)\b|储蓄|存钱|投资|定存|சேமிப்பு|முதலீடு|बचत|निवेश/i;

/** The non-negotiables — tier 1. */
const MUST_PAID =
  /\b(rent|sewa|tnb|air|water|electric|elektrik|bill|bills|bil|insurance|insuran|takaful|loan|pinjaman|instalment|installment|ansuran|astro|unifi|maxis|celcom|digi|umobile|streamyx|school|sekolah|tuition|tuisyen|nursery|taska|petrol|toll|tol|mortgage|cukai|assessment|quit rent|maintenance fee|yuran)\b|房租|水电|保险|学费|管理费|வாடகை|கட்டணம்|किराया|बिजली|बीमा/i;

// ── the result ─────────────────────────────────────────────────────────────

export interface Classified {
  category: Category;
  /**
   * How far the table trusts itself, 0–1. Below 0.6 the surfaces show a
   * check-this prompt and open the correction — the same threshold the capture
   * form already uses for a shaky parse, so one number means one thing.
   */
  confidence: number;
  /** True when more than one table matched — the reason confidence dropped. */
  ambiguous: boolean;
  /** The word that decided it, for a UI that wants to show its working. */
  matched: string | null;
}

/** No keyword matched: the cold-start default, and the cheapest thing to be wrong about. */
const UNMATCHED: Classified = { category: "spendings", confidence: 0.65, ambiguous: false, matched: null };

// The array order IS the precedence. See the header.
const TABLES: [Category, RegExp][] = [
  ["income", INCOME],
  ["income_other", INCOME_OTHER],
  ["savings", SAVINGS],
  ["must_paid", MUST_PAID],
];

/**
 * Classify a line of free text into one of the record categories.
 *
 * Never throws, never touches the network, and answers `spendings` when it
 * recognises nothing.
 */
export function classifyText(text: string): Classified {
  const value = text.trim();
  if (!value) return UNMATCHED;

  const hits: { category: Category; matched: string }[] = [];
  for (const [category, re] of TABLES) {
    const m = value.match(re);
    if (m) hits.push({ category, matched: m[0] });
  }
  if (!hits.length) return UNMATCHED;

  // A second hit does not change the answer; it changes how loudly we ask to be
  // corrected.
  const ambiguous = hits.length > 1;
  return {
    category: hits[0].category,
    confidence: ambiguous ? 0.55 : 0.9,
    ambiguous,
    matched: hits[0].matched,
  };
}

// ── how each category looks, in every surface that draws one ───────────────
//
// Tailwind class strings in lib/ follow the precedent of SIGN_STYLE in
// lib/recordKind.ts, and for the same reason: the palette carries meaning —
// amber for money in, matching the `+` toggle and the money-in figures on
// /records — so it belongs with the model rather than being re-chosen in each
// component and drifting apart.

export const CATEGORY_STYLE: Record<Category, { emoji: string; chip: string }> = {
  income: {
    emoji: "💰",
    chip: "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:ring-amber-900",
  },
  income_other: {
    emoji: "↩️",
    chip: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900",
  },
  savings: {
    emoji: "🌱",
    chip: "bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-950/60 dark:text-sky-200 dark:ring-sky-900",
  },
  must_paid: {
    emoji: "🔒",
    chip: "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:ring-emerald-900",
  },
  spendings: {
    emoji: "🫙",
    chip: "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:ring-amber-900",
  },
  expense_other: {
    emoji: "🧾",
    chip: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700",
  },
};

/** The i18n key for Honey's one-line read on a category. */
export function noteKeyFor(category: Category): string {
  return `try.honey.${category}`;
}
