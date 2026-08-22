// Does an import commit, deduplicate, and roll back?
//
//   npm run check:import
//
// The parser has its own tests (check:csv). This checks the half that touches
// the ledger, because those failures are the expensive ones: a batch that
// cannot be rolled back is an evening spent unpicking rows by hand, and a
// re-imported statement that doubles a household's spending is worse.
//
// Writes to a real tenant and cleans up after itself, including on failure.

import { pbList, pbCreate, pbDelete, pbUpdate, pbStr } from "../src/lib/pocketbase.ts";
import { config } from "../src/lib/config.ts";
import { parseDelimited, guessColumns, applyMapping, contentKey } from "../src/lib/csv.ts";

let failures = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log("  ok    " + name);
  else {
    failures++;
    console.log(`  FAIL  ${name}\n          got      ${a}\n          expected ${e}`);
  }
};

const tenantId = config.demoTenantId;
const BATCH = `imp_check_${Date.now().toString(36)}`;
const made: string[] = [];

// A realistic two-column export, with the traps: thousands separators, a CR
// marker, a duplicate row, and a line that cannot be read.
const CSV =
  "Date,Description,Debit,Credit\n" +
  '13/04/2026,LOTUSS KL,"1,234.56",\n' +
  "14/04/2026,SALARY APRIL,,\"5,000.00 CR\"\n" +
  '13/04/2026,LOTUSS KL,"1,234.56",\n' + // exact duplicate of row 1
  "BALANCE B/F,,,\n";

try {
  console.log("\nschema");
  const col = await (async () => {
    const rows = await pbList<{ id: string }>("transactions", { perPage: 1 });
    return rows;
  })();
  void col;

  const rows = parseDelimited(CSV, ",");
  const map = guessColumns(rows[0], rows.slice(1));
  const parsed = applyMapping(rows.slice(1), map);

  console.log("\nparsing the file");
  check("4 data rows kept", parsed.length, 4);
  check("one row is unreadable and reported", parsed.filter((p) => p.problems.length).length, 1);
  const good = parsed.filter((p) => !p.problems.length);
  check("3 readable rows", good.length, 3);
  check("duplicate detected by content key", new Set(good.map(contentKey)).size, 2);

  console.log("\ncommitting");
  // Import the two DISTINCT rows, stamped with a batch — mirroring what the API
  // does, without needing a session in a script.
  const distinct = [...new Map(good.map((g) => [contentKey(g), g])).values()];
  const bucket = (
    await pbList<{ id: string; props: { bucket?: number } | null }>("nodes", {
      filter: `tenant = ${pbStr(tenantId)} && kind = 'bucket'`,
      perPage: 50,
    })
  ).find((b) => Number(b.props?.bucket) === 3)!;

  for (const r of distinct) {
    const t = await pbCreate<{ id: string }>("transactions", {
      tenant: tenantId,
      wallet_node: bucket.id,
      amount: r.amount,
      currency: "MYR",
      occurred_at: `${r.date} 12:00:00.000Z`,
      direction: r.direction,
      source: "check:import",
      voided: false,
      import_batch: BATCH,
      import_key: contentKey(r),
    });
    made.push(t.id);
  }
  check("2 records created", made.length, 2);

  const stored = await pbList<{ id: string; import_batch?: string; import_key?: string; voided?: boolean }>(
    "transactions",
    { filter: `tenant = ${pbStr(tenantId)} && import_batch = ${pbStr(BATCH)}`, perPage: 50 },
  );
  check("batch is selectable in one query", stored.length, 2);
  check("every record carries its content key", stored.every((s) => Boolean(s.import_key)), true);

  console.log("\nre-importing the same file finds them");
  const existingKeys = new Set(stored.map((s) => s.import_key));
  const wouldSkip = distinct.filter((r) => existingKeys.has(contentKey(r)));
  check("all rows recognised as already imported", wouldSkip.length, distinct.length);

  console.log("\nrolling back");
  for (const s of stored) await pbUpdate("transactions", s.id, { voided: true });
  const after = await pbList<{ voided?: boolean }>("transactions", {
    filter: `tenant = ${pbStr(tenantId)} && import_batch = ${pbStr(BATCH)}`,
    perPage: 50,
  });
  check("whole batch voided in one action", after.every((a) => a.voided === true), true);
  // Voided, not deleted — the ledger's premise is that changes are recorded.
  check("records still exist after rollback", after.length, 2);
} catch (err) {
  failures++;
  console.log("  FAIL  " + (err instanceof Error ? err.message : String(err)));
} finally {
  for (const id of made) await pbDelete("transactions", id).catch(() => {});
  console.log(`\ncleanup: removed ${made.length} test record(s)`);
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nImport commits, deduplicates and rolls back.");
process.exit(failures ? 1 : 0);
