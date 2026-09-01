// A receipt checks itself. Nothing was using that.
//
// ── THE IDEA ───────────────────────────────────────────────────────────────
//
// Every printed receipt carries the same figure two or three times over, related
// by arithmetic that must hold:
//
//     items         →  subtotal
//     subtotal + service charge + tax + rounding  →  total
//
// That redundancy is an error-detecting code, and it is free. If a reader hands
// back items summing to 48.00, a subtotal of 48.00, a service charge of 4.80, a
// tax of 3.17 and a total of 5.97, we do not need a second model to know the
// total is wrong — the receipt says so. Equally, when every relation holds, the
// read is corroborated by something other than the model's opinion of itself.
//
// Both readers were being taken at their word until now. The vision model
// reports its own confidence, which is exactly the number a model that cannot
// see is worst at producing — that is the whole subject of the 2026-09-01
// fabrication, and the confidence floor in lib/receipt.ts is a patch over the
// same wound. Tesseract reports nothing at all, so the local parser assembles a
// confidence out of "did I find a vendor, did I find a date", which measures how
// much was found rather than whether any of it is right.
//
// ── WHAT THIS DOES, AND WHAT IT REFUSES TO DO ──────────────────────────────
//
// It REPAIRS only what is arithmetically forced: a single missing figure that
// the others determine exactly. That is not guessing — the receipt states it, in
// the same sense that the last digit of an ISBN is stated.
//
// It NEVER repairs a contradiction. Two figures that disagree could each be the
// wrong one, and picking the "more likely" of them is precisely the kind of
// plausible invention this codebase has already been burned by. A contradiction
// lowers confidence and names the suspect field, so the UI opens the editor with
// the user's attention pointed at the right row. A person holding the paper
// resolves in two seconds what a model cannot resolve at all.
//
// Nothing here is a network call, a model, or a heuristic about Malaysian
// retail. It is arithmetic, and scripts/check-receipt.mts checks it.

import { sen } from "./receiptSplit";

export interface MathInput {
  amount: number;
  subtotal: number;
  serviceCharge: number;
  tax: number;
  rounding: number;
  total: number;
  lineItems: { label: string; amount: number; discount?: boolean }[];
}

export type SuspectField = "total" | "subtotal" | "items" | "tax" | "serviceCharge";

export interface MathVerdict {
  /** Figures after repair. Only ever fills blanks; never overwrites a stated one. */
  repaired: MathInput;
  /** What was filled in from the rest, for the audit note and the UI. */
  repairs: { field: keyof MathInput; value: number; because: string }[];
  /** Relations that were checkable and held. More is better evidence. */
  confirmed: string[];
  /** Relations that were checkable and did NOT hold. */
  conflicts: { relation: string; expected: number; found: number; suspect: SuspectField }[];
  /**
   * Multiplier for the reader's own confidence, in [0.35, 1.15].
   *
   * A multiplier rather than a replacement: this knows whether the numbers are
   * self-consistent, and knows nothing at all about whether the merchant name
   * was read correctly or the image was even a receipt. Corroborating evidence
   * should move a confidence, not become it.
   */
  factor: number;
}

// Money read off paper does not land exactly. A percentage-derived service
// charge is rounded by the till, Malaysia rounds cash to 5 sen, and a discount
// applied per-line can leave a sen against the printed subtotal. Two sen is
// tight enough to catch a transposed digit and loose enough not to cry wolf.
const EPS = 0.02;

/** Malaysian 5-sen cash rounding, plus the same slack. */
const ROUNDING_EPS = 0.06;

function near(a: number, b: number, eps = EPS): boolean {
  return Math.abs(a - b) <= eps;
}

function itemsSum(items: MathInput["lineItems"]): number {
  return sen(items.reduce((s, i) => s + (i.discount ? -i.amount : i.amount), 0));
}

/**
 * Check a reading against its own arithmetic; fill only what is forced.
 *
 * Order matters. Repairs run before checks, so a figure recovered from the
 * others is then used to corroborate the rest — a receipt with a torn-off
 * subtotal still verifies its total against its items.
 */
export function verify(input: MathInput): MathVerdict {
  const r: MathInput = { ...input, lineItems: [...input.lineItems] };
  const repairs: MathVerdict["repairs"] = [];
  const confirmed: string[] = [];
  const conflicts: MathVerdict["conflicts"] = [];
  /**
   * Set when the subtotal below was computed FROM the total.
   *
   * A relation cannot corroborate itself. If we derived the subtotal by
   * subtracting the charges from the total, then "subtotal + charges = total"
   * holds by construction and proves nothing — counting it would turn our own
   * arithmetic into evidence about the receipt. The repair is still worth making
   * (the user sees a subtotal instead of a blank); it simply earns no credit.
   */
  let derivedSubtotalFromTotal = false;

  const charges = sen(r.serviceCharge + r.tax + r.rounding);
  const sum = itemsSum(r.lineItems);
  const hasItems = r.lineItems.length > 0 && sum > 0;

  // ── REPAIR: only ever a blank, never a disagreement ──────────────────────

  // A subtotal the receipt did not print (or the reader missed) is exactly the
  // sum of the items. This is the commonest gap: plenty of receipts jump
  // straight from the list to the total.
  if (!r.subtotal && hasItems) {
    r.subtotal = sum;
    repairs.push({
      field: "subtotal",
      value: sum,
      because: "the items add up to it",
    });
  }

  // A missing total, with a subtotal and charges in hand, is determined.
  if (!r.total && r.subtotal) {
    r.total = sen(r.subtotal + charges);
    repairs.push({
      field: "total",
      value: r.total,
      because: charges ? "subtotal plus the printed charges" : "it equals the subtotal",
    });
  }

  // And the reverse: a total with charges but no subtotal.
  //
  // ⚠️ ONLY when there ARE charges. Without them "subtotal = total" is not a
  // recovery, it is a restatement — and the check further down would then find
  // subtotal + 0 = total, declare the relation confirmed, and RAISE the
  // confidence of a document that was never checkable at all. A bare e-wallet
  // screenshot showing one figure would have come back better corroborated than
  // it started, on the strength of arithmetic we performed on ourselves. That is
  // manufacturing evidence, which is worse than having none.
  if (!r.subtotal && r.total && charges !== 0) {
    const derived = sen(r.total - charges);
    if (derived > 0) {
      r.subtotal = derived;
      derivedSubtotalFromTotal = true;
      repairs.push({
        field: "subtotal",
        value: derived,
        because: "the total less the printed charges",
      });
    }
  }

  // `amount` is the canonical figure the ledger stores and must equal the total.
  // lib/receipt.ts already borrows one from the other when only one is present;
  // this catches the case where a repair above produced a total after that.
  if (!r.amount && r.total) {
    r.amount = r.total;
    repairs.push({ field: "amount", value: r.total, because: "it is the total paid" });
  }

  // ── CHECK: every relation that both sides of are now known ───────────────

  if (hasItems && r.subtotal) {
    // Slack scales a little with the number of rows: fifteen lines each rounded
    // to the sen can legitimately drift further from a printed subtotal than two
    // can, and a fixed epsilon would report a clean fifteen-line receipt as
    // broken.
    const slack = Math.max(EPS, Math.min(0.05, r.lineItems.length * 0.005));
    if (near(sum, r.subtotal, slack)) {
      confirmed.push("items = subtotal");
    } else {
      conflicts.push({
        relation: "items = subtotal",
        expected: r.subtotal,
        found: sum,
        // The ITEMS are the suspect, not the subtotal. A subtotal is one large
        // figure printed once; the items are a dozen small ones, and a reader
        // that drops or misreads one of them is far more likely than one that
        // fumbles the single line labelled "Subtotal". This is also the
        // completeness signal the second extraction pass keys on.
        suspect: "items",
      });
    }
  }

  if (r.subtotal && r.total) {
    const eps = r.rounding ? EPS : ROUNDING_EPS;
    const expected = sen(r.subtotal + charges);
    if (near(expected, r.total, eps)) {
      // See derivedSubtotalFromTotal: a relation we satisfied ourselves is not
      // a confirmation.
      if (!derivedSubtotalFromTotal) confirmed.push("subtotal + charges = total");
    } else {
      conflicts.push({
        relation: "subtotal + charges = total",
        expected,
        found: r.total,
        // The TOTAL is the suspect here, and for the mirror-image reason: it is
        // the single most important figure on the receipt and the one whose
        // misreading costs the household most, so it is the one to point at.
        suspect: "total",
      });
    }
  }

  if (r.amount && r.total && !near(r.amount, r.total, EPS)) {
    conflicts.push({
      relation: "amount = total",
      expected: r.total,
      found: r.amount,
      suspect: "total",
    });
  }

  // A service charge or tax that is a wild proportion of the subtotal is a
  // decimal-point misread — 10% read as 100%. Checked separately because it does
  // not break either relation above when the total was misread to match.
  if (r.subtotal > 0) {
    if (r.serviceCharge > r.subtotal * 0.5) {
      conflicts.push({
        relation: "service charge is a plausible share of the subtotal",
        expected: sen(r.subtotal * 0.1),
        found: r.serviceCharge,
        suspect: "serviceCharge",
      });
    }
    if (r.tax > r.subtotal * 0.5) {
      conflicts.push({
        relation: "tax is a plausible share of the subtotal",
        expected: sen(r.subtotal * 0.08),
        found: r.tax,
        suspect: "tax",
      });
    }
  }

  return { repaired: r, repairs, confirmed, conflicts, factor: factorFor(confirmed, conflicts) };
}

/**
 * Corroboration in, a multiplier out.
 *
 * The asymmetry is deliberate and is the whole design. A confirmation is weak
 * evidence — arithmetic that holds tells you the figures are consistent, not
 * that they came off this receipt, and a model inventing a whole transaction
 * will happily invent a consistent one. A conflict is strong evidence: it means
 * at least one figure on screen is definitely wrong, which is a fact and not an
 * opinion. So confirmations nudge up by a few percent and a conflict cuts hard.
 */
function factorFor(confirmed: string[], conflicts: MathVerdict["conflicts"]): number {
  if (conflicts.length) return conflicts.length > 1 ? 0.35 : 0.55;
  if (confirmed.length >= 2) return 1.15;
  if (confirmed.length === 1) return 1.07;
  return 1; // nothing was checkable — a bare e-wallet screenshot, quite normal
}

/**
 * Are the items provably INCOMPLETE?
 *
 * True only when a subtotal is known and the rows fall meaningfully short of it.
 * The gap has to clear both a flat floor and a proportional one: on a RM 400
 * grocery bill a 50-sen gap is rounding, while on a RM 12 breakfast it is a
 * missing drink. Requiring both stops a long receipt from triggering on noise
 * and a short one from hiding a real omission inside a percentage.
 *
 * Used to decide whether a second, items-only extraction pass is worth a token.
 * A reader that returns eight rows of a twenty-row till roll produces a list
 * that looks complete and is not, and no amount of staring at the screen tells
 * the user which twelve are missing — but the receipt's own subtotal does.
 */
export function itemsLookIncomplete(v: MathInput): boolean {
  if (!v.subtotal || !v.lineItems.length) return false;
  const gap = sen(v.subtotal - itemsSum(v.lineItems));
  return gap > 0.5 && gap > v.subtotal * 0.02;
}

/** The field to put the cursor in when something is wrong. */
export function firstSuspect(v: MathVerdict): SuspectField | null {
  return v.conflicts[0]?.suspect ?? null;
}
