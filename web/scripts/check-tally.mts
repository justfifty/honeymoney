// Do the graph and the dashboard agree about the same household?
//
//   npm run check:tally
//
// This exists because they did not, and each was internally consistent, which is
// why it survived review. lib/moneyView.ts skipped voided rows and credits;
// lib/graphView.ts skipped neither and summed EVERY transaction into its
// spend-per-edge map. A household that recorded a RM20,000 salary saw it drawn
// as twenty thousand ringgit of spending on /graph and not on the dashboard.
//
// It also checks the link that made the whole thing read as broken: income is
// stored as transactions but READ from `income_source` nodes, so a household
// that had entered its salary still had an income of zero everywhere it
// mattered — nothing to allocate, no headroom, a savings rate of zero over zero,
// and an H-Score describing a household that earned nothing.
//
// Two assertions, both of which failed before 2026-08-26:
//   • every ringgit of income is routed somewhere (income === allocated)
//   • /graph and the dashboard report the same month-to-date spend
//
// Exits non-zero on a mismatch, so it can gate a deploy.

import { pbList, pbStr } from "../src/lib/pocketbase.ts";
import { getBucketProjection } from "../src/lib/projection.ts";
import { getMoneyView } from "../src/lib/moneyView.ts";
import { getGraphView } from "../src/lib/graphView.ts";
import { getHScore } from "../src/lib/hscoreData.ts";

let failures = 0;
const DEMO = ["psaisha33333333","cprahman2222222","hhrahman1111111"];
const tenants = await pbList<{id:string;name:string}>("tenants", {});
for (const t of tenants) {
  if (DEMO.includes(t.id)) continue;
  const nodes = await pbList<{kind:string;label:string;props:Record<string,unknown>|null}>("nodes",{filter:`tenant = ${pbStr(t.id)}`});
  const inc = nodes.filter(n=>n.kind==="income_source");
  if (!inc.length) continue;
  const [proj, money, graph, hs] = await Promise.all([
    getBucketProjection(t.id), getMoneyView(t.id), getGraphView(t.id), getHScore(t.id,{persist:false}),
  ]);
  console.log(`\n── ${t.name}`);
  console.log(`   income sources : ${inc.map(n=>`${n.label}=${Number(n.props?.monthly_amount)||0}`).join(", ")}`);
  console.log(`   moneyView income ${money.totalIncome}  allocated ${money.totalAllocated}  spent(mtd) ${money.totalSpent}`);
  console.log(`   hscore  net ${hs.inputs.netIncomeMonthly}  mustPaid ${hs.inputs.mustPaidMonthly}  savings ${hs.inputs.savingsMonthly}  score ${hs.score}`);
  for (const b of proj) console.log(`     ${b.bucket_label.padEnd(14)} alloc ${String(b.allocated).padStart(8)}  mtd ${String(b.mtd_spend).padStart(7)}  bal ${String(b.projected_balance).padStart(8)}  ${b.status}`);
  const graphSpend = graph.edges.filter(e=>e.rel==="SPENT_AT").reduce((s,e)=>s+e.flow,0);
  const ok = Math.abs(graphSpend - money.totalSpent) < 0.01;
  console.log(`   TALLY  graph SPENT_AT total ${graphSpend.toFixed(2)}  vs dashboard spend ${money.totalSpent.toFixed(2)}  → ${ok?"MATCH":"MISMATCH"}`);
  if (!ok) failures++;

  // Income the app was told about but has nowhere to put shows up as an empty
  // dashboard, which reads to the user as "it didn't save".
  const unrouted = Math.round((money.totalIncome - money.totalAllocated) * 100) / 100;
  if (Math.abs(unrouted) > 0.01) {
    console.log(`   ✗ RM${unrouted} of income is not allocated to any bucket`);
    failures++;
  }
}

console.log("");
if (failures) {
  console.log(`${failures} tally failure(s).`);
  process.exit(1);
}
console.log("Graph and dashboard agree, and every ringgit of income is routed.");
console.log("");
