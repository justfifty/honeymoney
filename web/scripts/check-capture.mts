// Does data keyed in today actually reach every screen?
//
//   npm run check:capture
//
// Runs against a throwaway household created and deleted by this script, so it
// proves the CURRENT capture path rather than the state of anyone's records.
//
// Each assertion here failed before 2026-08-26:
//   • income was written as a transaction and read from an income_source node,
//     so a household that had entered its salary had an income of zero in the
//     projection, the dashboard and the H-Score
//   • `+ Savings` posted a bucket, and a bucket meant a SPENT_AT edge, so
//     putting money away rendered as spending it
//   • a new household had three buckets and no allocations, so the first salary
//     arrived in a graph with nowhere to send it and every bucket read unfunded
//   • and the fix itself nearly broke imports: a CSV credit carries a direction
//     but no category, so "Refund - Shopee" would have become an income source
//     with a monthly figure. Step 4 is that regression, kept as a test.
//
// Step 0 was added on 2026-08-26 with the one-line capture: the Record screen
// now CLASSIFIES what you type, so the table that decides "salary" from
// "refund" sits on the path to a written record, and is tested as one.

import { pbList, pbCreate, pbDelete, pbStr } from "../src/lib/pocketbase.ts";
import { classifyText } from "../src/lib/classify.ts";
import { kindOf } from "../src/lib/recordKind.ts";
import { parseVoiceLocal } from "../src/lib/voiceParse.ts";
import { addManualTransaction } from "../src/lib/graph.ts";
import { getBucketProjection } from "../src/lib/projection.ts";
import { getMoneyView } from "../src/lib/moneyView.ts";
import { getGraphView } from "../src/lib/graphView.ts";
import { getHScore } from "../src/lib/hscoreData.ts";

let fail = 0;
const ok = (n: string, c: boolean, d = "") => { console.log(`  ${c ? "ok  " : "FAIL"}  ${n}${d && !c ? "  — " + d : ""}`); if (!c) fail++; };

// A throwaway household, so nothing here touches real or demo data.
const t = await pbCreate<{id:string}>("tenants", { name: "E2E probe", kind: "household", base_currency: "MYR" });
const made: {c:string;id:string}[] = [{c:"tenants",id:t.id}];
const bucket = async (label:string, tier:number) => {
  const n = await pbCreate<{id:string}>("nodes", { tenant:t.id, kind:"bucket", label, props:{ bucket: tier } });
  made.push({c:"nodes",id:n.id}); return n.id;
};
try {
  const must = await bucket("Must-paid",1); await bucket("Savings",2); const spend = await bucket("Spendings",3);

  // ── 0. the classifier, which now decides what gets written ───────────────
  //
  // Every line here is what a Malaysian household actually types. The income
  // rows are the ones that used to come back "spendings" — the direction wrong,
  // not merely the bucket — and the last two are the trap: earnings words hide
  // INSIDE expense words, so "rental income" must not be filed as rent nor "EPF
  // dividend" as savings.
  console.log("\n0. the one-line classifier (lib/classify.ts, 0 tokens, on-device):");
  const CASES: [string, string][] = [
    ["Grab 18.40", "spendings"],
    ["kopi 6.50", "spendings"],
    ["TNB bill 142", "must_paid"],
    ["sewa rumah 1200", "must_paid"],
    ["tuisyen Aisyah 300", "must_paid"],
    ["Salary 5000", "income"],
    ["gaji bulan ini 4200", "income"],
    ["bonus 2000", "income"],
    ["freelance invoice 1500", "income"],
    ["dividend ASB 340", "income"],
    ["komisen jualan 780", "income"],
    ["pencen 1800", "income"],
    ["refund Shopee 80", "income_other"],
    ["cashback Touch n Go 12", "income_other"],
    ["duit raya 200", "income_other"],
    ["simpan 500", "savings"],
    ["tabung ASB 300", "savings"],
    ["rental income 700", "income"],
    ["EPF dividend 1200", "income"],
  ];
  for (const [text, expected] of CASES) {
    const got = classifyText(text).category;
    ok(`"${text}" -> ${expected}`, got === expected, `got ${got}`);
  }
  ok("an ambiguous line asks to be checked", classifyText("save 500 from my salary").confidence < 0.6);
  ok("a clean line does not", classifyText("Salary 5000").confidence >= 0.6);

  // ── 0a. "+ Money in" is a statement, not a hint ──────────────────────────
  //
  // Tapping it and typing "Ali 500" — my brother paid me back — used to record
  // a SPEND: no keyword matched, and the cold-start default is spending. The
  // button worked and the next keystroke undid it. The table may still choose
  // WHICH kind of money-in; it may not choose whether it is money-in.
  console.log("\n0a. the stated direction outranks the guessed one:");
  ok("+ Money in with no keyword is still income", classifyText("Ali 500", { sign: "in" }).category === "income");
  ok("+ Money in over a spend word is still income", classifyText("Grab 18.40", { sign: "in" }).category === "income");
  ok("- Money out over an earnings word is a spend", classifyText("Salary 5000", { sign: "out" }).category === "spendings");
  ok("+ Money in still tells savings from earnings", classifyText("simpan 500", { sign: "in" }).category === "savings");
  ok("+ Money in still tells money back from earnings", classifyText("refund 80", { sign: "in" }).category === "income_other");
  ok("- Money out still tells a bill from a spend", classifyText("TNB bill 142", { sign: "out" }).category === "must_paid");

  // ── 0a-ii. …but it has no claim over the THIRD kind ──────────────────────
  //
  // Savings is a transfer: not money entering the household, not money leaving
  // it. Which button that feels like depends on which pocket you are picturing,
  // and "out of my account" is at least as natural as "into my savings" — it is
  // also the side the form opens on.
  //
  // The sign filter dropped savings from the out-side tables entirely, so the
  // keyword never ran, nothing matched, and the cold-start default turned
  // "Saving 500" into an ordinary spend in the Spendings bucket. Found in a live
  // household: three rows reading "Saving −RM500" beside one reading
  // "Saving →RM500", same words, same amount, same day — and the wrong ones
  // counted against that household's spending.
  console.log("\n0a-ii. savings is a transfer, so neither button may veto it:");
  ok("- Money out + a savings word is savings, not a spend", classifyText("Saving 500", { sign: "out" }).category === "savings");
  ok("- Money out + Malay savings word too", classifyText("simpan 500", { sign: "out" }).category === "savings");
  ok("- Money out + ASB is savings", classifyText("ASB 300", { sign: "out" }).category === "savings");
  ok("+ Money in + a savings word is still savings", classifyText("Saving 500", { sign: "in" }).category === "savings");
  ok("and it lands as a transfer either way", kindOf(classifyText("Saving 500", { sign: "out" }).category) === "transfer");
  // The guard on the guard: opening savings up must not swallow ordinary spends.
  ok("- Money out with no savings word is still a spend", classifyText("Dinner 600", { sign: "out" }).category === "spendings");
  ok("- Money out on a bill is still must-paid", classifyText("Rent 1200", { sign: "out" }).category === "must_paid");

  // ── 0b. the amount, which is the one thing a record cannot be wrong about ──
  //
  // Both of these were silent: no error, no warning — a card that simply did not
  // appear, or one showing RM2.00 where the user typed RM2,000. They surfaced
  // the day the Record screen began parsing typed lines, and they are the reason
  // the parser is tested here and not only through a receipt.
  console.log("\n0b. what you typed is the amount that gets written:");
  const AMOUNTS: [string, number, string][] = [
    ["Grab 18.40", 18.4, "Grab"],
    ["kopi 6.50", 6.5, "Kopi"],
    // A bare 4-digit number used to be deleted as a YEAR before the amount was read.
    ["bonus 2000", 2000, "Bonus"],
    ["rent 2000", 2000, "Rent"],
    // A thousands separator used to be read as a decimal point: RM2,000 -> RM2.00.
    ["RM2,000 Raya trip", 2000, "Raya Trip"],
    ["Salary 5,000", 5000, "Salary"],
    ["gaji 4,200", 4200, "Gaji"],
    // And the names that must survive their own digits.
    ["99 Speedmart 12.30", 12.3, "99 Speedmart"],
    ["7-Eleven 4.20", 4.2, "7-Eleven"],
  ];
  for (const [text, amount, vendor] of AMOUNTS) {
    const parsed = parseVoiceLocal(text);
    ok(`"${text}" -> ${amount} at ${vendor}`, parsed.amount === amount && parsed.vendor === vendor,
       `got ${parsed.amount} at ${parsed.vendor}`);
  }

  console.log("\nA brand-new household, nothing configured:");
  let mv = await getMoneyView(t.id);
  ok("starts with no income", mv.totalIncome === 0);

  console.log("\n1. key in income (+ Income, RM6,000):");
  const inc = await addManualTransaction(t.id, { vendorLabel:"Salary", amount:6000, direction:"in", category:"income" });
  made.push({c:"transactions",id:inc.transactionId});
  const nodes = await pbList<{id:string;kind:string;label:string;props:Record<string,unknown>|null}>("nodes",{filter:`tenant = ${pbStr(t.id)}`});
  const src = nodes.find(n=>n.kind==="income_source");
  ok("an income_source node was created", !!src, "still filed as a vendor");
  ok("its monthly_amount is the amount keyed in", Number(src?.props?.monthly_amount)===6000, String(src?.props?.monthly_amount));
  const edges = await pbList<{src_node:string;rel:string;percentage:number;valid_to:string}>("edges",{filter:`tenant = ${pbStr(t.id)}`});
  ok("50/20/30 allocations were seeded", edges.filter(e=>e.rel==="ALLOCATES_PCT"&&!e.valid_to).length===3);
  ok("no SPENT_AT edge was drawn for income", !edges.some(e=>e.rel==="SPENT_AT"&&!e.valid_to));
  mv = await getMoneyView(t.id);
  ok("income reaches the dashboard", mv.totalIncome===6000, String(mv.totalIncome));
  ok("every ringgit is allocated", mv.totalAllocated===6000, String(mv.totalAllocated));
  ok("income is NOT counted as spend", mv.totalSpent===0, String(mv.totalSpent));

  console.log("\n2. key in savings (+ Savings, RM500 into the Savings bucket):");
  const sav = await addManualTransaction(t.id, { vendorLabel:"OCBC", amount:500, direction:"in", category:"savings", walletNodeId: must });
  made.push({c:"transactions",id:sav.transactionId});
  const e2 = await pbList<{rel:string;valid_to:string}>("edges",{filter:`tenant = ${pbStr(t.id)}`});
  ok("saving draws no SPENT_AT edge", !e2.some(e=>e.rel==="SPENT_AT"&&!e.valid_to));
  mv = await getMoneyView(t.id);
  ok("saving is NOT counted as spending", mv.totalSpent===0, String(mv.totalSpent));

  console.log("\n3. key in an expense (− Spendings, RM120):");
  const exp = await addManualTransaction(t.id, { vendorLabel:"99 Speedmart", amount:120, direction:"out", category:"spendings", walletNodeId: spend });
  made.push({c:"transactions",id:exp.transactionId});
  mv = await getMoneyView(t.id);
  const gv = await getGraphView(t.id);
  const gs = gv.edges.filter(e=>e.rel==="SPENT_AT").reduce((s,e)=>s+e.flow,0);
  ok("the expense reaches the dashboard", mv.totalSpent===120, String(mv.totalSpent));
  ok("graph and dashboard agree", Math.abs(gs-mv.totalSpent)<0.01, `${gs} vs ${mv.totalSpent}`);

  console.log("");
  console.log("4. an imported credit (direction only, no category) must NOT become income:");
  const ref = await addManualTransaction(t.id, { vendorLabel:"Refund - Shopee", amount:80, direction:"in", source:"import", walletNodeId: spend });
  made.push({c:"transactions",id:ref.transactionId});
  const n2 = await pbList<{kind:string;label:string}>("nodes",{filter:`tenant = ${pbStr(t.id)}`});
  ok("no income_source invented for a bare credit", !n2.some(n=>n.kind==="income_source"&&n.label.includes("Refund")));
  mv = await getMoneyView(t.id);
  ok("income is unchanged by the credit", mv.totalIncome===6000, String(mv.totalIncome));
  ok("the credit is not counted as spend", mv.totalSpent===120, String(mv.totalSpent));

  console.log("");
  console.log("5. money BACK is not money EARNED (+ Money in / Something else):");
  const cb = await addManualTransaction(t.id, { vendorLabel:"Cashback - TNG", amount:12, direction:"in", category:"income_other" });
  made.push({c:"transactions",id:cb.transactionId});
  const n3 = await pbList<{kind:string;label:string}>("nodes",{filter:`tenant = ${pbStr(t.id)}`});
  // `income_other` created an income_source until 2026-08-26, so the classifier
  // filing "cashback" there — correctly — would have made every refund a salary.
  ok("no income_source invented for a stated non-earning", !n3.some(n=>n.kind==="income_source"&&n.label.includes("Cashback")));
  mv = await getMoneyView(t.id);
  ok("income is unchanged by money coming back", mv.totalIncome===6000, String(mv.totalIncome));
  ok("…and it is not spend either", mv.totalSpent===120, String(mv.totalSpent));

  console.log("\n4. the derived views:");
  const proj = await getBucketProjection(t.id);
  const hs = await getHScore(t.id,{persist:false});
  ok("buckets are funded", proj.every(b=>b.allocated>0), proj.map(b=>`${b.bucket_label}=${b.allocated}`).join(" "));
  ok("the spend landed in the right bucket", proj.find(b=>b.bucket_label==="Spendings")?.mtd_spend===120);
  ok("H-Score sees the income", hs.inputs.netIncomeMonthly===6000, String(hs.inputs.netIncomeMonthly));
  ok("H-Score sees the savings allocation", hs.inputs.savingsMonthly>0, String(hs.inputs.savingsMonthly));
} finally {
  // Sweep by TENANT, not by the ids this script happens to remember. The first
  // version tracked only what it created explicitly and left behind every node
  // and edge that addManualTransaction created on its way — the income_source
  // and its allocations included, which then surfaced in check:tally as four
  // households with unallocated income. A teardown that removes only what it
  // wrote is not a teardown.
  for (const coll of ["transactions", "edges", "nodes", "ledger", "goals", "members"]) {
    const rows = await pbList<{id:string}>(coll, { filter: `tenant = ${pbStr(t.id)}` }).catch(() => []);
    for (const r of rows) await pbDelete(coll, r.id).catch(() => {});
  }
  await pbDelete("tenants", t.id).catch(() => {});
  console.log("");
  console.log("  (probe household removed)");
}
console.log("");
if (fail) { console.log(`${fail} failure(s).`); process.exit(1); }
console.log("New data keyed in tallies end to end.");
