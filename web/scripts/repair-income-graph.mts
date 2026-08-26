// Repair households whose income was recorded before income became a node.
//
//   npm run repair:income          # report only, changes nothing
//   npm run repair:income -- --apply
//
// ── WHAT WENT WRONG ────────────────────────────────────────────────────────
//
// lib/projection.ts and lib/hscoreData.ts read a household's income from
// `income_source` nodes alone. Until 2026-08-26 the capture path filed every
// inflow against a `vendor` node, so a household that had entered its salary
// still had an income of zero everywhere that mattered: allocations divided
// nothing, headroom was nothing, the savings rate was zero over zero, and the
// H-Score described a household that earned nothing and spent normally.
//
// Two smaller faults came from the same place:
//   • a `+ Savings` deposit drew a SPENT_AT edge out of the savings bucket, so
//     putting money away rendered as spending it;
//   • inflows drew SPENT_AT edges too, so salary appeared as spend on /graph.
//
// The capture path is fixed. This repairs what it already wrote.
//
// ── WHAT IT WILL NOT TOUCH ─────────────────────────────────────────────────
//
// Demo tenants, because their income_source nodes are DECLARED figures that the
// seeded H-Score bands are checked against (npm run check:demo), and a derived
// figure would quietly move them.
//
// A vendor node that has ever received an outflow. "Maybank" can legitimately be
// both where the salary lands and where a fee is charged; converting it would
// turn real spending into income. Those are reported and left alone for a human.

import { pbList, pbCreate, pbUpdate, pbStr } from "../src/lib/pocketbase.ts";

const APPLY = process.argv.includes("--apply");
const DEMO = (process.env.DEMO_PERSONA_IDS ?? "psaisha33333333,cprahman2222222,hhrahman1111111")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

interface Node { id: string; tenant: string; kind: string; label: string; props: Record<string, unknown> | null }
interface Txn {
  id: string; tenant: string; amount: number; occurred_at: string;
  direction?: string; kind?: string | null; voided?: boolean;
  wallet_node?: string; vendor_node?: string; edge?: string;
}
interface Edge { id: string; tenant: string; src_node: string; dst_node: string; rel: string; valid_to?: string }

const say = (m: string) => console.log("  " + m);
let changes = 0;

const tenants = await pbList<{ id: string; name: string }>("tenants", {});
const real = tenants.filter((t) => !DEMO.includes(t.id));

console.log(`\nincome graph repair — ${APPLY ? "APPLYING" : "report only"}`);
console.log(`${real.length} household(s), ${DEMO.length} demo tenant(s) skipped\n`);

for (const t of real) {
  const [nodes, txns, edges] = await Promise.all([
    pbList<Node>("nodes", { filter: `tenant = ${pbStr(t.id)}` }),
    pbList<Txn>("transactions", { filter: `tenant = ${pbStr(t.id)}` }),
    pbList<Edge>("edges", { filter: `tenant = ${pbStr(t.id)}` }),
  ]);
  const live = txns.filter((x) => !x.voided);
  const inflows = live.filter((x) => x.direction === "in");
  const transfers = live.filter((x) => x.kind === "transfer");
  if (!inflows.length && !transfers.length) continue;

  console.log(`── ${t.name}`);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // 1. Vendor nodes that only ever received inflows become income sources.
  const candidates = new Set(inflows.map((x) => x.vendor_node).filter(Boolean) as string[]);
  for (const id of candidates) {
    const n = byId.get(id);
    if (!n) continue;
    if (n.kind === "income_source") continue;
    const alsoSpent = live.some((x) => x.vendor_node === id && x.direction !== "in");
    if (alsoSpent) {
      say(`?  "${n.label}" receives income AND spending — left for a human to split`);
      continue;
    }
    say(`→  "${n.label}": vendor → income_source`);
    changes++;
    if (APPLY) {
      await pbUpdate("nodes", id, {
        kind: "income_source",
        props: { ...(n.props ?? {}), derived: true },
      });
    }
  }

  // 2. Derived monthly figure, from the most recent month that actually had any.
  for (const id of candidates) {
    const n = byId.get(id);
    if (!n) continue;
    if (n.kind === "income_source" && n.props?.derived !== true) {
      say(`·  "${n.label}" is a declared source — monthly_amount left as stated`);
      continue;
    }
    const byMonth = new Map<string, number>();
    for (const x of inflows.filter((x) => x.vendor_node === id)) {
      const m = String(x.occurred_at).slice(0, 7);
      byMonth.set(m, (byMonth.get(m) ?? 0) + Number(x.amount || 0));
    }
    if (!byMonth.size) continue;
    const newest = [...byMonth.keys()].sort().pop() as string;
    const monthly = Math.round((byMonth.get(newest) ?? 0) * 100) / 100;
    say(`→  "${n.label}": monthly_amount = ${monthly} (from ${newest})`);
    changes++;
    if (APPLY) {
      await pbUpdate("nodes", id, {
        props: { ...(n.props ?? {}), derived: true, monthly_amount: monthly },
      });
    }
  }

  // 3. Income never has a source bucket. A bucket on an inflow is what drew a
  //    household's pay as originating inside its own rent bucket.
  for (const x of inflows.filter((x) => x.wallet_node)) {
    say(`→  inflow ${x.amount} on ${x.occurred_at.slice(0, 10)}: clearing its source bucket`);
    changes++;
    if (APPLY) await pbUpdate("transactions", x.id, { wallet_node: "", edge: "" });
  }

  // 4. SPENT_AT edges that represent an inflow or a transfer are not spending.
  //    Closed rather than deleted — the ledger's rule is void-not-delete, and an
  //    edge that silently disappears is a fact nobody can audit later.
  const spendPairs = new Set(
    live
      .filter((x) => x.direction !== "in" && x.kind !== "transfer" && x.wallet_node && x.vendor_node)
      .map((x) => `${x.wallet_node}→${x.vendor_node}`),
  );
  for (const e of edges) {
    if (e.rel !== "SPENT_AT" || e.valid_to) continue;
    if (spendPairs.has(`${e.src_node}→${e.dst_node}`)) continue;
    const from = byId.get(e.src_node)?.label ?? e.src_node;
    const to = byId.get(e.dst_node)?.label ?? e.dst_node;
    say(`→  closing SPENT_AT "${from}" → "${to}" (no spending ever crossed it)`);
    changes++;
    if (APPLY) await pbUpdate("edges", e.id, { valid_to: new Date().toISOString().replace("T", " ") });
  }

  // 5. Rows that predate the three-kind model have no kind. Fill it in ONLY
  //    where the direction says which way the money went.
  //
  //    Rows with neither are left alone and reported. The first version of this
  //    step defaulted them to outflow, matching how records.ts reads a missing
  //    direction — which would have turned a RM5,000 row labelled "Income" into
  //    five thousand ringgit of spending. A repair that guesses is worse than
  //    the fault it repairs: the household can say what that row was, and this
  //    script cannot.
  for (const x of live.filter((x) => !x.kind)) {
    if (x.direction !== "in" && x.direction !== "out") {
      const to = byId.get(x.vendor_node ?? "")?.label ?? "(none)";
      say(`?  ${x.amount} on ${x.occurred_at.slice(0, 10)} → "${to}": no direction recorded — open it in Records and re-save with + or −`);
      continue;
    }
    const k = x.direction === "in" ? "inflow" : "outflow";
    say(`→  ${x.amount} on ${x.occurred_at.slice(0, 10)}: kind = ${k}`);
    changes++;
    if (APPLY) await pbUpdate("transactions", x.id, { kind: k });
  }

  console.log("");
}

// A household that recorded income but has no bucket allocations still shows a
// flat dashboard, because there is income and nowhere for it to go. Worth
// saying out loud rather than leaving as a mystery.
for (const t of real) {
  const [nodes, edges] = await Promise.all([
    pbList<Node>("nodes", { filter: `tenant = ${pbStr(t.id)}` }),
    pbList<Edge>("edges", { filter: `tenant = ${pbStr(t.id)}` }),
  ]);
  const inc = nodes.filter((n) => n.kind === "income_source");
  const alloc = edges.filter((e) => !e.valid_to && (e.rel === "ALLOCATES_FIXED" || e.rel === "ALLOCATES_PCT"));
  // Per SOURCE, not per household — see ensureDefaultAllocations().
  const routed = new Set(alloc.map((e) => e.src_node));
  for (const src of inc.filter((n) => !routed.has(n.id))) {
    const buckets = nodes
      .filter((n) => n.kind === "bucket")
      .map((n) => ({ id: n.id, tier: Number(n.props?.bucket) || 3 }));
    const SPLIT: Record<number, number> = { 1: 50, 2: 20, 3: 30 };
    say(`→  ${t.name}: seeding the 50/20/30 starting split from "${src.label}"`);
    for (const [tier, pct] of Object.entries(SPLIT)) {
      const target = buckets.find((b) => b.tier === Number(tier));
      if (!target) continue;
      changes++;
      if (APPLY) {
        await pbCreate("edges", {
          tenant: t.id,
          src_node: src.id,
          dst_node: target.id,
          rel: "ALLOCATES_PCT",
          percentage: pct,
          props: { derived: true },
        });
      }
    }
  }
}

console.log("");
console.log(APPLY ? `applied ${changes} change(s).` : `${changes} change(s) would be made. Re-run with --apply.`);
console.log("");
