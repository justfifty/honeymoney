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

import { pbList, pbCreate, pbDelete, pbStr } from "../src/lib/pocketbase.ts";
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
