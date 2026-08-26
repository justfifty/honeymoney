// HoneyMoney — encrypt every backup before it leaves the country.
//
//   node deploy/backup-vault.mjs verify        # round-trip self-test, touches nothing
//   node deploy/backup-vault.mjs push          # encrypt newest local backup → R2
//   node deploy/backup-vault.mjs list          # what is in the bucket
//   node deploy/backup-vault.mjs restore <name> [--out DIR]
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
//
// The nightly R2 backup is the ONLY continuous export of household records:
// docs/DATA_PROCESSORS.md §2 now says so, and everything else in the register
// is either transit or carries no personal data. PocketBase's own S3 integration
// uploads that archive in the clear, so a complete copy of every household's
// transactions, members, consents and ledger sits in a bucket with — checked
// 2026-08-26 against the Cloudflare API — `jurisdiction: null` and no location
// Cloudflare will state. A `locationHint` is a hint; it guarantees nothing.
//
// Encrypting before upload changes what the transfer IS. Cloudflare holds
// ciphertext, cannot read it, and the cross-border question stops being "is the
// receiving jurisdiction adequate" and becomes "is AES-256-GCM adequate".
//
// ── THE TRAP THIS MUST NOT BECOME ──────────────────────────────────────────
//
// An encrypted backup you cannot decrypt is not a backup — it is a very tidy
// way to lose everything. Two rules follow, and both are enforced below rather
// than written down and hoped for:
//
//   1. `verify` does a real round trip through the real cipher before anything
//      is uploaded, and `push` runs it first. A backup is never shipped on the
//      assumption that decryption would have worked.
//   2. The key lives OUTSIDE the bucket, and this script refuses to run if the
//      key file sits anywhere inside a directory that gets backed up. A key
//      stored beside the ciphertext is decoration.
//
// The key is 32 random bytes in deploy/.pb-backup-key, gitignored. COPY IT
// SOMEWHERE OFF THIS MACHINE — a password manager, a printed sheet in a drawer.
// If the laptop dies and the key died with it, the R2 copies are noise.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, chmodSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const ACCOUNT = "ecb25f751b4e93b49afe473aac4910c6";
const BUCKET = "honeymoney-backups";
const BACKUP_DIR = join(ROOT, "pocketbase", "pb_data", "backups");
const KEY_FILE = join(HERE, ".pb-backup-key");
const CREDS_FILE = join(HERE, ".r2-credentials.json");
const KEEP_REMOTE = 30;

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits, the size GCM is specified for
const TAG_BYTES = 16;
const MAGIC = Buffer.from("HMBK1\0\0\0"); // 8 bytes, so the header is aligned and greppable

const say = (m) => console.log("  " + m);
const die = (m) => {
  console.error("\n  ✗ " + m + "\n");
  process.exit(1);
};

// ── the key ─────────────────────────────────────────────────────────────────

function loadKey({ create = false } = {}) {
  // A key inside pb_data would be swept into the very archive it protects.
  // Checked rather than assumed, because the mistake is invisible once made.
  if (resolve(KEY_FILE).startsWith(resolve(join(ROOT, "pocketbase", "pb_data")))) {
    die("the key file is inside pb_data — it would be backed up with the data it protects.");
  }
  if (!existsSync(KEY_FILE)) {
    if (!create) die(`no key at ${KEY_FILE}. Run:  node deploy/backup-vault.mjs verify`);
    const k = randomBytes(32);
    writeFileSync(KEY_FILE, k.toString("base64") + "\n", { mode: 0o600 });
    try { chmodSync(KEY_FILE, 0o600); } catch { /* Windows ACLs differ; the file is gitignored */ }
    console.log("\n  ┌─────────────────────────────────────────────────────────────┐");
    console.log("  │  A NEW BACKUP KEY WAS GENERATED.                            │");
    console.log("  │                                                             │");
    console.log("  │  deploy/.pb-backup-key                                      │");
    console.log("  │                                                             │");
    console.log("  │  Copy it somewhere off this machine NOW — password manager, │");
    console.log("  │  or printed and filed. Every backup in R2 from this moment   │");
    console.log("  │  is unreadable without it, including by us.                 │");
    console.log("  └─────────────────────────────────────────────────────────────┘\n");
    return k;
  }
  const k = Buffer.from(readFileSync(KEY_FILE, "utf8").trim(), "base64");
  if (k.length !== 32) die("the key file is not 32 bytes of base64. Refusing to guess.");
  return k;
}

// ── the cipher ──────────────────────────────────────────────────────────────
//
// Layout:  MAGIC(8) | IV(12) | TAG(16) | ciphertext
//
// GCM and not CBC because it authenticates: a truncated upload or a flipped bit
// fails to open rather than decrypting to plausible garbage that then gets
// restored over a working database.

function seal(plain, key) {
  const iv = randomBytes(IV_BYTES);
  const c = createCipheriv(ALGO, key, iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}

function open(blob, key) {
  if (blob.length < MAGIC.length + IV_BYTES + TAG_BYTES) die("file is too short to be a HoneyMoney backup.");
  if (!timingSafeEqual(blob.subarray(0, MAGIC.length), MAGIC)) {
    die("not a HoneyMoney encrypted backup (bad magic). Is this a plain .zip?");
  }
  const iv = blob.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = blob.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES);
  const body = blob.subarray(MAGIC.length + IV_BYTES + TAG_BYTES);
  const d = createDecipheriv(ALGO, key, iv);
  d.setAuthTag(tag);
  try {
    return Buffer.concat([d.update(body), d.final()]);
  } catch {
    die("decryption failed — wrong key, or the file was altered in transit.");
  }
}

// ── R2, over the S3 API with SigV4 ─────────────────────────────────────────
//
// Signed with the long-lived R2 API token in .r2-credentials.json rather than
// wrangler's OAuth token, which expires roughly hourly and refreshes lazily —
// a scheduled 3am backup is exactly the caller that finds it stale.

const HOST = `${ACCOUNT}.r2.cloudflarestorage.com`;
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const hmac = (k, s) => createHmac("sha256", k).update(s).digest();

function creds() {
  if (!existsSync(CREDS_FILE)) die(`no R2 credentials at ${CREDS_FILE}`);
  const c = JSON.parse(readFileSync(CREDS_FILE, "utf8"));
  if (!c.accessKeyId || !c.secretAccessKey) die("credentials file is missing accessKeyId/secretAccessKey");
  return c;
}

async function s3(method, key, body = Buffer.alloc(0), query = "") {
  const { accessKeyId, secretAccessKey } = creds();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const path = `/${BUCKET}${key ? "/" + key.split("/").map(encodeURIComponent).join("/") : ""}`;

  const canonicalHeaders =
    `host:${HOST}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const scope = `${date}/auto/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(Buffer.from(canonicalRequest))].join("\n");
  const signing = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), "auto"), "s3"), "aws4_request");
  const signature = createHmac("sha256", signing).update(toSign).digest("hex");

  const res = await fetch(`https://${HOST}${path}${query ? "?" + query : ""}`, {
    method,
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...(method === "PUT" ? { "Content-Length": String(body.length) } : {}),
    },
    ...(method === "PUT" ? { body } : {}),
  });
  if (!res.ok) die(`R2 ${method} ${key || "(bucket)"} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

async function listRemote() {
  const res = await s3("GET", "", Buffer.alloc(0), "list-type=2");
  const xml = await res.text();
  // Parsed field by field out of each <Contents> block rather than as one
  // ordered pattern. R2 emits Key, Size, LastModified; the AWS docs example
  // shows Key, LastModified, ETag, Size. A regex that assumes an order matched
  // nothing here and reported an EMPTY BUCKET that in fact held four plaintext
  // database backups — a false all-clear, which is the worst thing a check can
  // return.
  const field = (block, tag) => (block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) ?? [])[1] ?? "";
  return [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)]
    .map((m) => ({
      key: field(m[1], "Key"),
      modified: field(m[1], "LastModified"),
      size: Number(field(m[1], "Size") || 0),
    }))
    .filter((o) => o.key)
    .sort((a, b) => b.key.localeCompare(a.key));
}

// ── commands ────────────────────────────────────────────────────────────────

// ── where the backups actually are ─────────────────────────────────────────
//
// NOT the local pocketbase/pb_data/backups directory. That was this script's
// first assumption and it was wrong in the most dangerous possible way: the
// local folder holds a stale instance's archives from 23 August, so an upload
// from there would have shipped four-day-old data under today's date and looked
// entirely successful.
//
// Production is wherever POCKETBASE_URL points — currently a DOM Cloud instance,
// not this laptop — so the backup is fetched through PocketBase's own API. That
// works for a local instance and a hosted one without knowing which it is.

function pbEnv() {
  const f = join(ROOT, "web", ".env.local");
  if (!existsSync(f)) die("no web/.env.local — cannot find PocketBase.");
  const e = Object.fromEntries(
    readFileSync(f, "utf8")
      .split(String.fromCharCode(10))
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
  );
  if (!e.POCKETBASE_ADMIN_EMAIL || !e.POCKETBASE_ADMIN_PASSWORD) die("PocketBase admin credentials are not set.");
  return { url: (e.POCKETBASE_URL || "http://127.0.0.1:8090").replace(/\/$/, ""), email: e.POCKETBASE_ADMIN_EMAIL, password: e.POCKETBASE_ADMIN_PASSWORD };
}

async function pbAuth({ url, email, password }) {
  const r = await fetch(`${url}/api/collections/_superusers/auth-with-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password }),
  });
  if (!r.ok) die(`PocketBase auth failed at ${url}: ${r.status}`);
  return (await r.json()).token;
}

/** Take a fresh backup on the live instance and return { name, bytes }. */
async function freshBackup() {
  const env = pbEnv();
  say(`source: ${env.url}`);
  const token = await pbAuth(env);
  // Digits only. The first version sliced an ISO string and kept the "." that
  // separates the milliseconds, which PocketBase rejects as
  // validation_match_invalid — a 400 that reads like a permissions problem.
  const name = `vault_${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}.zip`;
  const mk = await fetch(`${env.url}/api/backups`, {
    method: "POST", headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!mk.ok) die(`PocketBase refused to create a backup: ${mk.status} ${(await mk.text()).slice(0, 200)}`);
  const dl = await fetch(`${env.url}/api/backups/${encodeURIComponent(name)}?token=${encodeURIComponent(await fileToken(env.url, token))}`);
  if (!dl.ok) die(`could not download ${name}: ${dl.status}`);
  const bytes = Buffer.from(await dl.arrayBuffer());
  if (bytes.length < 1024) die(`${name} came back as ${bytes.length} bytes — refusing to ship it.`);
  return { name, bytes, url: env.url, token };
}

async function fileToken(url, token) {
  const r = await fetch(`${url}/api/files/token`, { method: "POST", headers: { Authorization: token } });
  if (!r.ok) die(`could not get a file token: ${r.status}`);
  return (await r.json()).token;
}

/** A real round trip through the real cipher. Never skipped before an upload. */
function verify(key) {
  const sample = randomBytes(64 * 1024);
  const back = open(seal(sample, key), key);
  if (!back.equals(sample)) die("round trip did not reproduce the input. Refusing to upload anything.");
  say("✓ round trip: 64 KB sealed and opened byte-identical");

  // A wrong key must FAIL, not silently return garbage. If this ever passes,
  // the authentication tag is not being checked and the format is worthless.
  const wrong = randomBytes(32);
  const blob = seal(sample, key);
  let refused = false;
  try {
    const d = createDecipheriv(ALGO, wrong, blob.subarray(8, 20));
    d.setAuthTag(blob.subarray(20, 36));
    Buffer.concat([d.update(blob.subarray(36)), d.final()]);
  } catch {
    refused = true;
  }
  if (!refused) die("a WRONG key decrypted the payload. The tag is not being verified.");
  say("✓ a wrong key is refused rather than returning garbage");
}

const cmd = process.argv[2] ?? "verify";
const outFlag = process.argv.indexOf("--out");
const outDir = outFlag > -1 ? process.argv[outFlag + 1] : join(ROOT, "restored");

console.log(`\nHoneyMoney backup vault — ${cmd}\n`);

if (cmd === "verify") {
  verify(loadKey({ create: true }));
  say("");
  say("Nothing was uploaded. Run `push` to ship the newest backup encrypted.");
} else if (cmd === "push") {
  const key = loadKey({ create: true });
  verify(key);
  const src = await freshBackup();
  const plain = src.bytes;
  const blob = seal(plain, key);
  const name = src.name + ".enc";
  say(`✓ ${src.name} — ${(plain.length / 1e6).toFixed(2)} MB → ${(blob.length / 1e6).toFixed(2)} MB sealed`);
  await s3("PUT", name, blob);
  say(`✓ uploaded ${name}`);

  const remote = await listRemote();
  const stale = remote.filter((o) => o.key.endsWith(".enc")).slice(KEEP_REMOTE);
  for (const o of stale) {
    await s3("DELETE", o.key);
    say(`  pruned ${o.key}`);
  }
  say(`✓ ${Math.min(remote.length, KEEP_REMOTE)} encrypted backup(s) retained in R2`);
} else if (cmd === "list") {
  const remote = await listRemote();
  if (!remote.length) say("(bucket is empty)");
  for (const o of remote) {
    const clear = o.key.endsWith(".enc") ? "sealed" : "PLAINTEXT";
    say(`${clear.padEnd(10)} ${(o.size / 1e6).toFixed(2).padStart(8)} MB  ${o.modified}  ${o.key}`);
  }
  const bare = remote.filter((o) => !o.key.endsWith(".enc"));
  if (bare.length) {
    say("");
    say(`⚠ ${bare.length} unencrypted archive(s) predate this script. They are readable by`);
    say("  anyone with bucket access. Delete them once a sealed backup is confirmed good:");
    say("    node deploy/backup-vault.mjs purge-plaintext");
  }
} else if (cmd === "seal-existing") {
  // Seal the archives that were uploaded in the clear before this script
  // existed, rather than deleting them. Losing four days of backup history to
  // fix a privacy problem trades one incident for another; download → seal →
  // upload → CONFIRM → delete keeps both properties.
  const key = loadKey();
  verify(key);
  const bare = (await listRemote()).filter((o) => !o.key.endsWith(".enc"));
  if (!bare.length) { say("nothing in the clear — already done."); }
  for (const o of bare) {
    const plain = Buffer.from(await (await s3("GET", o.key)).arrayBuffer());
    const blob = seal(plain, key);
    // Opened again before the plaintext is deleted. Sealing something and
    // deleting the only readable copy on the assumption it will open is how a
    // privacy fix becomes a data-loss incident.
    if (!open(blob, key).equals(plain)) die(`round trip failed for ${o.key} — nothing deleted.`);
    await s3("PUT", o.key + ".enc", blob);
    await s3("DELETE", o.key);
    say(`✓ ${o.key} → ${o.key}.enc  (${(plain.length / 1e6).toFixed(2)} MB, verified, plaintext removed)`);
  }
  const after = await listRemote();
  say("");
  say(`✓ bucket now holds ${after.filter((o) => o.key.endsWith(".enc")).length} sealed and ${after.filter((o) => !o.key.endsWith(".enc")).length} plaintext object(s)`);
} else if (cmd === "purge-plaintext") {
  const remote = await listRemote();
  const sealed = remote.filter((o) => o.key.endsWith(".enc"));
  const bare = remote.filter((o) => !o.key.endsWith(".enc"));
  if (!sealed.length) die("there is no sealed backup in the bucket yet. Run `push` first — this refuses to leave you with nothing.");
  for (const o of bare) {
    await s3("DELETE", o.key);
    say(`deleted ${o.key}`);
  }
  say(`✓ ${bare.length} plaintext archive(s) removed; ${sealed.length} sealed backup(s) remain`);
} else if (cmd === "restore") {
  const name = process.argv[3];
  if (!name) die("usage: node deploy/backup-vault.mjs restore <name.zip.enc> [--out DIR]");
  const key = loadKey();
  const res = await s3("GET", name);
  const blob = Buffer.from(await res.arrayBuffer());
  const plain = open(blob, key);
  mkdirSync(outDir, { recursive: true });
  const dest = join(outDir, name.replace(/\.enc$/, ""));
  writeFileSync(dest, plain);
  say(`✓ ${dest} — ${(plain.length / 1e6).toFixed(2)} MB, tag verified`);
  say("");
  say("This is a PocketBase backup zip. Restore it from the admin UI");
  say("(Settings → Backups → Upload) rather than by unzipping over pb_data.");
} else {
  die(`unknown command "${cmd}". Try: verify | push | list | restore | purge-plaintext`);
}

console.log("");
