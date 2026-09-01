// Can a receipt reader put a transaction in a ledger that was never on the paper?
//
// ── THE FAILURE THIS EXISTS FOR ────────────────────────────────────────────
//
// 2026-09-01. A photograph of a Swiss restaurant bill — Berghotel Grosse
// Scheidegg, CHF 54.50, dated 30.07.2007 — was scanned, and the app offered to
// record "Mamak · MYR 8.90 · 2026-03-07".
//
// Not a misread. Nothing on that receipt could produce any of those values.
// "Mamak" was the first merchant named in lib/receipt.ts's own system prompt,
// "MYR" was the default that same file asked for and then applied a second time
// in code, and 2026-03-07 was the specimen date the prompt used to explain
// day-first ordering. The model could not read the image, so it answered out of
// its instructions — and it did so confidently enough to prefill the form.
//
// For an app whose whole promise is that the parser proposes and the human
// commits, that is the worst available failure: not a blank asking for help, but
// a complete plausible transaction the household may confirm without looking.
//
// ── WHAT IS CHECKED ────────────────────────────────────────────────────────
//
// coerceExtraction is the last thing every model answer passes through, so it
// is where the guarantees live and the right place to test. No API key, no
// network, no image — just the shapes a model can hand back.
//
//   npx tsx scripts/check-receipt.mts

import { coerceExtraction } from "../src/lib/receipt";
import { itemsNet, reconcile, splitToTotal, type SplitItem } from "../src/lib/receiptSplit";
import { firstSuspect, itemsLookIncomplete, verify as verifyMath } from "../src/lib/receiptMath";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`);
  if (!ok) failed++;
}

console.log("\nreceipt extraction — guarantees\n");

// 1. THE REPORTED FAILURE. A model that says it is guessing must not be allowed
//    to prefill anything, however complete its answer looks.
const fabricated = coerceExtraction({
  vendor: "Mamak",
  amount: 8.9,
  currency: "MYR",
  occurredAt: "2026-03-07T00:00:00.000Z",
  total: 8.9,
  confidence: 0.2,
});
check("a low-confidence answer yields no vendor", fabricated.vendor === "", `got ${JSON.stringify(fabricated.vendor)}`);
check("a low-confidence answer yields no amount", fabricated.amount === 0, `got ${fabricated.amount}`);
check("a low-confidence answer yields no date", fabricated.occurredAt === "", `got ${fabricated.occurredAt}`);
check("a low-confidence answer keeps its confidence, so the UI can say why", fabricated.confidence === 0.2);

// 2. CURRENCY IS NEVER INVENTED. This is the bug that turned CHF 54.50 into
//    RM 8.90 — a default applied in two places at once.
const swiss = coerceExtraction({
  vendor: "Berghotel Grosse Scheidegg",
  amount: 54.5,
  currency: "CHF",
  occurredAt: "2007-07-30T13:29:00.000Z",
  total: 54.5,
  confidence: 0.9,
});
check("a foreign currency survives", swiss.currency === "CHF", `got ${JSON.stringify(swiss.currency)}`);
check("a foreign vendor survives", swiss.vendor === "Berghotel Grosse Scheidegg");
check("an old date survives", swiss.occurredAt.startsWith("2007-07-30"), `got ${swiss.occurredAt}`);
check("the amount survives", swiss.amount === 54.5, `got ${swiss.amount}`);

const noCurrency = coerceExtraction({ vendor: "Kedai", amount: 12, total: 12, confidence: 0.8 });
check(
  "an unstated currency stays empty rather than becoming MYR",
  noCurrency.currency === "",
  `got ${JSON.stringify(noCurrency.currency)} — the caller falls back to the household's own currency, which is a stated default rather than a claim about this receipt`,
);

// 3. A CONFIDENT READ IS STILL TRUSTED. The floor must not swallow ordinary work.
const good = coerceExtraction({
  vendor: "99 Speedmart", amount: 43.6, currency: "MYR", total: 43.6, confidence: 0.85,
});
check("a confident Malaysian read is untouched", good.vendor === "99 Speedmart" && good.amount === 43.6 && good.currency === "MYR");

// 4. AN HONEST "I COULD NOT READ IT" (confidence 0) must pass through as empty
//    rather than being treated as a suspiciously low score and re-blanked into
//    something different.
const blank = coerceExtraction({ vendor: "", amount: 0, currency: "", confidence: 0 });
check("an explicit non-read stays empty", blank.vendor === "" && blank.amount === 0 && blank.confidence === 0);

// 5. THE AMOUNT/TOTAL BORROW still works — a model that fills only one of the
//    two must not lose the figure.
const onlyTotal = coerceExtraction({ vendor: "Kopitiam", total: 6.5, currency: "MYR", confidence: 0.7 });
check("amount is borrowed from total when only total is given", onlyTotal.amount === 6.5, `got ${onlyTotal.amount}`);

// ── ITEMISATION ────────────────────────────────────────────────────────────
//
// The second half of what a receipt reader owes a household. Reading a total is
// OCR; reading what was BOUGHT is what makes the record checkable against the
// paper, correctable when it is wrong, and still useful a year later.

console.log("\nreceipt itemisation — guarantees\n");

// 6. ITEMS SURVIVE, WITH THEIR QUANTITIES. The reader returned label and amount
//    only, so "2 x 3.50  7.00" and "1 x 7.00" were indistinguishable — and a
//    user correcting a misread could not tell which of the two numbers was the
//    wrong one.
const itemised = coerceExtraction({
  vendor: "Kedai", amount: 11.65, currency: "MYR", total: 11.65, confidence: 0.9,
  subtotal: 10, serviceCharge: 1, tax: 0.66, rounding: -0.01,
  lineItems: [
    { label: "Nasi lemak", amount: 7, qty: 2, unitPrice: 3.5 },
    { label: "Teh tarik", amount: 3 },
  ],
});
check("line items survive coercion", itemised.lineItems.length === 2, `got ${itemised.lineItems.length}`);
check("a quantity survives", itemised.lineItems[0].qty === 2, `got ${itemised.lineItems[0].qty}`);
check("a unit price survives", itemised.lineItems[0].unitPrice === 3.5);
check("the printed breakdown survives", itemised.subtotal === 10 && itemised.serviceCharge === 1 && itemised.tax === 0.66);
check(
  "a NEGATIVE rounding adjustment survives",
  itemised.rounding === -0.01,
  `got ${itemised.rounding} — the 5-sen adjustment usually takes money OFF, so flooring it at zero loses it`,
);

// 7. A LOW-CONFIDENCE READ DROPS ITS ITEMS TOO. The floor exists so that a model
//    which cannot see does not prefill a form; a list of invented purchases is a
//    more detailed lie, not a lesser one.
const shaky = coerceExtraction({
  vendor: "Kedai", amount: 20, total: 20, confidence: 0.2,
  lineItems: [{ label: "Roti", amount: 20 }],
});
check("a low-confidence answer yields no items", shaky.lineItems.length === 0, `got ${shaky.lineItems.length}`);

// 8. TILL FURNITURE IS NOT AN ITEM. A zero row and a label-less row are the
//    model mistaking a section header for something somebody bought.
const noisy = coerceExtraction({
  vendor: "Kedai", amount: 5, total: 5, confidence: 0.9,
  lineItems: [
    { label: "Roti", amount: 5 },
    { label: "SUBTOTAL", amount: 0 },
    { label: "", amount: 3 },
  ],
});
check("zero-value and label-less rows are dropped", noisy.lineItems.length === 1, `got ${noisy.lineItems.length}`);

// 9. A DISCOUNT KEEPS ITS SIGN AS A FLAG, not as a negative amount, so every
//    consumer downstream can rely on `amount` being positive.
const discounted = coerceExtraction({
  vendor: "Kedai", amount: 8, total: 8, confidence: 0.9,
  lineItems: [{ label: "Beras", amount: 10 }, { label: "Member disc", amount: -2 }],
});
check("a negative row becomes a positive amount + a discount flag",
  discounted.lineItems[1].amount === 2 && discounted.lineItems[1].discount === true,
  JSON.stringify(discounted.lineItems[1]));
check("items net off the discount", itemsNet(discounted.lineItems) === 8, `got ${itemsNet(discounted.lineItems)}`);

// 10. TRUNCATION IS ANNOUNCED. A silent cut is invisible while the list is
//     decoration, and a short ledger once a user can record every line.
const long = coerceExtraction({
  vendor: "Pasar", amount: 500, total: 500, confidence: 0.9,
  lineItems: Array.from({ length: 200 }, (_, i) => ({ label: `Item ${i}`, amount: 2.5 })),
});
check("an over-long receipt is cut", long.lineItems.length === 150, `got ${long.lineItems.length}`);
check("and SAYS it was cut", long.itemsTruncated === true);
check("a receipt within the cap does not claim truncation", itemised.itemsTruncated === false);

// ── THE SPLIT ──────────────────────────────────────────────────────────────
//
// The invariant: one record per item must still add up to what was paid. Get
// this wrong and every restaurant bill in the ledger is short by its service
// charge and its tax — always in the direction that flatters the household.

const bill: SplitItem[] = [
  { label: "Nasi lemak", amount: 7 },
  { label: "Teh tarik", amount: 3 },
];

const rec = reconcile(bill, 11.65, { serviceCharge: 1, tax: 0.66, rounding: -0.01 });
check("a restaurant bill reconciles once service + tax are counted", rec.ok, JSON.stringify(rec));

const shortByOne = reconcile(bill, 14.0, { serviceCharge: 1, tax: 0.66, rounding: 0 });
check("a missing row is reported, not hidden", !shortByOne.ok && shortByOne.difference > 0, JSON.stringify(shortByOne));

const split = splitToTotal(bill, 11.65)!;
check("the split produces one row per item", split.length === 2, `got ${split?.length}`);
const splitSum = Math.round(split.reduce((n, r) => n + r.amount, 0) * 100) / 100;
check(
  "THE INVARIANT: the split sums EXACTLY to the total paid",
  splitSum === 11.65,
  `got ${splitSum} — a shortfall here is service charge and tax silently missing from a household's ledger`,
);
check("each row keeps what the receipt printed", split[0].printed === 7 && split[1].printed === 3);
check("and is recorded ALL-IN, above its printed price", split[0].amount > 7, `got ${split[0].amount}`);

// A discount runs the other way: the items sum to MORE than what was paid, and
// the saving has to be spread rather than left as a negative ledger row.
const withDisc = splitToTotal(
  [{ label: "Beras", amount: 30 }, { label: "Gula", amount: 10 }, { label: "Disc", amount: 4, discount: true }],
  36,
)!;
check("a discount does not become a record of its own", withDisc.length === 2, `got ${withDisc.length}`);
const discSum = Math.round(withDisc.reduce((n, r) => n + r.amount, 0) * 100) / 100;
check("the discounted split still sums exactly", discSum === 36, `got ${discSum}`);

// Many small rows against an awkward total: where a naive per-row round leaves
// the set a few sen out and nobody notices until the books disagree.
const many = splitToTotal(
  Array.from({ length: 13 }, (_, i) => ({ label: `i${i}`, amount: 1.37 })),
  20.01,
)!;
const manySum = Math.round(many.reduce((n, r) => n + r.amount, 0) * 100) / 100;
check("thirteen rows against an awkward total still sum exactly", manySum === 20.01, `got ${manySum}`);

check("a split with no positive items refuses rather than guessing",
  splitToTotal([{ label: "Disc", amount: 5, discount: true }], 10) === null);
check("a split of nothing refuses", splitToTotal([], 10) === null);

// ── THE RECEIPT CHECKS ITSELF ──────────────────────────────────────────────
//
// Both readers were taken at their word until now: the vision model reports its
// own confidence — the one number a model that cannot see is worst at producing
// — and Tesseract reports none at all. A receipt's own arithmetic is evidence
// from somewhere else, and it is free.

console.log("\nreceipt arithmetic — guarantees\n");

const restaurant = {
  amount: 11.65, subtotal: 10, serviceCharge: 1, tax: 0.66, rounding: -0.01, total: 11.65,
  lineItems: [{ label: "Nasi lemak", amount: 7 }, { label: "Teh tarik", amount: 3 }],
};

const consistent = verifyMath(restaurant);
check("a self-consistent receipt raises confidence", consistent.factor > 1, `factor ${consistent.factor}`);
check("and reports no conflicts", consistent.conflicts.length === 0, JSON.stringify(consistent.conflicts));
check("both relations are confirmed", consistent.confirmed.length === 2, JSON.stringify(consistent.confirmed));

// THE CASE THIS IS FOR. A misread total that nothing downstream could catch:
// every field is present, plausible and confidently returned, and only the
// receipt's own arithmetic knows it is wrong.
const badTotal = verifyMath({ ...restaurant, amount: 1.65, total: 1.65 });
check("a misread total is caught", badTotal.conflicts.length > 0, JSON.stringify(badTotal.conflicts));
check("and CUTS the confidence", badTotal.factor < 0.6, `factor ${badTotal.factor}`);
check("and names the total as the suspect", firstSuspect(badTotal) === "total", String(firstSuspect(badTotal)));

// Missing rows are the ITEMS' fault, not the subtotal's — a subtotal is one
// figure printed once, the items are a dozen, and this is what the second
// extraction pass keys on.
const missingRows = verifyMath({
  ...restaurant,
  lineItems: [{ label: "Nasi lemak", amount: 7 }],
});
check("a short item list is caught", missingRows.conflicts.length > 0);
check("and blames the ITEMS, not the subtotal", firstSuspect(missingRows) === "items", String(firstSuspect(missingRows)));

// REPAIR fills blanks only. This is the line between "the receipt states it"
// and "we guessed it", and it is the whole safety argument for this module.
const noSubtotal = verifyMath({ ...restaurant, subtotal: 0 });
check("a missing subtotal is recovered from the items", noSubtotal.repaired.subtotal === 10, `got ${noSubtotal.repaired.subtotal}`);
check("and the repair is reported", noSubtotal.repairs.length === 1, JSON.stringify(noSubtotal.repairs));

const noTotal = verifyMath({ ...restaurant, total: 0, amount: 0 });
check("a missing total is recovered from subtotal + charges", noTotal.repaired.total === 11.65, `got ${noTotal.repaired.total}`);

const contradiction = verifyMath({ ...restaurant, subtotal: 99 });
check(
  "a CONTRADICTION is never 'repaired' into agreement",
  contradiction.repaired.subtotal === 99 && contradiction.conflicts.length > 0,
  `subtotal ${contradiction.repaired.subtotal} — picking the likelier of two disagreeing figures is exactly the plausible invention this codebase has been burned by`,
);

// Slack, in both directions. Rounding must not cry wolf, and a real gap must
// not hide inside the tolerance.
const rounded = verifyMath({
  amount: 20.0, subtotal: 20, serviceCharge: 0, tax: 0, rounding: 0, total: 20.0,
  lineItems: Array.from({ length: 12 }, () => ({ label: "x", amount: 1.667 })),
});
check("twelve rounded rows do not trip the check", rounded.conflicts.length === 0, JSON.stringify(rounded.conflicts));

check(
  "a bare e-wallet screenshot is neither confirmed nor doubted",
  verifyMath({ amount: 8.9, subtotal: 0, serviceCharge: 0, tax: 0, rounding: 0, total: 8.9, lineItems: [] }).factor === 1,
);

// The completeness gate: it decides whether a second token is worth spending.
check("provably short items are flagged for a second pass", itemsLookIncomplete({
  ...restaurant, lineItems: [{ label: "Nasi lemak", amount: 7 }],
}));
check("a complete list is not", !itemsLookIncomplete(restaurant));
check(
  "and neither is a sen of rounding on a big bill",
  !itemsLookIncomplete({
    amount: 400, subtotal: 400, serviceCharge: 0, tax: 0, rounding: 0, total: 400,
    lineItems: [{ label: "shop", amount: 399.7 }],
  }),
);

// ── AND IT REACHES THE EXTRACTION ──────────────────────────────────────────
//
// The arithmetic is only worth anything if it moves the number every consumer
// actually reads — the low-confidence warning, the focus rule, and the 0.35
// floor all key on `confidence`.
const withChecks = coerceExtraction({
  vendor: "Kedai", currency: "MYR", confidence: 0.8,
  amount: 1.65, total: 1.65, subtotal: 10, serviceCharge: 1, tax: 0.66, rounding: -0.01,
  lineItems: [{ label: "Nasi lemak", amount: 7 }, { label: "Teh tarik", amount: 3 }],
});
check("a contradicted read has its confidence cut", withChecks.confidence < 0.5, `got ${withChecks.confidence}`);
check("and carries the suspect field for the UI", withChecks.checks?.suspect === "total", JSON.stringify(withChecks.checks));

const corroborated = coerceExtraction({
  vendor: "Kedai", currency: "MYR", confidence: 0.7,
  amount: 11.65, total: 11.65, subtotal: 10, serviceCharge: 1, tax: 0.66, rounding: -0.01,
  lineItems: [{ label: "Nasi lemak", amount: 7 }, { label: "Teh tarik", amount: 3 }],
});
check("a corroborated read has its confidence raised", corroborated.confidence > 0.7, `got ${corroborated.confidence}`);
check("with no conflicts to report", corroborated.checks?.conflicts.length === 0);

console.log(failed ? `\n${failed} check(s) FAILED\n` : "\nAll receipt guarantees hold.\n");
process.exit(failed ? 1 : 0);
