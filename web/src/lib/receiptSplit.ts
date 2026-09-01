// The arithmetic behind "record every item on this receipt".
//
// ── WHY THIS IS NOT A LOOP OVER THE LINE ITEMS ─────────────────────────────
//
// A receipt's items do not add up to what the household paid, and treating them
// as though they do is how an itemising importer quietly under-records money.
// A restaurant bill reading
//
//     Nasi lemak            7.00
//     Teh tarik             3.00
//     Subtotal             10.00
//     Service charge 10%    1.00
//     SST 6%                0.66
//     Rounding             -0.01
//     TOTAL                11.65
//
// has items summing to 10.00 against 11.65 actually paid. Posting one record per
// item would put 10.00 in the ledger and lose 1.65 — every time, on every
// restaurant receipt, in the direction that flatters the household. The same
// applies in reverse to a supermarket receipt with a member discount, where the
// items sum to MORE than the total.
//
// So the charges are DISTRIBUTED across the items in proportion to what each one
// contributed, and the resulting set is forced to sum to the printed total to
// the sen. That means the recorded cost of the nasi lemak is 8.15, not 7.00,
// which is also the truthful answer to "what did this dish cost me".
//
// The invariant this file exists to hold:
//
//     sum(split(items, total)) === total,  exactly, in sen.
//
// Nothing here talks to a model, a network or a database. It is arithmetic, and
// it is checked by scripts/check-receipt.mts.

export interface SplitItem {
  label: string;
  /** The line total as printed. Always positive; `discount` carries the sign. */
  amount: number;
  qty?: number;
  unitPrice?: number;
  /** True when this row SUBTRACTS from the bill (discount, voucher, rebate). */
  discount?: boolean;
  /** Which bucket this particular item should be filed under, if the user said. */
  bucketId?: string;
}

/**
 * `amount` becomes the all-in figure to record; `printed` keeps what the receipt
 * showed, so a caller can display both.
 *
 * Generic in the row type so the caller's own identity travels through — the UI
 * carries a React key on each item and needs to match a split row back to the
 * input row it came from. Matching on label would have been wrong on the first
 * receipt that lists the same 1.50 bun twice.
 */
export type SplitRow<T extends SplitItem = SplitItem> = T & { printed: number };

/** Money, to the sen. Every figure in this file goes through it. */
export function sen(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * What the items add up to, net of discounts.
 *
 * This is the figure that should equal the receipt's SUBTOTAL. It is not the
 * total, and the difference between the two is the whole point of `reconcile`.
 */
export function itemsNet(items: SplitItem[]): number {
  return sen(items.reduce((s, i) => s + (i.discount ? -i.amount : i.amount), 0));
}

export interface Breakdown {
  subtotal: number;
  serviceCharge: number;
  tax: number;
  rounding: number;
  total: number;
}

export interface Reconciliation {
  /** Items, net of discounts. */
  net: number;
  /** Everything the receipt adds after the subtotal: service + tax + rounding. */
  charges: number;
  /** net + charges — what the items claim the total should be. */
  expected: number;
  /** What the user is actually recording. */
  total: number;
  /** total − expected. Positive ⇒ the item list is SHORT of the total. */
  difference: number;
  /** Within tolerance: the list explains the total. */
  ok: boolean;
}

// Malaysia rounds cash payments to the nearest 5 sen, and a receipt does not
// always print the adjustment as its own line. One sen either way is also
// ordinary once percentages have been applied to a dozen rows. So a gap this
// small is not evidence of a misread and must not be reported as one — crying
// wolf over three sen is how a reconciliation banner gets ignored on the day it
// is pointing at a real missing row.
export const RECONCILE_TOLERANCE = 0.05;

export function reconcile(
  items: SplitItem[],
  total: number,
  breakdown?: Partial<Breakdown> | null,
): Reconciliation {
  const net = itemsNet(items);
  const charges = sen(
    (breakdown?.serviceCharge ?? 0) + (breakdown?.tax ?? 0) + (breakdown?.rounding ?? 0),
  );
  const expected = sen(net + charges);
  const difference = sen(total - expected);
  return {
    net,
    charges,
    expected,
    total: sen(total),
    difference,
    ok: Math.abs(difference) <= RECONCILE_TOLERANCE,
  };
}

/**
 * One record per item, together summing EXACTLY to `total`.
 *
 * Returns null when the split cannot be done honestly — no positive items, or a
 * net of zero or less, which would make the proportions meaningless. The caller
 * shows the "record the total instead" path rather than posting a set of records
 * that does not add up.
 *
 * Discount rows do not become records. They are not spending; they are a
 * reduction in it, and a ledger row for "Member discount −2.00" against a
 * grocery bucket would show up in every report as a negative purchase. Netting
 * them into the proportion instead spreads the saving across the things it
 * actually applied to, and keeps the sum exact.
 */
export function splitToTotal<T extends SplitItem>(items: T[], total: number): SplitRow<T>[] | null {
  const target = sen(total);
  const net = itemsNet(items);
  const positives = items.filter((i) => !i.discount && i.amount > 0);
  if (!positives.length || net <= 0 || target <= 0) return null;

  const factor = target / net;

  // Round first, then repair. Rounding each share independently cannot be
  // trusted to sum to the target — twelve rows rounded to the sen routinely land
  // a few sen out — so the residual is measured and placed rather than hoped
  // away.
  let rows: SplitRow<T>[] = positives.map((i) => ({
    ...i,
    printed: i.amount,
    amount: sen(i.amount * factor),
  }));

  // A row that scales to nothing cannot be a record: the API rejects a
  // non-positive amount, and a 0.00 line in a ledger says nothing. Drop it and
  // let its value fall into the residual, where it reaches the other rows.
  rows = rows.filter((r) => r.amount > 0);
  if (!rows.length) return null;

  const residual = sen(target - rows.reduce((s, r) => s + r.amount, 0));
  if (residual !== 0) {
    // Onto the LARGEST row, because a few sen is proportionally smallest there
    // and least likely to look like a typo to the person checking it against the
    // paper. Never onto a row it would drive to zero or below.
    let idx = 0;
    for (let i = 1; i < rows.length; i++) if (rows[i].amount > rows[idx].amount) idx = i;
    const fixed = sen(rows[idx].amount + residual);
    if (fixed <= 0) return null;
    rows[idx] = { ...rows[idx], amount: fixed };
  }

  return rows;
}
