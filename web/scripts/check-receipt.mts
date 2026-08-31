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

console.log(failed ? `\n${failed} check(s) FAILED\n` : "\nAll receipt guarantees hold.\n");
process.exit(failed ? 1 : 0);
