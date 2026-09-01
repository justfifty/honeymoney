// One-tap presets: the spends this household makes over and over.
//
// ── WHY DERIVE THEM RATHER THAN ASK ────────────────────────────────────────
//
// A preset list a user has to build first is a feature most people never get
// to use. It asks for setup work up front in exchange for a saving later, at
// the exact moment they are least invested — and the app's whole friction
// budget is about the first three minutes.
//
// But a household's repeats are already sitting in its own ledger, stated far
// more reliably than anyone would state them in a settings screen. One real
// example, from a real household, over two days:
//
//     Kopi C     6.50   ×2        Kopi C   6.97
//     Mrt        2.50             Grab    18.40
//     Kaya Toast 6.97
//
// Every one of those was typed by hand. The same drink, the same price, the
// same shop, keyed in from scratch each time. That is the work this removes,
// and it needs no setup at all: the second time you buy the same coffee, the
// preset is there.
//
// Custom presets still matter — the weekly market run you have not logged yet,
// the fare you want rounded — so the UI merges these with a list the user
// keeps themselves. This module is only the derived half.
//
// ── WHAT MAKES A GOOD SUGGESTION ───────────────────────────────────────────
//
// A REPEAT, not a big number. The most useful preset is a RM2.50 fare bought
// forty times, not a RM3,000 rent paid once; ranking by amount would fill the
// row with the spends nobody needs help entering. So: rank by how often the
// SAME vendor at the SAME price recurs, and require it to have happened at
// least twice — once is not a habit, it is a Tuesday.

import { pbList, pbStr } from "./pocketbase";

export interface SpendPreset {
  /** Stable id, so React keys and "remove this one" both have something to hold. */
  id: string;
  vendor: string;
  amount: number;
  /** The bucket this household actually files it under, when they agree on one. */
  bucketNodeId?: string;
  /** How many times this exact pairing has occurred. 0 for a user-made preset. */
  seen: number;
}

/**
 * A preset with no amount is a VENDOR shortcut: tapping it fills the shop and
 * leaves the figure to you.
 *
 * Worth having because exact-price repeats are rarer than they sound. A real
 * household two days in had exactly one — Kopi C at 6.50, twice — while also
 * holding Grab, Mrt and Kaya Toast, each at a different price every time. Those
 * are frequent enough to be worth a button and simply do not have a stable
 * amount, and a one-chip row is not worth the space it takes.
 *
 * Filling the vendor is most of the work anyway: it is the part with spelling,
 * the part that must match an existing vendor node for the household's filing
 * history to apply, and the part a phone keyboard is worst at.
 */
export function isVendorOnly(p: SpendPreset): boolean {
  return !(p.amount > 0);
}

/** How far back to look. Long enough for a monthly habit to show up twice. */
const WINDOW_DAYS = 120;

/** Once is not a habit. */
const MIN_SEEN = 2;

/** A row of chips, not a menu. Past this it costs more to scan than to type. */
export const MAX_SUGGESTED = 6;

/**
 * The (vendor, amount) pairings this household repeats, most-repeated first.
 *
 * Deliberately exact on amount. "Kopi C 6.50" and "Kopi C 6.97" are two
 * different presets because they are two different prices, and a preset that
 * fills in an average would be a preset you have to correct — which is the
 * typing it was meant to save.
 */
export async function suggestPresets(tenantId: string): Promise<SpendPreset[]> {
  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);

  const txns = await pbList<{
    id: string;
    amount: number;
    voided: boolean;
    direction: string;
    kind: string;
    wallet_node: string;
    expand?: { vendor_node?: { label: string } };
  }>("transactions", {
    filter:
      `tenant = ${pbStr(tenantId)} && occurred_at >= ${pbStr(since.toISOString().replace("T", " "))}` +
      // Spends only. An income line or a savings transfer is not something
      // anybody taps a shortcut for, and offering "Salary 20000" as a one-tap
      // button is a way to put twenty thousand ringgit in a ledger by accident.
      //
      // ⚠️ `kind != 'transfer'`, NOT `kind = 'outflow'`. `kind` was added by
      // migration 1751900021 and every row written before it has an EMPTY one —
      // which is most of the history in any household that has been running a
      // while. Requiring the positive value silently excluded all of them: the
      // seeded demo household, with 92 transactions, derived exactly zero
      // presets. Excluding what we do not want, rather than requiring what we
      // do, is what lets an unlabelled old row still count. lib/records.ts
      // handles the same gap with deriveKind, for the same reason.
      // Both fields are EXCLUSIONS, never requirements. `direction` arrived in
      // migration 1751900014 and `kind` in 1751900021, and every row written
      // before them has an empty one — which is most of the history in any
      // household that has been running a while, and ALL 92 rows of the seeded
      // demo household, whose preset row came back empty until this line read
      // the other way round. "Not money in, and not a transfer" keeps an
      // unlabelled old spend; "is an outflow" throws it away.
      ` && voided != true && direction != 'in' && kind != 'transfer'`,
    expand: "vendor_node",
    perPage: 1000,
    sort: "-occurred_at",
  });

  const byPair = new Map<string, { vendor: string; amount: number; seen: number; buckets: Map<string, number> }>();

  for (const t of txns) {
    const vendor = t.expand?.vendor_node?.label?.trim();
    const amount = Math.round(Number(t.amount) * 100) / 100;
    if (!vendor || !(amount > 0)) continue;

    const key = `${vendor.toLowerCase()}|${amount}`;
    const entry = byPair.get(key) ?? { vendor, amount, seen: 0, buckets: new Map<string, number>() };
    entry.seen += 1;
    if (t.wallet_node) entry.buckets.set(t.wallet_node, (entry.buckets.get(t.wallet_node) ?? 0) + 1);
    byPair.set(key, entry);
  }

  // ── ONE CHIP PER VENDOR ──────────────────────────────────────────────────
  //
  // Ranking (vendor, amount) pairs directly fills the row with the same shop at
  // slightly different prices. Measured on a real seeded household it produced
  // "Shell 63.00", "Shell 62.00", "Shell 58.00" as three of six chips — petrol
  // is never the same price twice — and on another, "KWSP (EPF)" at two
  // amounts. That is not six shortcuts, it is three, padded.
  //
  // So each vendor gets exactly one chip, and the question becomes which KIND:
  //
  //   EXACT        when one price genuinely dominates that vendor's visits.
  //                "Tuition Centre 180" four times out of four is a fact about
  //                the household, and filling the amount is the whole saving.
  //   VENDOR-ONLY  when it does not. Three Shell fill-ups at three prices have
  //                no preset amount to offer, and guessing one would hand the
  //                user a wrong number to correct — which is the typing this
  //                was meant to remove.
  //
  // Two thirds, and at least twice. A bare majority is not a habit, and a
  // vendor visited once has nothing to be a majority of.
  const DOMINANT = 2 / 3;

  const byVendor = new Map<
    string,
    { vendor: string; seen: number; buckets: Map<string, number>; prices: { amount: number; seen: number }[] }
  >();
  for (const e of byPair.values()) {
    const key = e.vendor.toLowerCase();
    const v =
      byVendor.get(key) ?? { vendor: e.vendor, seen: 0, buckets: new Map<string, number>(), prices: [] };
    v.seen += e.seen;
    v.prices.push({ amount: e.amount, seen: e.seen });
    for (const [b, n] of e.buckets) v.buckets.set(b, (v.buckets.get(b) ?? 0) + n);
    byVendor.set(key, v);
  }

  const chips: SpendPreset[] = [...byVendor.values()]
    .sort((a, b) => b.seen - a.seen || a.vendor.localeCompare(b.vendor))
    .map((v) => {
      const top = [...v.buckets.entries()].sort((x, y) => y[1] - x[1])[0];
      const bestPrice = [...v.prices].sort((a, b) => b.seen - a.seen)[0];
      const dominant = bestPrice.seen >= MIN_SEEN && bestPrice.seen / v.seen >= DOMINANT;
      return {
        id: dominant ? `s:${v.vendor.toLowerCase()}:${bestPrice.amount}` : `v:${v.vendor.toLowerCase()}`,
        vendor: v.vendor,
        amount: dominant ? bestPrice.amount : 0,
        ...(top ? { bucketNodeId: top[0] } : {}),
        seen: v.seen,
      };
    });

  // ── KEEP ROOM FOR THE CHIPS THAT CARRY AN AMOUNT ─────────────────────────
  //
  // Ranking on visit count alone fills the row with the shops you go to most,
  // which are exactly the shops whose price is never the same twice. On a real
  // seeded household that produced six vendor-only chips and pushed out
  // "Tuition Centre 180", seen four times out of four — the single most useful
  // shortcut it had, because it is the one that fills in the amount too.
  //
  // An exact chip completes a whole record in one tap; a vendor-only chip
  // completes half of one. So a few slots are reserved for exact chips before
  // frequency gets the rest, rather than letting the most-visited vendors take
  // the entire row. Half and half, so neither kind can crowd the other out.
  const EXACT_SLOTS = Math.floor(MAX_SUGGESTED / 2);
  const exact = chips.filter((c) => c.amount > 0).slice(0, EXACT_SLOTS);
  const taken = new Set(exact.map((c) => c.id));
  const rest = chips.filter((c) => !taken.has(c.id)).slice(0, MAX_SUGGESTED - exact.length);

  // Re-sorted so the row still reads most-used first, whichever kind each is.
  return [...exact, ...rest].sort((a, b) => b.seen - a.seen || a.vendor.localeCompare(b.vendor));
}
