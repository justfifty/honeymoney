// Install the `vaults` collection on whichever PocketBase .env.local points at.
//
//   npm run vault:install              # report only; changes nothing
//   npm run vault:install -- --apply   # create it
//
// ── WHY THIS EXISTS RATHER THAN JUST THE MIGRATION FILE ────────────────────
//
// pocketbase/pb_migrations/1756200003_vaults.js is the source of truth, and a
// PocketBase started with --migrationsDir applies it on boot. That covers the
// local instance. Production is a DIFFERENT PocketBase — honeymoney-pb.domcloud
// .dev — whose pb_migrations directory lives on that host, so the file only
// runs there after it has been copied there and the process restarted.
//
// A schema change on the live ledger is not something to do as a side effect of
// somebody running a build. So: report by default, change on an explicit flag,
// and be safe to run twice. The same shape as `npm run repair:income`.
//
// It creates an EMPTY collection with superuser-only rules. It adds no field to
// an existing table, rewrites nothing, and touches no household record.

import { config, isPocketBaseConfigured } from "../src/lib/config.ts";

const APPLY = process.argv.includes("--apply");

if (!isPocketBaseConfigured()) {
  console.error("PocketBase is not configured. Set POCKETBASE_URL / ADMIN_EMAIL / ADMIN_PASSWORD.");
  process.exit(2);
}

const base = config.pocketbaseUrl;
const authRes = await fetch(`${base}/api/collections/_superusers/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: config.pocketbaseAdminEmail, password: config.pocketbaseAdminPassword }),
});
if (!authRes.ok) {
  console.error(`Could not authenticate against ${base} (${authRes.status}).`);
  process.exit(2);
}
const { token } = (await authRes.json()) as { token: string };
const auth = { Authorization: token, "Content-Type": "application/json" };

console.log(`\n  PocketBase: ${base}`);

const existing = await fetch(`${base}/api/collections/vaults`, { headers: auth });
if (existing.ok) {
  const c = (await existing.json()) as { fields?: { name: string }[] };
  console.log("  vaults: already installed");
  console.log(`  fields: ${(c.fields ?? []).map((f) => f.name).join(", ")}`);
  console.log("\n  Nothing to do.\n");
  process.exit(0);
}

console.log("  vaults: NOT installed");
if (!APPLY) {
  console.log("\n  This is a report. To create it:\n    npm run vault:install -- --apply\n");
  process.exit(0);
}

// Mirrors pocketbase/pb_migrations/1756200003_vaults.js exactly. If you change
// one, change the other — they are the same schema described twice because they
// run in two different places.
const body = {
  name: "vaults",
  type: "base",
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
  fields: [
    { type: "text", name: "tenant", required: true },
    { type: "text", name: "user", required: true },
    { type: "text", name: "label", max: 120 },
    { type: "text", name: "format", required: true },
    { type: "text", name: "envelope", required: true, max: 12000000 },
    { type: "number", name: "bytes" },
    { type: "text", name: "sealed_at" },
    { type: "autodate", name: "created", onCreate: true },
  ],
  indexes: ["CREATE INDEX idx_vaults_owner ON vaults (user, created)"],
};

const created = await fetch(`${base}/api/collections`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify(body),
});
if (!created.ok) {
  console.error(`\n  ✗ Could not create it (${created.status}): ${(await created.text()).slice(0, 400)}\n`);
  process.exit(1);
}
console.log("\n  ✓ vaults created — superuser-only, empty.");
console.log("    It holds ciphertext sealed in the browser. See docs/ZERO_KNOWLEDGE.md.\n");
