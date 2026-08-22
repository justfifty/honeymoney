// Can a receipt actually be stored, thumbnailed, and served — and refused?
//
//   npm run check:attachments                      # PocketBase only
//   npm run check:attachments -- http://127.0.0.1:3000   # also probe the proxy
//
// Task 4 of the 2026-08-22 brief asked for "viewable attachments" on the premise
// that receipt images existed and could not be opened. They did not exist:
// `transactions.receipt_ref` was a text field commented "pointer only; never the
// raw image", written by no code, and the capture flow dropped every photo after
// reading its numbers. So this checks the half that had to be built first —
// storage — as well as the viewer's supply.
//
// It round-trips a REAL image rather than asserting the schema, because the
// interesting failures all live past the schema: a thumb size the field does not
// declare returns the original at full weight and nothing looks wrong until a
// list of forty rows downloads forty full-resolution photos.
//
// Everything it creates, it deletes — including on failure.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv.slice(2).find((a) => a.startsWith("http")) || null;

function env() {
  const raw = readFileSync(join(WEB, ".env.local"), "utf8");
  return Object.fromEntries(
    raw
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

// A REAL image, not a synthetic fixture. The first version of this check used a
// hand-rolled 64x64 JPEG and reported "the thumb is not actually resizing" —
// which was true and meaningless: PocketBase returns the original when the
// source is already smaller than the requested thumb, so a tiny fixture can only
// ever produce that result. 512x512 is comfortably larger than both declared
// thumbs, so a thumb that comes back the same size is a genuine finding.
function fixture() {
  return readFileSync(join(WEB, "public", "icon-512.png"));
}

const fail = (msg) => {
  console.log("  FAIL  " + msg);
  failures++;
};
const pass = (msg) => console.log("  ok    " + msg);
let failures = 0;

const e = env();
if (!e.POCKETBASE_URL) {
  console.error("No POCKETBASE_URL in web/.env.local");
  process.exit(2);
}

const auth = await fetch(`${e.POCKETBASE_URL}/api/collections/_superusers/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: e.POCKETBASE_ADMIN_EMAIL, password: e.POCKETBASE_ADMIN_PASSWORD }),
});
if (!auth.ok) {
  console.error(`PocketBase auth failed (${auth.status}). Is it running? npm run pb:start`);
  process.exit(2);
}
const { token } = await auth.json();
const H = { Authorization: token };

console.log("\nschema");
const col = await (await fetch(`${e.POCKETBASE_URL}/api/collections/transactions`, { headers: H })).json();
const field = col.fields.find((f) => f.name === "attachments");
if (!field) {
  console.log("  FAIL  transactions has no `attachments` field — run the migration");
  process.exit(1);
}
pass(`attachments is a ${field.type} field, maxSelect ${field.maxSelect}`);

// The proxy only ever asks for these two. A thumb the field does not declare is
// silently served as the ORIGINAL — so a list would quietly download full-size
// photos and look fine while doing it.
for (const want of ["100x100", "400x0"]) {
  if ((field.thumbs ?? []).includes(want)) pass(`thumb ${want} is declared`);
  else fail(`thumb ${want} is NOT declared — /api/attachment asks for it and would get the original`);
}

if (col.listRule !== null || col.viewRule !== null) {
  fail(`transactions is browser-readable (listRule=${col.listRule}, viewRule=${col.viewRule}) — receipts must stay superuser-only`);
} else {
  pass("transactions stays superuser-only, so receipt files have no public URL");
}

console.log("\nround-trip");
const tenant = (await (await fetch(`${e.POCKETBASE_URL}/api/collections/tenants/records?perPage=1`, { headers: H })).json()).items?.[0];
if (!tenant) {
  console.log("  FAIL  no tenant to test against");
  process.exit(1);
}

let txId = null;
try {
  const created = await fetch(`${e.POCKETBASE_URL}/api/collections/transactions/records`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({
      tenant: tenant.id,
      amount: 0.01,
      currency: "MYR",
      occurred_at: "1990-01-01 00:00:00.000Z",
      source: "check:attachments",
      voided: true, // never counted, even if cleanup somehow fails
    }),
  });
  if (!created.ok) throw new Error(`create failed ${created.status}: ${(await created.text()).slice(0, 200)}`);
  txId = (await created.json()).id;

  const form = new FormData();
  form.append("+attachments", new Blob([fixture()], { type: "image/png" }), "check.png");
  const up = await fetch(`${e.POCKETBASE_URL}/api/collections/transactions/records/${txId}`, {
    method: "PATCH",
    headers: H,
    body: form,
  });
  if (!up.ok) throw new Error(`upload failed ${up.status}: ${(await up.text()).slice(0, 200)}`);
  const rec = await up.json();
  const stored = Array.isArray(rec.attachments) ? rec.attachments[0] : rec.attachments;
  if (!stored) throw new Error("upload returned no filename");
  pass(`uploaded and stored as ${stored}`);

  const orig = await fetch(`${e.POCKETBASE_URL}/api/files/transactions/${txId}/${stored}`, { headers: H });
  const origBytes = Buffer.from(await orig.arrayBuffer());
  if (!orig.ok || origBytes.length === 0) fail("the stored original could not be read back");
  else pass(`original reads back, ${origBytes.length} bytes`);

  const th = await fetch(`${e.POCKETBASE_URL}/api/files/transactions/${txId}/${stored}?thumb=100x100`, { headers: H });
  const thBytes = Buffer.from(await th.arrayBuffer());
  if (!th.ok || thBytes.length === 0) {
    fail("thumb 100x100 was not generated");
  } else if (thBytes.length >= origBytes.length) {
    fail(`thumb is ${thBytes.length} bytes vs original ${origBytes.length} — it is not actually resizing`);
  } else {
    pass(`thumb 100x100 generated, ${thBytes.length} bytes (${Math.round((thBytes.length / origBytes.length) * 100)}% of original)`);
  }

  // The access rule with teeth: without a session, the proxy must not serve it.
  if (BASE) {
    const r = await fetch(`${BASE}/api/attachment/${txId}/${stored}`, { redirect: "manual" });
    if (r.status === 200) fail(`/api/attachment served a receipt to a signed-out caller (200)`);
    else pass(`/api/attachment refuses a signed-out caller (${r.status})`);
  } else {
    console.log("  --    proxy not probed (pass a base URL to include it)");
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  if (txId) {
    const del = await fetch(`${e.POCKETBASE_URL}/api/collections/transactions/records/${txId}`, {
      method: "DELETE",
      headers: H,
    });
    console.log(del.ok ? "\ncleanup: test record removed" : `\ncleanup: FAILED to remove ${txId} — delete it by hand`);
    if (!del.ok) failures++;
  }
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nReceipts store, thumbnail and serve; and they are refused without a session.");
process.exit(failures ? 1 : 0);
