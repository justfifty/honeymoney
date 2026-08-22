// Put HoneyMoney's backups in Cloudflare R2 — everything after the one click
// that cannot be automated.
//
//   node deploy/setup-r2-backups.mjs            # check what's ready, change nothing
//   node deploy/setup-r2-backups.mjs --apply    # create the bucket, configure PocketBase
//
// ── WHAT YOU HAVE TO DO BY HAND, AND WHY ───────────────────────────────────
//
// TWO things, both one-time, both genuinely impossible from here:
//
//   1. **Enable R2** on the account. Verified 2026-08-23 against the API
//      directly, not just through wrangler: both GET and POST on
//      /accounts/{id}/r2/buckets return `10042 Please enable R2 through the
//      Cloudflare Dashboard`. It is where the R2 terms and the payment method
//      are accepted, so Cloudflare gates it deliberately. Free tier is 10 GB
//      with no egress fees; a HoneyMoney backup is 2.1 MB, so 14 of them use
//      0.3% of it.
//
//   2. **Create an R2 API token** (R2 → Manage API tokens → Object Read & Write,
//      scoped to the bucket). Save it as deploy/.r2-credentials.json:
//
//        { "accessKeyId": "...", "secretAccessKey": "..." }
//
//      That file is gitignored. PocketBase needs these to upload; nothing else
//      reads them.
//
// This script then does the rest: creates the bucket, writes PocketBase's S3
// settings through its own API, and takes a real backup to prove the pipe works.
//
// ── THE ORDERING TRAP ──────────────────────────────────────────────────────
//
// PocketBase stores those S3 credentials in its SETTINGS, settings live in
// data.db, and data.db is the file being uploaded. Without settings encryption,
// every backup in the bucket would contain the keys to that same bucket. This
// script refuses to configure S3 unless encryption is on — see
// start-honeymoney.ps1 and deploy/.pb-encryption-key.

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const ACCOUNT = "ecb25f751b4e93b49afe473aac4910c6";
const BUCKET = "honeymoney-backups";
const APPLY = process.argv.includes("--apply");

let problems = 0;
const ok = (m) => console.log("  ok    " + m);
const bad = (m) => {
  problems++;
  console.log("  --    " + m);
};

// ── credentials ────────────────────────────────────────────────────────────

function env(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

const web = env(join(ROOT, "web", ".env.local"));

const TOKEN_FILE = join(
  process.env.APPDATA ?? "",
  "xdg.config",
  ".wrangler",
  "config",
  "default.toml",
);

function cfToken() {
  if (!existsSync(TOKEN_FILE)) return "";
  const m = readFileSync(TOKEN_FILE, "utf8").match(/oauth_token\s*=\s*"([^"]+)"/);
  return m ? m[1] : "";
}

/**
 * Wrangler's OAuth token expires roughly hourly and refreshes LAZILY — only when
 * wrangler itself runs. Reading the file directly therefore hands back a stale
 * token whenever nothing has used wrangler recently, and the API answers
 * `10000 Authentication error`, which reads like a permissions problem and is
 * not one. Seen exactly that here: the same check passed, then failed nine
 * minutes later with the token six minutes expired.
 *
 * So make wrangler do something harmless, which forces a refresh, then re-read.
 */
function refreshCfToken() {
  try {
    execSync("npx wrangler whoami", {
      cwd: join(ROOT, "deploy", "pages"),
      stdio: "ignore",
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT },
    });
  } catch {
    /* even a failure usually refreshes the token on the way past */
  }
  return cfToken();
}

console.log("\nHoneyMoney → Cloudflare R2 backups");
console.log(APPLY ? "MODE: apply\n" : "MODE: check only, nothing will be changed\n");

// ── 1. encryption must already be on ───────────────────────────────────────

console.log("prerequisites");
const keyFile = join(HERE, ".pb-encryption-key");
const hasKey = existsSync(keyFile) && readFileSync(keyFile, "utf8").trim().length === 32;
if (hasKey) ok("PocketBase settings encryption is configured");
else
  bad(
    "no valid deploy/.pb-encryption-key — configure it FIRST, or the R2 secret\n" +
      "        lands in plaintext in data.db, which is the file uploaded to R2",
  );

// ── 2. is R2 enabled? ──────────────────────────────────────────────────────

const TOKEN = cfToken();
if (!TOKEN) bad("no Cloudflare token found — run: npx wrangler login");

let r2Ready = false;
let TOKEN_LIVE = TOKEN;
if (TOKEN) {
  const listBuckets = async (tok) => {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    return res.json().catch(() => ({}));
  };

  let body = await listBuckets(TOKEN);
  // A 10000 here is far more often an expired token than a missing permission,
  // so refresh once and retry before believing it.
  if (!body.success && body.errors?.[0]?.code === 10000) {
    TOKEN_LIVE = refreshCfToken();
    if (TOKEN_LIVE && TOKEN_LIVE !== TOKEN) body = await listBuckets(TOKEN_LIVE);
  }
  if (body.success) {
    r2Ready = true;
    const names = (body.result?.buckets ?? []).map((b) => b.name);
    ok(`R2 is enabled (${names.length} bucket${names.length === 1 ? "" : "s"}${names.length ? ": " + names.join(", ") : ""})`);
  } else {
    const code = body.errors?.[0]?.code;
    if (code === 10042) {
      bad(
        "R2 is NOT enabled on this account.\n" +
          "        Cloudflare → R2 → enable it (this is where the payment method is asked for;\n" +
          "        the free tier is 10 GB and a backup is 2.1 MB). Nothing else here can proceed.",
      );
    } else {
      bad(`R2 check failed: ${JSON.stringify(body.errors)?.slice(0, 160)}`);
    }
  }
}

// ── 3. the R2 API token PocketBase will use ────────────────────────────────

const credFile = join(HERE, ".r2-credentials.json");
let creds = null;
if (existsSync(credFile)) {
  try {
    creds = JSON.parse(readFileSync(credFile, "utf8"));
    if (creds.accessKeyId && creds.secretAccessKey) ok("R2 API credentials present");
    else {
      creds = null;
      bad("deploy/.r2-credentials.json is missing accessKeyId or secretAccessKey");
    }
  } catch {
    bad("deploy/.r2-credentials.json is not valid JSON");
  }
} else {
  bad(
    "no deploy/.r2-credentials.json\n" +
      "        R2 → Manage API tokens → Object Read & Write, scoped to the bucket, then:\n" +
      '        { "accessKeyId": "...", "secretAccessKey": "..." }',
  );
}

// ── 4. PocketBase must be reachable ────────────────────────────────────────

const PB = web.POCKETBASE_URL;
let pbToken = "";
if (!PB) bad("POCKETBASE_URL not set in web/.env.local");
else {
  try {
    const auth = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identity: web.POCKETBASE_ADMIN_EMAIL,
        password: web.POCKETBASE_ADMIN_PASSWORD,
      }),
    });
    if (auth.ok) {
      pbToken = (await auth.json()).token;
      ok("PocketBase reachable and admin auth works");
    } else bad(`PocketBase auth failed (${auth.status})`);
  } catch {
    bad("PocketBase is not answering — is the stack running?");
  }
}

if (problems) {
  console.log(`\n${problems} thing(s) not ready. Nothing was changed.`);
  console.log("Fix the ones marked above, then re-run with --apply.\n");
  process.exit(1);
}

if (!APPLY) {
  console.log("\nEverything is ready. Re-run with --apply to:");
  console.log(`  1. create the R2 bucket "${BUCKET}"`);
  console.log("  2. write PocketBase's S3 backup settings");
  console.log("  3. take a real backup and confirm it lands in R2\n");
  process.exit(0);
}

// ── apply ──────────────────────────────────────────────────────────────────

console.log("\napplying");

// 1. bucket
const mk = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN_LIVE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ name: BUCKET, locationHint: "apac" }),
});
const mkBody = await mk.json().catch(() => ({}));
if (mkBody.success) ok(`bucket ${BUCKET} created`);
else if (JSON.stringify(mkBody.errors ?? "").includes("already exists")) ok(`bucket ${BUCKET} already exists`);
else {
  console.log(`  FAIL  could not create bucket: ${JSON.stringify(mkBody.errors)?.slice(0, 200)}`);
  process.exit(1);
}

// 2. PocketBase settings. `forcePathStyle` is required for R2 — without it the
// SDK builds virtual-host URLs (bucket.account.r2.cloudflarestorage.com) that
// R2 does not serve, and every upload fails with a DNS error rather than
// anything that names the real problem.
const settings = {
  backups: {
    cron: "0 3 * * *",
    cronMaxKeep: 14,
    s3: {
      enabled: true,
      bucket: BUCKET,
      region: "auto",
      endpoint: `https://${ACCOUNT}.r2.cloudflarestorage.com`,
      accessKey: creds.accessKeyId,
      secret: creds.secretAccessKey,
      forcePathStyle: true,
    },
  },
};

const set = await fetch(`${PB}/api/settings`, {
  method: "PATCH",
  headers: { Authorization: pbToken, "Content-Type": "application/json" },
  body: JSON.stringify(settings),
});
if (set.ok) ok("PocketBase configured: nightly 03:00, keep 14, uploading to R2");
else {
  console.log(`  FAIL  settings rejected (${set.status}): ${(await set.text()).slice(0, 200)}`);
  process.exit(1);
}

// 3. prove the pipe. A configured backup target that has never actually been
// written to is a guess, and this is the one moment it costs nothing to check.
const name = `setup-check-${Date.now()}.zip`;
const bk = await fetch(`${PB}/api/backups`, {
  method: "POST",
  headers: { Authorization: pbToken, "Content-Type": "application/json" },
  body: JSON.stringify({ name }),
});
if (bk.ok) {
  ok(`test backup ${name} created`);
  const list = await fetch(`${PB}/api/backups`, { headers: { Authorization: pbToken } });
  const items = list.ok ? await list.json() : [];
  const found = (Array.isArray(items) ? items : []).some((b) => b.key === name);
  if (found) ok("PocketBase lists it from the R2 bucket — the pipe works end to end");
  else console.log("  --    created, but not listed back. Check the R2 credentials' permissions.");
} else {
  console.log(`  FAIL  backup failed (${bk.status}): ${(await bk.text()).slice(0, 200)}`);
  console.log("        Usually wrong credentials, or the token is not scoped to this bucket.");
  process.exit(1);
}

console.log("\nDone. Backups now go to R2 nightly at 03:00, keeping 14.");
console.log("LAST STEP, and it is the one that matters:");
console.log("  download a zip from the R2 bucket and run");
console.log("    .\\deploy\\test-restore.ps1 -Zip <that file>");
console.log("  Restoring a local file only ever proved the local file.\n");
