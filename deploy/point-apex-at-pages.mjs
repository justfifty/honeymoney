// Point honeymoney.app at the Cloudflare Pages snapshot.
//
//   node deploy/point-apex-at-pages.mjs            # dry run — shows the change, writes nothing
//   node deploy/point-apex-at-pages.mjs --apply    # makes it
//
// WHY THIS EXISTS AS A SCRIPT rather than a dashboard click: the change is one
// field, but getting it wrong takes the whole site down, and the failure is not
// obvious. This does the swap with the guardrails written in.
//
// ── WHAT IT NEEDS ──────────────────────────────────────────────────────────
//
// A Cloudflare API token with **Zone:DNS:Edit on honeymoney.app**, in
// `deploy/.cf-dns.token` (gitignored). Wrangler's OAuth token cannot do this:
// it carries `zone (read)`, which does not include DNS records — verified, the
// API returns 10000 Authentication error for even a read.
//
//   Cloudflare → My Profile → API Tokens → Create Token
//   → "Edit zone DNS" template
//   → Zone Resources: Include → Specific zone → honeymoney.app
//   → Create, copy, and save it to deploy/.cf-dns.token
//
// Scoped to one zone and one permission, so the worst it can do is edit DNS on
// this one domain. Delete the file afterwards — the script reminds you.
//
// ── THE GUARDRAIL THAT MATTERS ─────────────────────────────────────────────
//
// It refuses to touch `origin.honeymoney.app`. That is the hostname the tunnel
// publishes and the one deploy/pages/_worker.js proxies signed-in routes back to
// (ORIGIN_HOST). Repointing it at Pages would make the worker fetch itself, and
// every logged-in page would loop until it timed out. Only the apex and `www`
// are ever modified.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ZONE = "cf765cc7021c47d3e6de209fd3630660"; // honeymoney.app
const TARGET = "honeymoney-ci3.pages.dev";
const APPLY = process.argv.includes("--apply");

// Names this script is willing to change. Anything else is refused.
const ALLOWED = new Set(["honeymoney.app", "www.honeymoney.app"]);
// Never, under any circumstances.
const FORBIDDEN = new Set(["origin.honeymoney.app"]);

const tokenPath = join(HERE, ".cf-dns.token");
if (!existsSync(tokenPath)) {
  console.error(
    `\nNo token at ${tokenPath}\n\n` +
      "Create one: Cloudflare → My Profile → API Tokens → Create Token\n" +
      '  → "Edit zone DNS" template\n' +
      "  → Zone Resources: Include → Specific zone → honeymoney.app\n" +
      `  → save the value into ${tokenPath}\n`,
  );
  process.exit(2);
}
const TOKEN = readFileSync(tokenPath, "utf8").trim();
if (!TOKEN) {
  console.error(`${tokenPath} is empty.`);
  process.exit(2);
}

const api = async (path, init) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!body.success) {
    const msg = (body.errors ?? []).map((e) => `${e.code} ${e.message}`).join("; ");
    throw new Error(`${path} → ${msg || res.status}`);
  }
  return body.result;
};

console.log(`\nZone honeymoney.app · target ${TARGET}`);
console.log(APPLY ? "MODE: apply\n" : "MODE: dry run (nothing will be written)\n");

const records = await api(`/zones/${ZONE}/dns_records?per_page=100`);

console.log("current records:");
for (const r of records) {
  const mark = FORBIDDEN.has(r.name) ? "  [PROTECTED]" : ALLOWED.has(r.name) ? "  [will change]" : "";
  console.log(`  ${r.type.padEnd(6)} ${r.name.padEnd(28)} -> ${String(r.content).slice(0, 46)}${mark}`);
}

const targets = records.filter((r) => ALLOWED.has(r.name) && ["CNAME", "A", "AAAA"].includes(r.type));
if (!targets.length) {
  console.log("\nNothing to change — no apex or www record found.");
  process.exit(0);
}

console.log("\nplanned changes:");
for (const r of targets) {
  if (FORBIDDEN.has(r.name)) throw new Error(`refusing to touch ${r.name}`);
  const already = r.type === "CNAME" && r.content === TARGET;
  console.log(
    `  ${r.name}: ${r.type} ${r.content} -> CNAME ${TARGET} (proxied)${already ? "  [already correct]" : ""}`,
  );
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to make these changes.");
  console.log("Rollback afterwards, if needed:");
  console.log("  cloudflared tunnel route dns honeymoney honeymoney.app\n");
  process.exit(0);
}

for (const r of targets) {
  if (FORBIDDEN.has(r.name)) throw new Error(`refusing to touch ${r.name}`);
  if (r.type === "CNAME" && r.content === TARGET) {
    console.log(`  ${r.name}: already correct, skipped`);
    continue;
  }
  // PUT replaces the record in place, so the name keeps its identity and there
  // is never a moment where the apex has no record at all — a delete-then-create
  // would leave the domain resolving to nothing in between.
  await api(`/zones/${ZONE}/dns_records/${r.id}`, {
    method: "PUT",
    body: JSON.stringify({
      type: "CNAME",
      name: r.name,
      content: TARGET,
      proxied: true, // orange cloud: without it Pages never sees the request
      ttl: 1, // automatic; ignored while proxied
    }),
  });
  console.log(`  ${r.name}: now CNAME -> ${TARGET} (proxied)`);
}

console.log("\nDone. The Pages custom domains should leave 'pending' within a minute or two.");
console.log(`Delete ${tokenPath} now — it is no longer needed.`);
console.log("Rollback: cloudflared tunnel route dns honeymoney honeymoney.app\n");
