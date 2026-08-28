// Whose goal is it, and does it survive being nobody's?
//
//   npm run check:goals
//
// Runs against a throwaway household this script creates and deletes, so it
// proves the CURRENT read path rather than the state of anyone's records.
//
// Goals gained an owner so a household could keep individual targets alongside
// shared ones. The owner is ATTRIBUTION, not privacy: a personal goal is still
// visible to the whole household, it just says whose it is. What this pins:
//
//   • a goal with no owner is the household's, and always has been — every goal
//     that predates the field must keep meaning exactly that
//   • a goal with an owner resolves that owner's NAME, because every surface
//     labels by name and an unresolved id renders as a blank badge
//   • a goal owned by somebody who has LEFT falls back to the household's.
//     /goals builds its sections by walking the current roster, so a goal
//     matching no member matched no section and vanished from the page — a
//     savings target does not stop existing because the person who named it
//     left the household

import { pbCreate, pbDelete, pbList, pbStr } from "../src/lib/pocketbase.ts";
import { listGoals } from "../src/lib/goals.ts";

let failed = 0;
function ok(label: string, cond: boolean, detail = "") {
  if (!cond) failed++;
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

const tenant = await pbCreate<{ id: string }>("tenants", {
  kind: "household",
  name: "check-goals throwaway",
  base_currency: "MYR",
});

try {
  const alice = await pbCreate<{ id: string }>("members", {
    tenant: tenant.id,
    display_name: "Alice",
    role: "Alice",
    access_role: "owner",
  });
  const departed = await pbCreate<{ id: string }>("members", {
    tenant: tenant.id,
    display_name: "Leaver",
    role: "Leaver",
    access_role: "adult",
  });

  const mk = (label: string, props: Record<string, unknown>) =>
    pbCreate<{ id: string }>("nodes", {
      tenant: tenant.id,
      kind: "goal",
      label,
      props: { target: 1000, manual_adjustment: 100, category: "custom", ...props },
    });

  await mk("Shared roof fund", {});
  await mk("Alice's bike", { owner: alice.id });
  await mk("Orphaned target", { owner: departed.id });

  let goals = await listGoals(tenant.id);
  const by = (n: string) => goals.find((g) => g.name === n)!;

  console.log("\n1. a household goal and a personal one:");
  ok("all three goals are listed", goals.length === 3, `got ${goals.length}`);
  ok("no owner means the household's", by("Shared roof fund").owner === null);
  ok("…and carries no name badge", by("Shared roof fund").ownerName === null);
  ok("an owned goal keeps its owner", by("Alice's bike").owner === alice.id);
  ok("…and resolves the owner's NAME", by("Alice's bike").ownerName === "Alice", String(by("Alice's bike").ownerName));

  console.log("\n2. the owner leaves the household:");
  ok("their goal is owned while they are on the roster", by("Orphaned target").ownerName === "Leaver");
  await pbDelete("members", departed.id);
  goals = await listGoals(tenant.id);

  ok("the goal still appears at all", goals.length === 3, `got ${goals.length}`);
  ok("it falls back to the household's", goals.find((g) => g.name === "Orphaned target")!.owner === null);
  ok(
    "so no screen can group it into a section that no longer exists",
    goals.find((g) => g.name === "Orphaned target")!.ownerName === null,
  );

  console.log("\n3. progress is unaffected by any of this:");
  ok("the manual half still counts", by("Alice's bike").current === 100, String(by("Alice's bike").current));

  // 4. hidden goals: redacted, never erased.
  //
  // A private goal keeps its AMOUNT visible and loses everything that says what
  // it is for. The amount is not a compromise: goal progress is summed into the
  // household's liquid savings, which is the emergency-buffer component of one
  // H-Score — persisted and snapshotted nightly for the HOUSEHOLD, not per
  // viewer. A goal that disappeared for one partner would give two people
  // different scores off the same records, with nothing to reconcile them by.
  const bob = await pbCreate<{ id: string }>("members", {
    tenant: tenant.id,
    display_name: "Bob",
    role: "Bob",
    access_role: "adult",
  });
  await pbCreate("nodes", {
    tenant: tenant.id,
    kind: "goal",
    label: "Anniversary surprise",
    props: { target: 4000, manual_adjustment: 250, category: "gift", owner: bob.id, visibility: "private" },
  });

  console.log("\n4. a goal kept private:");
  const asBob = await listGoals(tenant.id, { viewerMemberId: bob.id });
  const bobsOwn = asBob.find((g) => g.owner === bob.id)!;
  ok("the owner sees it in full", bobsOwn.name === "Anniversary surprise" && !bobsOwn.redacted);
  ok("…with its target", bobsOwn.target === 4000, String(bobsOwn.target));

  const asAlice = await listGoals(tenant.id, { viewerMemberId: alice.id });
  const hidden = asAlice.find((g) => g.owner === bob.id)!;
  ok("everyone else still SEES a goal there", Boolean(hidden));
  ok("its name is gone", hidden.name !== "Anniversary surprise", hidden.name);
  ok("its target is gone", hidden.target === 0, String(hidden.target));
  ok("its date and category give nothing away", hidden.targetDate === null && hidden.category === "custom");
  ok("but the AMOUNT survives", hidden.current === 250, String(hidden.current));
  ok("and it is flagged so the UI can draw a lock", hidden.redacted === true);
  ok("whose it is is still named", hidden.ownerName === "Bob", String(hidden.ownerName));

  console.log("\n5. the household's own goals can never be private:");
  ok(
    "a goal with no owner is shared however its props read",
    asAlice.find((g) => g.name === "Shared roof fund")!.visibility === "shared",
  );
  // The signed-out/demo seat is nobody, so it must never be taken for an owner.
  const anon = await listGoals(tenant.id, {});
  ok("a viewer with no seat sees the redacted form", anon.find((g) => g.owner === bob.id)!.redacted === true);
} finally {
  // Leave nothing behind, whatever happened above.
  for (const n of await pbList<{ id: string }>("nodes", { filter: `tenant = ${pbStr(tenant.id)}` })) {
    await pbDelete("nodes", n.id).catch(() => undefined);
  }
  for (const m of await pbList<{ id: string }>("members", { filter: `tenant = ${pbStr(tenant.id)}` })) {
    await pbDelete("members", m.id).catch(() => undefined);
  }
  await pbDelete("tenants", tenant.id).catch(() => undefined);
}

console.log(failed === 0 ? "\n✅ goals: ownership behaves.\n" : `\n❌ goals: ${failed} failing.\n`);
process.exit(failed === 0 ? 0 : 1);
