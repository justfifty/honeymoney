// Clear IP addresses and user-agents out of old page_views rows.
//
// WHY THIS EXISTS: the privacy notice says, in both languages, "No IP address
// is stored, no browser fingerprint, and views are not linked to your account."
// That became true for NEW rows when /api/track was rewritten to store counts
// instead of profiles — but the rows written before that change were left
// alone, so the notice was describing the code rather than the database. A
// notice is a statement about the data you hold, not about the code path that
// writes it. Rows holding an IP, a full user-agent and (when signed in) an
// account id are a per-person browsing history of a personal-finance app, and
// keeping them contradicts the notice they are supposed to be covered by.
//
//   node scripts/purge-legacy-visit-data.mjs           # count, change nothing
//   node scripts/purge-legacy-visit-data.mjs --apply   # clear the fields
//
// Fields are BLANKED, not rows deleted: the visit counts are legitimate and
// still described by the notice. It is the identifying columns that have to go.
//
// Reads POCKETBASE_URL / POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD
// from web/.env.local, the same file the app runs on.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of readFileSync(join(root, "web/.env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}

const URL_ = env.POCKETBASE_URL;
if (!URL_) throw new Error("POCKETBASE_URL missing from web/.env.local");
const APPLY = process.argv.includes("--apply");

const auth = await fetch(`${URL_}/api/collections/_superusers/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
}).then((r) => r.json());
if (!auth.token) throw new Error(`auth failed: ${JSON.stringify(auth).slice(0, 200)}`);
const H = { "Content-Type": "application/json", Authorization: auth.token };

// The identifying columns. `city` joins them: a city is not an IP, but at
// household granularity it is a location, and the notice promises country.
const DIRTY = ["ip", "ua", "city", "user"];

let page = 1;
const stale = [];
for (;;) {
  const res = await fetch(
    `${URL_}/api/collections/page_views/records?perPage=500&page=${page}&fields=id,${DIRTY.join(",")}`,
    { headers: H },
  ).then((r) => r.json());
  if (!res.items) throw new Error(`read failed: ${JSON.stringify(res).slice(0, 200)}`);
  for (const r of res.items) if (DIRTY.some((f) => r[f])) stale.push(r);
  if (page >= res.totalPages) {
    console.log(`page_views scanned: ${res.totalItems}`);
    break;
  }
  page++;
}

const per = Object.fromEntries(DIRTY.map((f) => [f, stale.filter((r) => r[f]).length]));
console.log(`rows carrying identifying fields: ${stale.length}`);
for (const f of DIRTY) console.log(`  ${f.padEnd(5)} ${per[f]}`);

if (!stale.length) {
  console.log("\nNothing to purge — the database already matches the privacy notice.");
  process.exit(0);
}
if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to blank these fields.");
  process.exit(0);
}

let done = 0;
for (const r of stale) {
  const body = Object.fromEntries(DIRTY.map((f) => [f, ""]));
  const res = await fetch(`${URL_}/api/collections/page_views/records/${r.id}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify(body),
  });
  if (res.ok) done++;
  else console.error(`  failed ${r.id}: ${res.status}`);
}
console.log(`\ncleared ${done}/${stale.length} rows.`);
