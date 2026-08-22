// Tasks 1 + 6: do the kinds and the privacy stance actually hold?
//
//   npm run check:attribution
//
// Four invariants, each in the release's definition of done, each of which fails
// silently if it fails at all:
//
//   • existing records still load, and their kind is derived correctly
//   • a partner-to-partner transfer nets to ZERO at household level
//   • a private record is not returned to the other partner BY THE QUERY,
//     not merely hidden by a component
//   • a savings transfer is not counted as income
//
// The privacy one is the reason this is an integration check rather than a unit
// test. "The component doesn't render it" and "the server never sent it" look
// identical on screen and are completely different promises.

import { pbList, pbCreate, pbDelete, pbStr } from "../src/lib/pocketbase.ts";
import { getSpendRecords } from "../src/lib/records.ts";
import { deriveKind, kindOf } from "../src/lib/recordKind.ts";
import { householdNet, canSee, visibleFilter, defaultVisibility } from "../src/lib/attribution.ts";
import { config } from "../src/lib/config.ts";
import { getFocusedView } from "../src/lib/focusView.ts";

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
const made: string[] = [];

try {
  console.log("\nkinds — derived from what old rows already carry");
  check("savings bucket + money in ⇒ transfer", deriveKind({ direction: "in", bucketTier: 2 }), "transfer");
  check("savings bucket + money out ⇒ transfer", deriveKind({ direction: "out", bucketTier: 2 }), "transfer");
  check("money in elsewhere ⇒ inflow", deriveKind({ direction: "in", bucketTier: 3 }), "inflow");
  check("no direction ⇒ outflow", deriveKind({ bucketTier: 3 }), "outflow");
  check("an explicit kind always wins", deriveKind({ kind: "inflow", direction: "out", bucketTier: 2 }), "inflow");

  console.log("\nthe two buttons, three kinds");
  check("+ Savings is a TRANSFER, not income", kindOf("savings"), "transfer");
  check("+ Income is an inflow", kindOf("income"), "inflow");
  check("− Must-paid is an outflow", kindOf("must_paid"), "outflow");
  // Others on both sides must never collapse into one key.
  check("+ Others and − Others are different kinds", [kindOf("income_other"), kindOf("expense_other")], ["inflow", "outflow"]);

  console.log("\na partner-to-partner repayment nets to zero");
  check(
    "RM200 A→B changes nothing at household level",
    householdNet([{ kind: "transfer", amount: 200 }]),
    0,
  );
  check(
    "and does not offset real spending",
    householdNet([
      { kind: "inflow", amount: 5000 },
      { kind: "outflow", amount: 1200 },
      { kind: "transfer", amount: 200 },
    ]),
    3800,
  );

  console.log("\nvisibility defaults");
  check("individual household ⇒ shared (nobody to hide from)",
    defaultVisibility({ paidBy: "m1", bucketIsPrivate: true, composition: "individual" }), "shared");
  check("couple, personal bucket ⇒ private",
    defaultVisibility({ paidBy: "m1", bucketIsPrivate: true, composition: "couple" }), "private");
  check("couple, shared bucket ⇒ shared",
    defaultVisibility({ paidBy: "m1", bucketIsPrivate: false, composition: "couple" }), "shared");
  check("unattributed ⇒ shared",
    defaultVisibility({ paidBy: null, bucketIsPrivate: true, composition: "family" }), "shared");

  console.log("\ncanSee");
  check("your own private record is visible to you", canSee({ paidBy: "m1", visibility: "private" }, "m1"), true);
  check("a partner's private record is not", canSee({ paidBy: "m1", visibility: "private" }, "m2"), false);
  check("a shared record is visible to anyone", canSee({ paidBy: "m1", visibility: "shared" }, "m2"), true);

  console.log("\nTHE ONE THAT MATTERS: the QUERY excludes it, not the component");
  const members = await pbList<{ id: string; display_name: string }>("members", {
    filter: `tenant = ${pbStr(tenantId)}`,
    perPage: 10,
  });
  const bucket = (
    await pbList<{ id: string; props: { bucket?: number } | null }>("nodes", {
      filter: `tenant = ${pbStr(tenantId)} && kind = 'bucket'`,
      perPage: 50,
    })
  ).find((b) => Number(b.props?.bucket) === 3)!;

  if (members.length < 2) {
    console.log("  --    only one member in this household; privacy needs two. Skipped.");
  } else {
    const [alice, bob] = members;
    const t = await pbCreate<{ id: string }>("transactions", {
      tenant: tenantId,
      wallet_node: bucket.id,
      amount: 77.77,
      currency: "MYR",
      occurred_at: new Date().toISOString().replace("T", " "),
      source: "check:attribution",
      direction: "out",
      kind: "outflow",
      paid_by: alice.id,
      visibility: "private",
      voided: false,
    });
    made.push(t.id);

    const from = new Date(Date.now() - 3 * 86400000);
    const to = new Date(Date.now() + 86400000);

    const asAlice = await getSpendRecords(tenantId, from, to, { viewerMemberId: alice.id, redact: true });
    const asBob = await getSpendRecords(tenantId, from, to, { viewerMemberId: bob.id, redact: true });

    check("the payer sees their own private record", asAlice.some((r) => r.id === t.id), true);
    check("the partner does NOT — the query never returned it", asBob.some((r) => r.id === t.id), false);
    check("the filter names the viewer", visibleFilter(bob.id).includes(bob.id), true);
    check("no viewer ⇒ shared only (fails closed)", visibleFilter(null), "visibility != 'private'");
  }

  console.log("\nA TRANSFER MUST NOT RENDER AS MONEY LEAVING");
  // The Sankey's whole job is showing where money went. Until 2026-08-23 every
  // transaction with a bucket and a vendor became a bucket->vendor flow, so a
  // savings deposit drew as money leaving the household — the exact misreading
  // the brief says a household finance app cannot afford.
  {
    const savings = (
      await pbList<{ id: string; props: { bucket?: number } | null }>("nodes", {
        filter: `tenant = ${pbStr(tenantId)} && kind = 'bucket'`,
        perPage: 50,
      })
    ).find((b) => Number(b.props?.bucket) === 2);
    const goal = (
      await pbList<{ id: string; label: string }>("nodes", {
        filter: `tenant = ${pbStr(tenantId)} && kind = 'goal'`,
        perPage: 5,
      })
    )[0];

    if (!savings || !goal) {
      console.log("  --    no savings bucket or goal in this household. Skipped.");
    } else {
      const view = async () =>
        getFocusedView(tenantId, { kind: "none" } as never, "en", [tenantId], { redact: false });

      const before = await view();
      const outflowBefore = before.graph.edges.filter((e) => e.rel === "SPENT_AT").length;

      const t = await pbCreate<{ id: string }>("transactions", {
        tenant: tenantId,
        wallet_node: savings.id,
        vendor_node: goal.id, // the shape that used to draw as spending
        goal: goal.id,
        amount: 250,
        currency: "MYR",
        occurred_at: new Date().toISOString().replace("T", " "),
        source: "check:attribution",
        direction: "in",
        kind: "transfer",
        voided: false,
      });
      made.push(t.id);

      const after = await view();
      const outflowAfter = after.graph.edges.filter((e) => e.rel === "SPENT_AT").length;
      const saved = after.graph.edges.filter((e) => e.rel === "SAVED_INTO");

      check("the transfer adds NO spending flow", outflowAfter, outflowBefore);
      check("it terminates at the goal instead", saved.some((e) => e.dst === goal.id), true);
      check("carrying its amount", saved.find((e) => e.dst === goal.id)?.flow, 250);
    }
  }

  console.log("\nexisting records still load");
  const recent = await getSpendRecords(tenantId, new Date(Date.now() - 120 * 86400000), new Date(), {
    redact: false,
  });
  check("history is readable", recent.length > 0, true);
  check("every record has a kind", recent.every((r) => ["inflow", "outflow", "transfer"].includes(r.kind)), true);
  check(
    "pre-migration rows are marked NOT user-asserted",
    recent.every((r) => r.attributionAsserted === false),
    true,
  );
} catch (err) {
  failures++;
  console.log("  FAIL  " + (err instanceof Error ? err.message : String(err)));
} finally {
  for (const id of made) await pbDelete("transactions", id).catch(() => {});
  console.log(`\ncleanup: removed ${made.length} test record(s)`);
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nKinds derive, transfers net to zero, and privacy holds in the query.");
process.exit(failures ? 1 : 0);
