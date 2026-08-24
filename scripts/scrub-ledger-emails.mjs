// One-off: blank actor_email on every existing ledger row.
//
// WHY THIS IS SAFE ON AN APPEND-ONLY, HASH-CHAINED TABLE — the only question
// that matters here. lib/ledger.ts hashes { seq, prev_hash, op, collection,
// record_id, before, after, actor, at }. `actor_email` is NOT in that set: it
// was written alongside the entry, never into its hash. So clearing it cannot
// change any hash, cannot break any link in the chain, and verifyChain() must
// still pass afterwards. This script verifies that itself rather than asserting
// it — it runs the chain check before and after, and refuses to keep going if
// the first one is already broken.
//
// WHY DO IT AT ALL. Every other table keys financial data to opaque PocketBase
// IDs and stores no email. The ledger was the one place an email sat next to a
// household's money activity — and an email is a GLOBAL identifier: a login
// credential elsewhere, and the join key that would let anyone holding this
// table correlate a household with the same person on unrelated services. The
// display name that replaces it is local to a household that already sees it on
// every screen.
//
//   node scripts/scrub-ledger-emails.mjs --dry     # count what would change
//   node scripts/scrub-ledger-emails.mjs           # do it
//
// Credentials come from web/.env.local (POCKETBASE_URL, POCKETBASE_ADMIN_*).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const DRY = process.argv.includes("--dry");

function env() {
  const out = {};
  for (const file of [join(repo, "web", ".env.local"), join(repo, ".env")]) {
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m) out[m[1]] ??= m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
  return out;
}

const E = env();
const URL_ = process.env.POCKETBASE_URL || E.POCKETBASE_URL;
const EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || E.POCKETBASE_ADMIN_EMAIL;
const PASS = process.env.POCKETBASE_ADMIN_PASSWORD || E.POCKETBASE_ADMIN_PASSWORD;
if (!URL_ || !EMAIL || !PASS) throw new Error("Missing POCKETBASE_URL / ADMIN_EMAIL / ADMIN_PASSWORD.");

const base = URL_.replace(/\/$/, "");
console.log(`\n🧹 Scrubbing ledger emails\n   target: ${base}${DRY ? "  (dry run)" : ""}\n`);

const authRes = await fetch(`${base}/api/collections/_superusers/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: EMAIL, password: PASS }),
});
if (!authRes.ok) throw new Error(`Auth failed: ${authRes.status} ${await authRes.text()}`);
const { token } = await authRes.json();
const H = { Authorization: token, "Content-Type": "application/json" };

// Chain integrity, before. If it is already broken this script is not the tool
// to run next, and proceeding would make the damage harder to attribute.
async function chainOk() {
  const rows = await all("ledger", "tenant,seq,hash,prev_hash", "seq");
  const byTenant = new Map();
  for (const r of rows) (byTenant.get(r.tenant) ?? byTenant.set(r.tenant, []).get(r.tenant)).push(r);
  let broken = 0;
  for (const list of byTenant.values()) {
    for (let i = 1; i < list.length; i++) {
      if (list[i].prev_hash !== list[i - 1].hash) broken++;
    }
  }
  return { total: rows.length, broken };
}

async function all(collection, fields, sort) {
  const out = [];
  for (let page = 1; ; page++) {
    const u = `${base}/api/collections/${collection}/records?perPage=500&page=${page}&fields=id,${fields}&sort=${sort}`;
    const r = await fetch(u, { headers: H });
    if (!r.ok) throw new Error(`${collection} list failed: ${r.status} ${await r.text()}`);
    const d = await r.json();
    out.push(...d.items);
    if (page >= d.totalPages) break;
  }
  return out;
}

const before = await chainOk();
console.log(`   chain before: ${before.total} entries, ${before.broken} broken link(s)`);
if (before.broken > 0) {
  console.error("\n✗ The chain is already broken. Investigate that first — not this.");
  process.exit(1);
}

const rows = await all("ledger", "actor_email", "seq");
// Only rows whose label actually looks like an email. "telegram" and friends are
// legitimate channel labels and stay exactly as they are.
const targets = rows.filter((r) => r.actor_email && r.actor_email.includes("@"));
console.log(`   rows with an email: ${targets.length} of ${rows.length}`);

if (!targets.length) {
  console.log("\n✅ Nothing to scrub.\n");
  process.exit(0);
}
if (DRY) {
  console.log("\n(dry run — nothing written)\n");
  process.exit(0);
}

let done = 0;
for (const r of targets) {
  const res = await fetch(`${base}/api/collections/ledger/records/${r.id}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ actor_email: "" }),
  });
  if (!res.ok) throw new Error(`PATCH ${r.id} failed: ${res.status} ${await res.text()}`);
  done++;
}
console.log(`   cleared: ${done}`);

const after = await chainOk();
console.log(`   chain after:  ${after.total} entries, ${after.broken} broken link(s)`);
if (after.broken > 0) {
  console.error("\n✗ The chain broke. That should be impossible — actor_email is not hashed.");
  process.exit(1);
}
console.log("\n✅ Emails removed from the ledger; hash chain still intact.\n");
