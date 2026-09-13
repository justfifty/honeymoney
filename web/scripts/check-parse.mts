// Does the local parser read a typed price the way the person meant it?
//
//   npm run check:parse
//
// ── THE FAILURE THIS EXISTS FOR ────────────────────────────────────────────
//
// 2026-09-13. Asked whether typing "SG20.00" would be converted to ringgit,
// the answer was: no. The parser read the amount (20), missed the currency
// (so the form kept MYR and no conversion happened), and offered the merchant
// "SG .00". Same for "RM20", "SGD20", "USD20", "THB100", "JPY500" — every
// currency code with the number glued to it, which is how prices are typed.
// The spaced forms ("RM 20", "S$20", "20 sgd") had always worked, which is
// why nobody noticed: the parser was right often enough to be trusted.
//
// For a converter the silent miss is the worst case. A wrong amount looks
// wrong; a right amount in the wrong currency looks right until the month-end
// total is off by the exchange rate.
//
// ── WHAT IS CHECKED ────────────────────────────────────────────────────────
//
// parseVoiceLocal, end to end, on a table of typed inputs: amount, currency
// and vendor together, because the three come from the same characters and a
// fix to one has broken another before ("S$20 kopi" → vendor "S Kopi"). The
// rows marked "held" are behaviours that already worked and must keep working.

import { parseVoiceLocal } from "../src/lib/voiceParse";

type Row = { input: string; amount: number | undefined; currency: string | undefined; vendor: string | undefined; note?: string };

const rows: Row[] = [
  // The glued codes that were being filed in MYR.
  { input: "SG20.00", amount: 20, currency: "SGD", vendor: undefined, note: "SG shorthand, no merchant" },
  { input: "kopi SG20.00", amount: 20, currency: "SGD", vendor: "Kopi" },
  { input: "SGD20.00 kopi", amount: 20, currency: "SGD", vendor: "Kopi" },
  { input: "SG$20 kopi", amount: 20, currency: "SGD", vendor: "Kopi" },
  { input: "RM20", amount: 20, currency: "MYR", vendor: undefined },
  { input: "USD20", amount: 20, currency: "USD", vendor: undefined },
  { input: "THB100", amount: 100, currency: "THB", vendor: undefined, note: "used to snap the leftover 'THB' to the vendor TNB" },
  { input: "JPY500", amount: 500, currency: "JPY", vendor: undefined },
  { input: "HKD50 dim sum", amount: 50, currency: "HKD", vendor: "Dim Sum" },
  { input: "GBP15 book", amount: 15, currency: "GBP", vendor: "Book" },
  { input: "£15 book", amount: 15, currency: "GBP", vendor: "Book" },
  { input: "CNY100 taxi", amount: 100, currency: "CNY", vendor: "Taxi" },
  { input: "RMB100 taxi", amount: 100, currency: "CNY", vendor: "Taxi", note: "RMB is not RM" },
  { input: "TWD200 taxi", amount: 200, currency: "TWD", vendor: "Taxi" },
  { input: "Kopi SG 20", amount: 20, currency: "SGD", vendor: "Kopi", note: "shorthand with a space" },

  // The vendor debris from the same lines.
  { input: "kopi 20.00", amount: 20, currency: undefined, vendor: "Kopi", note: "was 'Kopi .00'" },
  { input: "S$20 kopi", amount: 20, currency: "SGD", vendor: "Kopi", note: "was 'S Kopi'" },
  { input: "kopi 20 sgd", amount: 20, currency: "SGD", vendor: "Kopi", note: "was 'Kopi Sgd'" },

  // Held: what already worked.
  { input: "Kopi C 6.50", amount: 6.5, currency: undefined, vendor: "Kopi C" },
  { input: "RM 2,000 raya trip", amount: 2000, currency: "MYR", vendor: "Raya Trip" },
  { input: "lunch at Tesco 42.50", amount: 42.5, currency: undefined, vendor: "Tesco" },
  { input: "20 sgd at Ya Kun", amount: 20, currency: "SGD", vendor: "Ya Kun" },
  { input: "spent 12 at 99 Speedmart", amount: 12, currency: undefined, vendor: "99 Speedmart", note: "the 99 is the merchant, not money" },
  { input: "US$20 lunch", amount: 20, currency: "USD", vendor: "Lunch" },
  { input: "100 baht tuk tuk", amount: 100, currency: "THB", vendor: "Tuk Tuk" },
  { input: "500 yen ramen", amount: 500, currency: "JPY", vendor: "Ramen" },
  { input: "farm20", amount: 20, currency: undefined, vendor: "Farm", note: "'rm' inside a word is not ringgit" },

  // Deliberate: ambiguous signs stay undetected so the form keeps the chosen currency.
  { input: "$20 lunch", amount: 20, currency: undefined, vendor: "Lunch", note: "$ alone is USD to one person and SGD to the next" },
  // A merchant with SG in its name, no number after it, is not a currency.
  { input: "SG Kopi 20", amount: 20, currency: undefined, vendor: "SG Kopi" },
];

let failures = 0;
console.log("\ntyped-price parse check\n");
for (const row of rows) {
  const p = parseVoiceLocal(row.input);
  const got = { amount: p.amount, currency: p.currency, vendor: p.vendor };
  const want = { amount: row.amount, currency: row.currency, vendor: row.vendor };
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${JSON.stringify(row.input).padEnd(30)} → ${p.currency ?? "(none)"} ${p.amount} · ${JSON.stringify(p.vendor)}${row.note ? `   — ${row.note}` : ""}`);
  if (!ok) console.log(`          wanted ${want.currency ?? "(none)"} ${want.amount} · ${JSON.stringify(want.vendor)}`);
}
if (failures) {
  console.log(`\n${failures} of ${rows.length} rows failed.\n`);
  process.exit(1);
}
console.log(`\nAll ${rows.length} rows pass.\n`);
