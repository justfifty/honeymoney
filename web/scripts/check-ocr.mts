// Does the on-device reader get the WHOLE receipt, and does it survive the way
// Tesseract actually mangles thermal paper?
//
// ── WHY THIS EXISTS SEPARATELY FROM check-receipt ──────────────────────────
//
// check-receipt.mts guards the AI reader's output contract — what a model is
// allowed to hand back and what happens when it lies. This guards the other
// reader: the free, offline, zero-token one that runs in the browser on
// Tesseract output, which is the path the product is actually designed around
// and the only one available without an API key.
//
// The inputs below are OCR text, not idealised receipts. Tesseract does not
// return tidy strings — it returns the tax code the till printed after the
// price, it turns 0 into O and 1 into l on faded thermal paper, and it pads
// columns with runs of spaces. Every failure encoded here was a line the parser
// dropped ENTIRELY rather than read slightly wrong, which is the failure mode
// that matters: a wrong number is visible on screen and a missing row is not.
//
//   npx tsx scripts/check-ocr.mts

import { receiptLineItems, parseReceiptText, fixOcrDigits } from "../src/lib/voiceParse";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`);
  if (!ok) failed++;
}

console.log("\non-device receipt reading — guarantees\n");

// ── 1. TAX CODES ───────────────────────────────────────────────────────────
//
// Malaysian tills print a tax code after the price: SR (standard-rated), ZR
// (zero-rated), S, Z, T, E, or a bare * or #. The item pattern anchored the
// price to end-of-line, so those two trailing characters made EVERY line on a
// GST/SST-era receipt fail to match — which is most printed receipts in the
// country. On-device itemisation came back empty on receipts that were fully
// itemised, and nothing said why.
const taxCoded = `
KEDAI MAKAN SEDAP
Nasi lemak ayam        7.00 SR
Teh tarik              3.00 SR
Roti canai             1.50 ZR
Air suam               0.50 *
Total                 12.00
`;
const taxed = receiptLineItems(taxCoded, 12) ?? [];
check("a receipt with tax codes still itemises", taxed.length === 4, `got ${taxed.length}`);
check(
  "and the code is not read as part of the price",
  taxed[0]?.amount === 7 && taxed[3]?.amount === 0.5,
  JSON.stringify(taxed),
);

// ── 2. OCR LOOKALIKES ──────────────────────────────────────────────────────
//
// O/0, l/1, S/5, B/8 on faded thermal print. A strict \d dropped the whole line.
check("fixOcrDigits repairs a price", fixOcrDigits("7.OO") === "7.00");
check("fixOcrDigits repairs mixed confusions", fixOcrDigits("2l.S3") === "21.53");
check("fixOcrDigits leaves real digits alone", fixOcrDigits("21.53") === "21.53");

const mangled = `
99 SPEEDMART
Gardenia roti          3.5O
Milo 3in1 pack        1O.90
Maggi kari 5s          6.OO
TOTAL                 2O.40
`;
const fixedItems = receiptLineItems(mangled, 20.4) ?? [];
check("lookalike glyphs in a price no longer delete the row", fixedItems.length === 3, `got ${fixedItems.length}`);
check(
  "and the repaired amounts are right",
  fixedItems[0]?.amount === 3.5 && fixedItems[1]?.amount === 10.9 && fixedItems[2]?.amount === 6,
  JSON.stringify(fixedItems),
);

// The total on that same receipt reads "2O.40" and the strict extractor cannot
// see it. This is the case that used to produce a scan with items and NO amount.
const mangledParse = parseReceiptText(mangled);
check("a mangled total is still read", mangledParse.amount === 20.4, `got ${mangledParse.amount}`);

// …but only as a LAST resort. A clean receipt must still go through the strict
// reader, so the tolerance can never change an answer it already got right.
const clean = parseReceiptText(`
KOPITIAM
Kopi O                 2.50
TOTAL                  2.50
`);
check("a clean receipt is unaffected", clean.amount === 2.5, `got ${clean.amount}`);

// ── 3. QUANTITIES ──────────────────────────────────────────────────────────
//
// "2 x 3.50  7.00" was matched and the quantity thrown away, so the user could
// not tell one at 7.00 from two at 3.50 — the exact ambiguity an itemised view
// is supposed to remove.
const qty = receiptLineItems(`
Nasi lemak    2 x 3.50      7.00
Teh tarik     1 x 3.00      3.00
`, 10) ?? [];
check("a quantity clause is captured", qty[0]?.qty === 2, JSON.stringify(qty[0]));
check("with its unit price", qty[0]?.unitPrice === 3.5, JSON.stringify(qty[0]));
check("and the amount is the LINE total, not the unit price", qty[0]?.amount === 7);

// ── 4. DISCOUNTS ───────────────────────────────────────────────────────────
//
// A discount row must survive as a row. Dropping it makes the items sum to more
// than the total, which then reads as a misread of the total.
const disc = receiptLineItems(`
Beras 5kg             30.00
Gula                  10.00
Member discount       -4.00
`, 36) ?? [];
check("a discount row survives", disc.length === 3, `got ${disc.length}`);
check(
  "flagged, and positive",
  disc[2]?.discount === true && disc[2]?.amount === 4,
  JSON.stringify(disc[2]),
);
check(
  "a discount is exempt from the total ceiling",
  (receiptLineItems(`
Kopi                   2.00
Voucher               -8.00
`, 2) ?? []).length === 2,
  "a large discount against a small total is ordinary, not suspicious",
);

// ── 5. FURNITURE IS STILL NOT AN ITEM ──────────────────────────────────────
//
// The loosened patterns above must not start swallowing the receipt's own
// summary lines back in as purchases — that would double-count every receipt.
const withChrome = receiptLineItems(`
Nasi goreng            8.00
SUBTOTAL               8.00
SST 6%                 0.48
TOTAL                  8.48
CASH                  10.00
CHANGE                 1.52
`, 8.48) ?? [];
check(
  "subtotal / tax / total / cash / change are not items",
  withChrome.length === 1 && withChrome[0].label.toLowerCase().includes("nasi"),
  JSON.stringify(withChrome),
);

console.log(failed ? `\n${failed} check(s) FAILED\n` : "\nThe on-device reader holds.\n");
process.exit(failed ? 1 : 0);
