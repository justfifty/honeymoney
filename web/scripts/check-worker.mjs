// Does deploy/pages/_worker.js actually route the way its comments say it does?
//
//   npm run check:worker
//
// ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
//
// _worker.js is the only code in this repo with no test surface and the largest
// blast radius: it is the front door, it runs on somebody else's edge, and its
// failures do not look like failures. They look like a site that is up.
//
// On 2026-09-08 honeymoney.app served /record and /dashboard as raw HTML —
// correct markup, live household figures, no stylesheet, no hydration, a tab
// bar reduced to a line of underlined links. The origin was up the whole time
// and was holding every chunk the edge was 404'ing. The rescue written for
// precisely that (ask the origins before giving up) had never executed once,
// because two conditions in the same branch locked each other out:
//
//   Pages answers an unknown path with the site's HTML AT STATUS 200.
//   The rescue was guarded by `res.status !== 200`.
//
// So the miss was taken by the arm above it and answered 404, and the arm that
// would have fixed it waited on a status that never arrives. Nothing about that
// is visible by reading either arm on its own, which is exactly why it survived
// review — and why the check is a harness that RUNS the worker rather than a
// list of assertions about its source.
//
// ── WHAT IT STUBS, AND WHY THAT IS THE WHOLE POINT ─────────────────────────
//
// The ASSETS binding is stubbed to behave the way Cloudflare Pages actually
// behaves rather than the way it is easy to imagine it behaving: a hit is the
// file, and a MISS is the site's HTML at status 200. Get that one detail wrong
// in the stub and this check passes over the bug it was written for.
//
// No wrangler, no network, no credentials — it imports the real module and
// calls its real fetch handler, so it runs anywhere, in about four seconds.

import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKER = path.join(ROOT, "deploy", "pages", "_worker.js");

const worker = (await import(pathToFileURL(WORKER).href)).default;

// ── the fake world ──────────────────────────────────────────────────────────

const EDGE = new Map(); // pathname -> { body, type }
const ORIGIN = new Map(); // pathname -> { body, type, status }

let originCalls = [];
// Milliseconds before the origin answers. The real one pays a ~3s Passenger
// cold start (deploy/warm/README.md measures 3140ms), which is the number the
// asset budget has to clear.
let originDelayMs = 0;
// "Blackholed" — accepts the connection and never answers, the DOM Cloud
// out-of-swap case _worker.js documents. Distinct from refusing.
let originRefuses = false;

const html = (body) => ({ body, type: "text/html; charset=utf-8" });
const js = (body) => ({ body, type: "text/javascript" });

const env = {
  ASSETS: {
    async fetch(req) {
      const p = new URL(req.url).pathname;
      const hit = EDGE.get(p);
      if (hit) {
        return new Response(hit.body, { status: 200, headers: { "content-type": hit.type } });
      }
      // ⚠️ THE DETAIL THIS WHOLE FILE TURNS ON. Pages does not 404 an unknown
      // path — it serves the site's HTML at 200. Change this to a 404 and the
      // check still passes while the worker is broken.
      return new Response("<!doctype html><html>pages fallback</html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  },
};

function installGlobals() {
  const store = new Map();
  globalThis.caches = {
    default: {
      async match(key) {
        return store.has(key) ? new Response("down") : undefined;
      },
      async put(key) {
        store.set(key, true);
      },
      async delete(key) {
        store.delete(key);
      },
    },
  };
  globalThis.__breaker = store;

  globalThis.fetch = async (req, init = {}) => {
    const url = new URL(typeof req === "string" ? req : req.url);
    originCalls.push(url.hostname + url.pathname);
    if (originRefuses) throw Object.assign(new Error("connection refused"), { name: "TypeError" });

    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, originDelayMs);
      const signal = init.signal ?? req.signal;
      signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(Object.assign(new Error("timed out"), { name: "TimeoutError" }));
      });
    });

    const hit = ORIGIN.get(url.pathname);
    if (!hit) return new Response(null, { status: 404 });
    return new Response(hit.body, {
      status: hit.status ?? 200,
      headers: { "content-type": hit.type },
    });
  };
}

installGlobals();

async function call(pathname, { headers = {}, method = "GET" } = {}) {
  originCalls = [];
  const res = await worker.fetch(new Request("https://honeymoney.app" + pathname, { method, headers }), env);
  const body = await res.text();
  return {
    status: res.status,
    type: res.headers.get("content-type") || "",
    cacheControl: res.headers.get("cache-control") || "",
    served: res.headers.get("x-honeymoney-served") || "",
    body,
    origins: originCalls,
  };
}

// ── the checks ──────────────────────────────────────────────────────────────

let failures = 0;
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures++;
}

function reset() {
  EDGE.clear();
  ORIGIN.clear();
  globalThis.__breaker.clear();
  originDelayMs = 0;
  originRefuses = false;
  // The snapshot always holds the public pages.
  EDGE.set("/index.html", html("<!doctype html><html>snapshot home</html>"));
}

const CHUNK_A = "/_next/static/chunks/build-a.js";
const CHUNK_B = "/_next/static/chunks/build-b.js";

// 1. The happy path must not have moved. A present asset is answered from the
//    edge with no round trip — that is the whole reason the snapshot exists.
{
  reset();
  EDGE.set(CHUNK_A, js("//edge copy"));
  const r = await call(CHUNK_A);
  check(
    "present asset — served from the edge, origin never asked",
    r.status === 200 && r.body === "//edge copy" && r.origins.length === 0,
    `status=${r.status} originCalls=${r.origins.length}`,
  );
}

// 2. THE REGRESSION. The edge does not have it, so Pages answers the site's
//    HTML at 200 — and the worker must recognise that as a MISS and rescue it
//    from the origin. Before 2026-09-08 this returned 404 with originCalls=0.
{
  reset();
  ORIGIN.set(CHUNK_B, js("//origin copy"));
  const r = await call(CHUNK_B);
  check(
    "edge miss answered by Pages as HTML/200 — rescued from the origin",
    r.status === 200 && r.body === "//origin copy" && r.origins.length >= 1,
    `status=${r.status} body=${JSON.stringify(r.body.slice(0, 24))} originCalls=${r.origins.length}`,
  );
}

// 3. Whatever happens, the browser must never be handed the fallback HTML under
//    a .js URL. That is the poisoning described at the call site: an immutable
//    cache entry holding HTML that the page then tries to execute.
{
  reset();
  const r = await call(CHUNK_B); // nobody has it
  check(
    "asset nobody has — never HTML, never 200",
    r.status !== 200 && !/html/i.test(r.type) && !r.body.includes("pages fallback"),
    `status=${r.status} type=${r.type || "(none)"}`,
  );
  check(
    "…and the 404 is uncacheable",
    /no-store/.test(r.cacheControl),
    `cache-control=${r.cacheControl || "(none)"}`,
  );
}

// 4. The asset budget must clear the origin's cold start. At 2000ms against a
//    ~3.1s Passenger spawn the rescue timed out every time on the first request
//    after an idle spell, which is very nearly every visit.
{
  reset();
  ORIGIN.set(CHUNK_B, js("//origin copy"));
  originDelayMs = 3140; // deploy/warm/README.md, measured
  const started = Date.now();
  const r = await call(CHUNK_B);
  check(
    "asset rescue outlasts a ~3.1s origin cold start",
    r.status === 200 && r.body === "//origin copy",
    `status=${r.status} after ${Date.now() - started}ms`,
  );
}

// 5. A tripped breaker must not block an asset rescue. A cold origin overruns
//    the nav budget, a nav timeout trips the breaker, and every asset rescue
//    for the next 20s used to return null without asking anyone — while the
//    host it refused to ask was awake and holding all of them.
{
  reset();
  ORIGIN.set(CHUNK_B, js("//origin copy"));
  // Trip it the way the worker itself does, via a nav that cannot be answered.
  originDelayMs = 60_000;
  await call("/dashboard");
  const tripped = globalThis.__breaker.size > 0;
  originDelayMs = 0;
  const r = await call(CHUNK_B);
  check(
    "asset rescue ignores a breaker tripped by a slow navigation",
    tripped && r.status === 200 && r.body === "//origin copy",
    `breakerTripped=${tripped} status=${r.status} originCalls=${r.origins.length}`,
  );
}

// 6. …but a NAVIGATION still respects it. The breaker exists so a visitor does
//    not queue behind a dead host when there is a snapshot to give them.
{
  reset();
  originDelayMs = 60_000;
  await call("/"); // signed-in-style nav is not needed; trip via the app route
  await call("/dashboard");
  const r = await call("/");
  check(
    "public page still falls back to the snapshot when the origin is unreachable",
    r.status === 200 && r.body.includes("snapshot home"),
    `status=${r.status} served=${r.served || "(none)"}`,
  );
}

// 6b. A COLD origin — alive, but respawning after idle — must be waited for
//     on an app route, because there is no snapshot to fall back to. At 2.5s
//     every visitor after an idle spell got "resting" from a host that would
//     have answered half a second later, and nobody ever waited long enough
//     to wake it. Measured cold start: ~3.1s (deploy/warm/README.md).
{
  reset();
  ORIGIN.set("/dashboard", html("<!doctype html><html>the real dashboard</html>"));
  originDelayMs = 3140;
  const started = Date.now();
  const r = await call("/dashboard");
  check(
    "app route on a cold (~3.1s) origin — waited for, real page served",
    r.status === 200 && r.body.includes("the real dashboard"),
    `status=${r.status} after ${Date.now() - started}ms body=${JSON.stringify(r.body.slice(0, 30))}`,
  );
}

// 6c. A WRITE while the first origin is asleep. Login is a POST. The laptop is
//     first in ORIGINS and, asleep, its tunnel answers 530 from Cloudflare's
//     edge — before a single byte reaches the app. That is a request the
//     laptop provably never received, so sending it to DOM Cloud cannot land
//     it twice. Before 2026-09-08 a POST never failed over at all, and every
//     write said "offline" while a perfectly good origin sat idle.
{
  reset();
  ORIGIN.set("/api/auth/login", { body: '{"ok":true}', type: "application/json", status: 200 });
  originDelayMs = 0;
  // First host answers 530 (tunnel down); second host is the real app.
  const realFetch = globalThis.fetch;
  const delivered = [];
  globalThis.fetch = async (req, init = {}) => {
    const url = new URL(req.url);
    if (url.hostname === "origin.honeymoney.app") {
      originCalls.push(url.hostname + url.pathname);
      return new Response("tunnel down", { status: 530 });
    }
    delivered.push(await req.clone().text());
    return realFetch(req, init);
  };
  const res = await worker.fetch(
    new Request("https://honeymoney.app/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"email":"a@b.c","password":"x"}',
    }),
    env,
  );
  const body = await res.text();
  globalThis.fetch = realFetch;
  check(
    "POST while the first origin's tunnel is down (530) — served by the second, body delivered once",
    res.status === 200 && body.includes('"ok":true') && delivered.length === 1 && delivered[0].includes("a@b.c"),
    `status=${res.status} body=${JSON.stringify(body.slice(0, 40))} deliveredToSecond=${delivered.length}`,
  );
}

// 6d. …but a POST the first origin MAY have received is never resent. A
//     timeout after the request went out is exactly the case where a write
//     could land twice, and the client's own offline queue is the right place
//     for that retry, because only it knows whether the write happened.
{
  reset();
  ORIGIN.set("/api/auth/login", { body: '{"ok":true}', type: "application/json", status: 200 });
  const realFetch = globalThis.fetch;
  let secondAsked = 0;
  globalThis.fetch = async (req, init = {}) => {
    const url = new URL(req.url);
    if (url.hostname === "origin.honeymoney.app") {
      originCalls.push(url.hostname + url.pathname);
      // Never answers. A referenced timer keeps the event loop alive until the
      // worker's own AbortSignal.timeout fires — Node's timeout signals are
      // unref'd, and without this the process exits mid-test.
      await new Promise((resolve, reject) => {
        const keepAlive = setTimeout(resolve, 120_000);
        const signal = init.signal ?? req.signal;
        signal?.addEventListener("abort", () => {
          clearTimeout(keepAlive);
          reject(Object.assign(new Error("timed out"), { name: "TimeoutError" }));
        });
      });
    }
    secondAsked++;
    return realFetch(req, init);
  };
  const started = Date.now();
  const res = await worker.fetch(
    new Request("https://honeymoney.app/api/auth/login", { method: "POST", body: "{}" }),
    env,
  );
  const body = await res.text();
  globalThis.fetch = realFetch;
  check(
    "POST that timed out at the first origin — NOT resent to the second, honest 503",
    res.status === 503 && secondAsked === 0 && body.includes("offline"),
    `status=${res.status} secondAsked=${secondAsked} after ${Date.now() - started}ms`,
  );
}

// 7. An app route with no origin gets the offline page, not a blank tab.
{
  reset();
  originRefuses = true;
  const r = await call("/dashboard");
  check(
    "app route with both origins down — offline page, 503",
    r.status === 503 && /html/i.test(r.type) && r.body.includes("resting"),
    `status=${r.status} type=${r.type}`,
  );
}

// 8. /api/* must never be answered with HTML. A router or a fetch() handler
//    given a page instead of JSON fails in a way nobody can read.
{
  reset();
  originRefuses = true;
  const r = await call("/api/transactions");
  check(
    "api route with both origins down — JSON, never HTML",
    r.status === 503 && /json/i.test(r.type),
    `status=${r.status} type=${r.type}`,
  );
}

// 9. An RSC request must never be answered with HTML either — that confuses the
//    router far more than a 404 does, and a failed prefetch costs nothing.
{
  reset();
  originRefuses = true;
  const r = await call("/dashboard?_rsc=abc");
  check(
    "RSC prefetch with no origin — 404, never HTML",
    r.status === 404 && !/html/i.test(r.type),
    `status=${r.status} type=${r.type || "(none)"}`,
  );
}

// 10. A signed-in visitor to a public page needs the real render, not the
//     anonymous snapshot — but must still land somewhere if the origin is down.
{
  reset();
  ORIGIN.set("/", html("<!doctype html><html>personalised home</html>"));
  const r = await call("/", { headers: { Cookie: "hm_auth=token" } });
  check(
    "signed-in visitor to a public page is rendered by the origin",
    r.status === 200 && r.body.includes("personalised"),
    `status=${r.status} originCalls=${r.origins.length}`,
  );
}

// ── report ──────────────────────────────────────────────────────────────────

console.log("\n_worker.js routing check\n");
for (const r of results) {
  console.log(`  ${r.ok ? "ok  " : "FAIL"}  ${r.name}`);
  if (!r.ok) console.log(`          ${r.detail}`);
}

if (failures) {
  console.log(
    `\n${failures} of ${results.length} checks failed.\n\n` +
      `_worker.js is the front door for honeymoney.app. A fault here does not look\n` +
      `like downtime — it looks like a site that is up and subtly wrong, which is\n` +
      `how the 2026-09-08 unstyled-site failure ran for a week. Fix before deploying.\n`,
  );
  process.exit(1);
}

console.log(`\nAll ${results.length} checks pass — the front door routes as documented.\n`);
process.exit(0);
