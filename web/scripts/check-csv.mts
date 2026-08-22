// Does the CSV importer survive what banks actually export?
//
//   npm run check:csv
//
// Every case here is a real shape from a Malaysian bank export or a trap the
// brief names explicitly. They are worth pinning because each one fails
// SILENTLY: a mis-read date order lands a statement in the wrong month, a
// mis-read thousands separator turns RM1,234.56 into RM1.23, and neither throws.
//
// Pure functions, no network, no database — this runs in under a second.

import {
  parseDelimited,
  sniffDelimiter,
  parseAmount,
  parseDate,
  inferDateOrder,
  guessColumns,
  applyMapping,
  contentKey,
  type DateOrder,
} from "../src/lib/csv.ts";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log("  ok    " + name);
  } else {
    failures++;
    console.log(`  FAIL  ${name}\n          got      ${a}\n          expected ${e}`);
  }
}

console.log("\namounts — the separators and markers");
check("plain", parseAmount("12.50")?.value, 12.5);
check("thousands separator", parseAmount("1,234.56")?.value, 1234.56);
check("European decimals", parseAmount("1.234,56")?.value, 1234.56);
check("comma decimals, no thousands", parseAmount("1234,56")?.value, 1234.56);
check("thousands only, no decimals", parseAmount("1,234")?.value, 1234);
check("RM prefix", parseAmount("RM1,234.56")?.value, 1234.56);
check("MYR with space", parseAmount("MYR 1,234.56")?.value, 1234.56);
check("trailing CR is money IN", parseAmount("1,234.56 CR")?.explicitSign, "in");
check("trailing DR is money OUT", parseAmount("1,234.56 DR")?.explicitSign, "out");
check("parenthesised is negative", parseAmount("(1,234.56)")?.explicitSign, "out");
check("leading minus", parseAmount("-500")?.explicitSign, "out");
check("bare dash is not zero", parseAmount("-"), null);
check("empty is not zero", parseAmount(""), null);
check("text is not zero", parseAmount("BALANCE B/F"), null);

console.log("\ndates — the ambiguity that moves a whole statement");
check("unambiguous day-first", inferDateOrder(["13/04/2026", "03/04/2026"]), { order: "dmy", certain: true });
check("unambiguous month-first", inferDateOrder(["04/13/2026", "04/03/2026"]), { order: "mdy", certain: true });
check("ISO", inferDateOrder(["2026-04-13"]), { order: "ymd", certain: true });
// THE important one: nothing in the file distinguishes them, so it must say so
// and the UI must ask rather than assume.
check("all ambiguous ⇒ NOT certain", inferDateOrder(["03/04/2026", "05/06/2026"]), { order: "dmy", certain: false });
check("03/04 as dmy is 3 April", parseDate("03/04/2026", "dmy"), "2026-04-03");
check("03/04 as mdy is 4 March", parseDate("03/04/2026", "mdy"), "2026-03-04");
check("two-digit year", parseDate("03/04/26", "dmy"), "2026-04-03");
check("textual month bypasses order", parseDate("12 Mar 2026", "mdy"), "2026-03-12");
check("31 February is rejected", parseDate("31/02/2026", "dmy"), null);
check("rubbish is rejected", parseDate("BALANCE", "dmy"), null);

console.log("\nparsing — quotes, delimiters, newlines");
check(
  "embedded delimiter inside quotes",
  parseDelimited('a,"b,c",d', ","),
  [["a", "b,c", "d"]],
);
check("doubled quote escape", parseDelimited('"say ""hi""",2', ","), [['say "hi"', "2"]]);
check("CRLF", parseDelimited("a,b\r\nc,d", ","), [["a", "b"], ["c", "d"]]);
check("blank rows dropped", parseDelimited("a,b\n\n\nc,d", ","), [["a", "b"], ["c", "d"]]);
check("BOM stripped from first header", parseDelimited("﻿Date,Amount", ",")[0][0], "Date");
// A description column full of commas must not beat the real delimiter.
check(
  "semicolon file with commas in the text",
  sniffDelimiter("Date;Description;Amount\n01/04/2026;LOTUS, KL, MY;12,50"),
  ";",
);
check("tab file", sniffDelimiter("Date\tDesc\tAmount\n01/04/2026\tX\t1.00"), "\t");

console.log("\nmapping — a two-column debit/credit export");
{
  const text =
    "Date,Description,Debit,Credit,Balance\n" +
    "13/04/2026,LOTUSS KL,\"1,234.56\",,\"8,765.44\"\n" +
    "14/04/2026,SALARY,,\"5,000.00\",\"13,765.44\"\n";
  const rows = parseDelimited(text, ",");
  const map = guessColumns(rows[0], rows.slice(1));
  check("debit column found", map.debit, 2);
  check("credit column found", map.credit, 3);
  // Both present ⇒ the signed-amount column must be off, or rows count twice.
  check("signed amount disabled", map.amount, null);
  const parsed = applyMapping(rows.slice(1), map);
  check("debit row is money out", [parsed[0].amount, parsed[0].direction], [1234.56, "out"]);
  check("credit row is money in", [parsed[1].amount, parsed[1].direction], [5000, "in"]);
  check("no problems", parsed.flatMap((p) => p.problems), []);
}

console.log("\nmapping — one signed column, no header");
{
  const text = "13/04/2026,LOTUSS KL,-1234.56\n14/04/2026,SALARY,5000.00 CR\n";
  const rows = parseDelimited(text, ",");
  const map = guessColumns(["13/04/2026", "LOTUSS KL", "-1234.56"], rows);
  check("date column inferred by shape", map.date, 0);
  check("amount column inferred by shape", map.amount, 2);
  const parsed = applyMapping(rows, map);
  check("negative is out", [parsed[0].amount, parsed[0].direction], [1234.56, "out"]);
  check("CR is in", [parsed[1].amount, parsed[1].direction], [5000, "in"]);
}

console.log("\nunreadable rows are reported, never dropped");
{
  const rows = parseDelimited("13/04/2026,GOOD,10.00\nBALANCE B/F,,\n", ",");
  const parsed = applyMapping(rows, {
    date: 0, description: 1, amount: 2, debit: null, credit: null, balance: null,
    dateOrder: "dmy" as DateOrder,
  });
  check("row count preserved", parsed.length, 2);
  check("bad row carries its problems", parsed[1].problems.sort(), ["amount", "date", "description"]);
}

console.log("\ndedupe key");
{
  const a = { date: "2026-04-13", description: "LOTUSS  KL", amount: 12.5, direction: "out" as const, balance: null, problems: [] };
  const b = { date: "2026-04-13", description: "lotuss kl", amount: 12.5, direction: "out" as const, balance: null, problems: [] };
  check("same payment, different spacing/case ⇒ same key", contentKey(a) === contentKey(b), true);
  check("different amount ⇒ different key", contentKey(a) === contentKey({ ...b, amount: 12.6 }), false);
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nEvery bank-export trap handled.");
process.exit(failures ? 1 : 0);
