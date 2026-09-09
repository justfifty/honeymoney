// Does the forgotten-password flow behave — against a PocketBase that is
// stood in for, so this runs anywhere, in about a minute?
//
//   npm run check:reset
//
// What is worth proving here is not that the pages render (though they must)
// but the two properties a reset flow is judged on, neither of which survives
// a well-meaning edit by accident:
//
//   1. A known address and an unknown address get the SAME answer, byte for
//      byte, from /api/auth/forgot. The moment they differ, the login page is
//      a directory of who uses the product.
//   2. The endpoint that sends email is rate-limited, per address and per
//      caller, because an open one is a way to make HoneyMoney spam somebody.
//
// Plus the token path: PocketBase's own password-rule message is passed
// through rather than replaced by a wrong one about the link, a bad token gets
// the link message, and a too-short password is refused before PocketBase is
// asked at all.
//
// The stand-in PocketBase answers the two endpoints the flow uses, the way
// PocketBase does: 204 for any address on request-password-reset (it never
// says whether the address exists either), and 204 / 400 on confirm depending
// on the token. Nothing else about PocketBase is imitated, because nothing
// else is used.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PB_PORT = 8097;
const APP_PORT = 3127;
const BASE = `http://127.0.0.1:${APP_PORT}`;

// ── the stand-in PocketBase ─────────────────────────────────────────────────
const pbCalls = [];
const pb = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const json = body ? JSON.parse(body) : {};
  pbCalls.push({ path: req.url, json });
  if (req.url === "/api/collections/app_users/request-password-reset") {
    res.writeHead(204);
    return res.end();
  }
  if (req.url === "/api/collections/app_users/confirm-password-reset") {
    if (json.token === "good-token") {
      res.writeHead(204);
      return res.end();
    }
    if (json.token === "weak-token") {
      res.writeHead(400, { "content-type": "application/json" });
      return res.end(JSON.stringify({ code: 400, message: "Failed to validate.", data: { password: { code: "validation_length_out_of_range", message: "Must be at least 8 character(s)." } } }));
    }
    res.writeHead(400, { "content-type": "application/json" });
    return res.end(JSON.stringify({ code: 400, message: "Failed to authenticate.", data: {} }));
  }
  // Everything else the app might ask a PocketBase for during a render.
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ items: [], totalItems: 0, page: 1, perPage: 1, totalPages: 0 }));
});
await new Promise((r) => pb.listen(PB_PORT, "127.0.0.1", r));
try {
  await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2000) });
  console.error(`something is already answering on ${BASE} — kill it first, or this check would be testing it instead.`);
  process.exit(2);
} catch {
  /* nothing there: good */
}

// ── the app, pointed at it ──────────────────────────────────────────────────
// Spawn the `next` binary directly, not through npx: a wrapper is what gets
// killed at the end, and the server it started lived on to hold the port for
// the next run (2026-09-09, found the slow way).
const app = spawn(process.execPath, [path.join(WEB, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(APP_PORT)], {
  cwd: WEB,
  env: {
    ...process.env,
    POCKETBASE_URL: `http://127.0.0.1:${PB_PORT}`,
    POCKETBASE_ADMIN_EMAIL: "check@example.invalid",
    POCKETBASE_ADMIN_PASSWORD: "check-only",
    NO_PROXY: "*",
    no_proxy: "*",
  },
  stdio: ["ignore", "pipe", "pipe"],
  // Its own process group: `next dev` forks the real server as a child, and
  // killing only the parent left that child holding the port.
  detached: true,
});
let appLog = "";
app.stdout.on("data", (d) => (appLog += d));
app.stderr.on("data", (d) => (appLog += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Every fetch is bounded: a wedged server must fail the check, not hang it.
const timed = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
async function up() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await timed(`${BASE}/api/health`);
      if (r.status) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error("app never came up:\n" + appLog.slice(-2000));
}

const results = [];
let failures = 0;
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures++;
}
async function post(route, body, headers = {}) {
  const r = await timed(BASE + route, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, text, retryAfter: r.headers.get("retry-after") };
}

try {
  await up();

  // 1. The pages exist and carry their forms; the login page links to the flow.
  for (const [route, needle, name] of [
    ["/login", "Forgot password?", "login page links to the reset flow"],
    ["/forgot-password", 'type="email"', "/forgot-password renders its email form"],
    ["/reset-password?token=abc", "Choose a new password", "/reset-password with a token renders the new-password form, server-side"],
    ["/reset-password", "Request a new link", "/reset-password without a token explains, and links onward"],
  ]) {
    const r = await timed(BASE + route);
    const html = await r.text();
    check(name, r.status === 200 && html.includes(needle), `status=${r.status} contains=${html.includes(needle)}`);
  }

  // 2. Known and unknown addresses: the same answer, byte for byte.
  const known = await post("/api/auth/forgot", { email: "someone@example.com" }, { "cf-connecting-ip": "10.0.0.1" });
  const unknown = await post("/api/auth/forgot", { email: "nobody@example.com" }, { "cf-connecting-ip": "10.0.0.2" });
  check(
    "forgot: known and unknown address answered identically",
    known.status === 200 && unknown.status === 200 && known.text === unknown.text && known.text.includes('"ok":true'),
    `known=${known.status} ${known.text} | unknown=${unknown.status} ${unknown.text}`,
  );
  check(
    "forgot: PocketBase was asked, with the normalised address",
    pbCalls.some((c) => c.path.endsWith("request-password-reset") && c.json.email === "someone@example.com"),
    JSON.stringify(pbCalls.slice(-2)),
  );

  // 3. Rate limit: the sixth request for one address inside the window is refused.
  let last;
  for (let i = 0; i < 5; i++) last = await post("/api/auth/forgot", { email: "flood@example.com" }, { "cf-connecting-ip": `10.1.0.${i}` });
  const sixth = await post("/api/auth/forgot", { email: "flood@example.com" }, { "cf-connecting-ip": "10.1.0.99" });
  check(
    "forgot: sixth request for the same address in 15 minutes is refused with Retry-After",
    last.status === 200 && sixth.status === 429 && Number(sixth.retryAfter) > 0,
    `fifth=${last.status} sixth=${sixth.status} retryAfter=${sixth.retryAfter}`,
  );
  const byIp = [];
  for (let i = 0; i < 6; i++) byIp.push((await post("/api/auth/forgot", { email: `many${i}@example.com` }, { "cf-connecting-ip": "10.2.0.1" })).status);
  check("forgot: sixth request from one caller across many addresses is refused", byIp.slice(0, 5).every((s) => s === 200) && byIp[5] === 429, byIp.join(","));

  // 4. Malformed input never reaches PocketBase.
  const before = pbCalls.length;
  const bad = await post("/api/auth/forgot", { email: "not-an-email" });
  check("forgot: an address without @ is refused before PocketBase is asked", bad.status === 400 && pbCalls.length === before, `status=${bad.status}`);

  // 5. The token path.
  const ok = await post("/api/auth/reset", { token: "good-token", password: "correct horse battery" });
  check("reset: a valid token sets the password", ok.status === 200 && ok.text.includes('"ok":true'), `${ok.status} ${ok.text}`);
  const sent = pbCalls.find((c) => c.path.endsWith("confirm-password-reset") && c.json.token === "good-token");
  check("reset: PocketBase received token, password and passwordConfirm", Boolean(sent) && sent.json.password === sent.json.passwordConfirm, JSON.stringify(sent?.json));

  const badToken = await post("/api/auth/reset", { token: "expired-token", password: "correct horse battery" });
  check("reset: a bad token gets the link message, 400", badToken.status === 400 && /invalid or has expired/.test(badToken.text), `${badToken.status} ${badToken.text}`);

  const weak = await post("/api/auth/reset", { token: "weak-token", password: "eightchar" });
  check("reset: PocketBase's own password message is passed through, not replaced", weak.status === 400 && /at least 8 character/.test(weak.text), `${weak.status} ${weak.text}`);

  const beforeShort = pbCalls.length;
  const short = await post("/api/auth/reset", { token: "good-token", password: "short" });
  check("reset: a too-short password is refused before PocketBase is asked", short.status === 400 && pbCalls.length === beforeShort, `status=${short.status}`);

  const noToken = await post("/api/auth/reset", { password: "correct horse battery" });
  check("reset: a missing token is refused, 400", noToken.status === 400, `status=${noToken.status}`);
} finally {
  try { process.kill(-app.pid, "SIGTERM"); } catch { app.kill("SIGTERM"); }
  pb.close();
}

console.log("\npassword-reset flow check\n");
for (const r of results) {
  console.log(`  ${r.ok ? "ok  " : "FAIL"}  ${r.name}`);
  if (!r.ok) console.log(`          ${r.detail}`);
}
if (failures) {
  console.log(`\n${failures} of ${results.length} checks failed.\n`);
  process.exit(1);
}
console.log(`\nAll ${results.length} checks pass.\n`);
process.exit(0);
