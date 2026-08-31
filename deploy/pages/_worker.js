// honeymoney.app front door, running on Cloudflare's edge.
//
// The app runs on DOM Cloud (Lite, sgp, ARM64) as of 2026-08-24. It used to run
// on a laptop behind a Cloudflare Tunnel and was therefore only up while that
// laptop was. This worker splits the site in two:
//
//   • the public pages (pitch, guide, Academy, gallery, deck) are served from
//     a static snapshot at the edge — always up, always fast;
//   • everything genuinely dynamic (dashboard, graph, auth, /api/*) is proxied
//     to the origin, and degrades to a friendly page when it can't be reached.
//
// The snapshot is built by scripts/build-static-site.mjs. Keep SNAPSHOT below
// in step with the ROUTES list there.

// Where the app answers. Must NOT be this worker's own route, or requests would
// loop back here.
//
// ── TWO ORIGINS, TRIED IN ORDER ────────────────────────────────────────────
//
// This was one host, and one host is what turned a bad afternoon on somebody
// else's shared server into honeymoney.app being down. Measured ON the DOM
// Cloud box on 2026-08-31, while the site was flapping:
//
//     Mem:  15636 total   13891 used    265 free
//     Swap:  8191 total    8191 used      0 free     <- completely exhausted
//     load average: 1.17, 1.38, 3.33
//
// Our own four Next processes are 418 MB of that. The rest is other tenants, on
// a machine we do not control and cannot size. A host with no swap left does
// not REFUSE connections, it stops answering them — which is precisely the
// blackhole this worker kept spending its whole timeout against.
//
// So the laptop origin is not history after all. It still runs, still has its
// tunnel and its DNS, and it answered while DOM Cloud did not:
//
//     origin.honeymoney.app   conn 0.028s   ttfb 0.153s   200
//
// SAFE TO FAIL OVER TO, specifically because of what it is NOT doing: it has no
// copy of the ledger. Both origins read the same PocketBase, so there is one
// database and no split brain. The session survives the switch for the same
// reason — `hm_auth` carries a PocketBase token that either origin validates
// against that same database, and there is no app-level signing key for the two
// to disagree about.
//
// WHAT THIS COVERS, AND WHAT IT DOES NOT. It covers the app site dying while
// the database lives: our processes OOM-killed, Passenger wedged, a bad deploy.
// It does NOT cover the whole DOM Cloud host going down, because PocketBase is
// on that same host — measured, the two went dark together. That one is not
// fixable in this file; it is a plan change or a different origin, and the
// snapshot below is what carries the public pages through it either way.
//
// Order matters: DOM Cloud first because it is always on, and the laptop is
// only mostly on. Swapping the two entries inverts that, and is the rollback.
const ORIGINS = ["honeymoney-app.domcloud.dev", "origin.honeymoney.app"];

// Public pages that exist in the snapshot. The build script rewrites this line
// from its own ROUTES list, so the two can never drift; the literal here is
// only what `wrangler pages dev` sees if you run the worker un-built.
const SNAPSHOT = new Set(/* @snapshot-routes */ ["/", "/guide", "/learn", "/gallery", "/deck"]);

// ── HOW LONG A VISITOR WAITS FOR THE ORIGIN ─────────────────────────────────
//
// One 8-second number used to cover every request, and it was the wrong number
// twice over. Measured 2026-08-31 with the origin refusing TCP outright:
//
//     honeymoney.app/dashboard   ttfb 8.08s -> 503
//     honeymoney.app/record      ttfb 8.08s -> 503
//
// Nobody waits eight seconds to be told the page is not there, and tapping four
// tabs cost thirty-two. Meanwhile the SAME number capped /api/insight/ask,
// which calls a language model and is entitled to take longer than any page.
// So the budget is now per kind of request, because the kinds are not alike:
//
//   navigation   2500  A human is watching a blank tab, and we hold a snapshot
//                      to give them instead. A healthy render measures ~100ms
//                      and a Passenger cold start ~3s — which is why the warmer
//                      exists (deploy/warm/) rather than why this number is big.
//   RSC          1500  A failed prefetch is free: the click after it becomes an
//                      ordinary navigation. Never make a visitor wait on one.
//   everything   25000 /api/* included. An LLM answer is not a slow origin, and
//                      cutting it off at 8s turned a working feature into a
//                      failure that looked like downtime.
//   asset        2000  A content-hashed file that the edge does not have. The
//                      page referencing it is already rendering, so this is a
//                      race against the reader noticing an unstyled screen.
const ORIGIN_TIMEOUT_MS = { nav: 2500, rsc: 1500, asset: 2000, other: 25000 };

// ── THE BREAKER ─────────────────────────────────────────────────────────────
//
// A shorter timeout still charges EVERY request the full wait while the origin
// is down. The breaker charges the first one only: a connection-level failure
// parks a marker in this colo's cache, and for the next 20 seconds requests
// skip the round trip and go straight to the snapshot (~50ms, measured against
// the 2.5s they would otherwise each pay).
//
// It half-opens by expiry rather than by counter — when the marker ages out the
// next request probes for real — and a single success deletes it, so recovery
// is immediate rather than something to wait out. Per-colo is the right scope:
// this is "can MY edge reach the origin", which is exactly what a visitor
// routed through that colo is about to find out.
//
// PER HOST, now that there are two. A marker parked by a dead DOM Cloud must
// not stop the very next request from trying the laptop — that would make the
// breaker defeat the failover it is supposed to make cheap.
const BREAKER_TTL_S = 20;
const breakerKey = (host) => `https://honeymoney.invalid/__origin-breaker/${host}`;

// Cloudflare's own "I can't reach your origin" range (1033/523/530 etc.) plus
// the gateway codes a dying tunnel emits. A real 500 from the app is NOT here:
// that is the app talking, and the visitor should see it.
const ORIGIN_DOWN = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530]);

const AUTH_COOKIE = "hm_auth";
const LOCALE_COOKIE = "hm_lang";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = normalize(url.pathname);

    // 1. Files we shipped — never worth a round trip to the origin.
    if (isAsset(pathname)) {
      const res = await env.ASSETS.fetch(request);

      // A MISSING content-hashed asset must 404, not fall back to index.html.
      // Pages answers an unknown path with the site's HTML at status 200, and
      // for /_next/static that is actively poisonous: those URLs are served
      // immutable, so a browser stores HTML under a .js URL and then tries to
      // execute it until the entry expires. React never hydrates and the page
      // looks fine while nothing responds to a click — which is exactly how a
      // snapshot/origin build mismatch presented on 2026-08-24, long after the
      // files themselves had been fixed at the edge.
      //
      // 404 makes the same mistake loud and, crucially, not cached as valid.
      if (pathname.startsWith("/_next/static/") && res.status === 200) {
        const type = res.headers.get("content-type") || "";
        if (!/javascript|css|font|image|json|octet-stream|wasm|video|audio/i.test(type)) {
          return missingAsset();
        }
      }

      // ⚠️ A 404 HERE MUST NEVER BE CACHEABLE. _headers matches on PATH, not on
      // status, so the `/_next/static/*` immutable rule is attached to a miss
      // just as happily as to a hit. (What actually reaches the browser is
      // `public, max-age=14400, immutable` — the zone's Browser Cache TTL caps
      // the year this repo's _headers asks for. Measured, not assumed; four
      // hours is still far longer than any deploy.) Combine that with a
      // content-hashed filename — where the hash IS the content, so the next
      // build emits the same name — and one request during a bad deploy window
      // pins a 404 in that browser until it expires. No redeploy can dislodge
      // it; the visitor has to hard-reload or clear site data, and visitors do
      // not do that — they conclude the site is broken.
      //
      // This is not hypothetical. On 2026-08-30 the app was shipped to the
      // origin without republishing the Pages snapshot, and for the few minutes
      // that gap was open every new asset URL 404'd at the edge while serving
      // 200 at the origin. Anyone who loaded the site in that window kept an
      // unstyled, never-hydrating page afterwards.
      //
      // no-store costs nothing on the happy path (a present asset is a 200 and
      // keeps its immutable header) and removes the only way this failure
      // outlives the deploy that caused it.
      if (pathname.startsWith("/_next/static/") && res.status !== 200) {
        // ── ASK THE ORIGINS BEFORE GIVING UP ──────────────────────────────
        //
        // Necessary the moment there is more than one origin. The snapshot's
        // /_next/static comes from ONE build, and a page rendered by the other
        // origin references that build's content hashes — so a failover could
        // serve a perfectly good page whose every script 404s at the edge,
        // which is the unstyled never-hydrating failure described above,
        // arriving by a new route.
        //
        // Only on a miss, so the happy path is untouched: a present asset is
        // still answered from the edge without a round trip. And still
        // `missingAsset` if nobody has it, because a genuine 404 must stay
        // loud and uncacheable.
        const fromOrigin = await tryOrigin(request, url, "asset");
        if (fromOrigin && fromOrigin.status === 200) return fromOrigin;
        return missingAsset(res.status);
      }
      return res;
    }

    // 2. Public pages. Anonymous English visitors (which is every first-time
    //    visitor, and every judge following a link) get the edge copy: instant,
    //    and immune to the laptop being off. Anyone who is signed in or reading
    //    in another language needs the real render, so they go to the origin —
    //    and still fall back to the snapshot if it's down.
    if (SNAPSHOT.has(pathname) && isPageRequest(request, url)) {
      if (!needsPersonalRender(request)) return snapshot(env, url, request);
      return (await tryOrigin(request, url, "nav")) ?? (await snapshot(env, url, request));
    }

    // 3. A failed prefetch is harmless — the click after it just becomes a full
    //    page load. Never answer an RSC request with HTML; that confuses the
    //    router far more than a 404 does.
    if (isRscRequest(request, url)) {
      return (await tryOrigin(request, url, "rsc")) ?? new Response(null, { status: 404 });
    }

    // 4. The app proper. A page GET is a person waiting in front of a blank
    //    tab and gets the short budget; a POST, an /api/* call or an upload is
    //    work in flight and gets the long one.
    //
    //    ⚠️ `isPageRequest` IS NOT ENOUGH ON ITS OWN — it answers "GET or HEAD,
    //    and not RSC", which every /api/* GET also satisfies. Measured against a
    //    live origin while writing this: GET /api/health was classified as a
    //    navigation, given 2.5s, and 503'd at 2.55s on a host that answers in
    //    1.8s when cold. An API route is not a person staring at a blank tab and
    //    there is no snapshot to give it instead, so the path has to be part of
    //    the question.
    const isNav = isPageRequest(request, url) && !pathname.startsWith("/api/");
    const live = await tryOrigin(request, url, isNav ? "nav" : "other");
    if (live) return live;
    return pathname.startsWith("/api/") ? offlineJson() : offlinePage(url);
  },
};

// ── routing helpers ──────────────────────────────────────────────────────────

/**
 * The one response in this worker that must outlive nothing. See the long note
 * at the call site: a cacheable 404 on a content-hashed URL is permanent.
 */
function missingAsset(status = 404) {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}

function normalize(pathname) {
  const p = pathname.replace(/\/{2,}/g, "/").replace(/(.)\/+$/, "$1");
  return p || "/";
}

// Anything with a file extension is a static asset, plus the two well-known
// paths that have no extension of their own.
function isAsset(pathname) {
  if (pathname.startsWith("/_next/static/")) return true;
  if (pathname === "/manifest.webmanifest" || pathname === "/snapshot.json") return true;
  return /\.[a-z0-9]+$/i.test(pathname);
}

function isPageRequest(request, url) {
  return (request.method === "GET" || request.method === "HEAD") && !isRscRequest(request, url);
}

function isRscRequest(request, url) {
  return request.headers.has("RSC") || request.headers.has("Next-Router-Prefetch") || url.searchParams.has("_rsc");
}

// Only the signed-in and the non-English need a server render of a public page.
function needsPersonalRender(request) {
  const cookie = request.headers.get("Cookie") || "";
  if (cookie.includes(`${AUTH_COOKIE}=`)) return true;
  const lang = cookie.match(new RegExp(`${LOCALE_COOKIE}=([^;]+)`));
  return Boolean(lang && decodeURIComponent(lang[1]) !== "en");
}

// ── the two backends ─────────────────────────────────────────────────────────

async function snapshot(env, url, request) {
  const file = new URL(url);
  file.pathname = normalize(url.pathname) === "/" ? "/index.html" : `${normalize(url.pathname)}/index.html`;
  file.search = "";
  const res = await env.ASSETS.fetch(new Request(file, { method: "GET", headers: request.headers }));
  const out = new Response(res.body, res);
  out.headers.set("X-HoneyMoney-Served", "edge-snapshot");
  return out;
}

/**
 * Is this colo currently holding an "origin is down" marker?
 *
 * Cache API rather than KV: no binding to provision, no eventual consistency to
 * reason about, and the blast radius of a wrong answer is one navigation seeing
 * the snapshot for at most BREAKER_TTL_S. KV would also bill a read on every
 * request to the site.
 */
async function breakerOpen(host) {
  try {
    return Boolean(await caches.default.match(breakerKey(host)));
  } catch {
    // No Cache API (wrangler dev in some modes) — degrade to "always probe",
    // which is exactly the behaviour this worker had before the breaker.
    return false;
  }
}

async function tripBreaker(host) {
  try {
    await caches.default.put(
      breakerKey(host),
      new Response("down", { headers: { "Cache-Control": `max-age=${BREAKER_TTL_S}` } }),
    );
  } catch {
    /* see breakerOpen */
  }
}

async function resetBreaker(host) {
  try {
    await caches.default.delete(breakerKey(host));
  } catch {
    /* see breakerOpen */
  }
}

/**
 * Ask ONE origin. Returns null — never throws — when it cannot be reached.
 *
 * `kind` picks the wait from ORIGIN_TIMEOUT_MS and decides whether a failure is
 * evidence about the HOST or merely about this request. A slow language model
 * on /api/* is the second kind, and must not park a marker that sends the next
 * visitor's dashboard somewhere else.
 */
async function askOrigin(request, url, host, kind) {
  if (await breakerOpen(host)) return null;

  const target = new URL(url);
  target.protocol = "https:";
  target.hostname = host;
  target.port = "";

  const req = new Request(target, request);
  req.headers.set("X-Forwarded-Host", url.host);
  req.headers.set("X-Forwarded-Proto", "https");

  try {
    const res = await fetch(req, {
      redirect: "manual",
      signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS[kind] ?? ORIGIN_TIMEOUT_MS.other),
    });
    if (ORIGIN_DOWN.has(res.status)) {
      await tripBreaker(host);
      return null;
    }
    // Anything the app itself answered — a 200, a redirect, even a real 500 —
    // proves the host is up. Clearing here is what makes recovery immediate.
    await resetBreaker(host);
    // Returned untouched, deliberately. `new Response(res.body, res)` copies
    // Content-Encoding and Content-Length from a body we no longer hold in that
    // form, and the mismatch reaches any client that didn't advertise brotli as
    // unreadable bytes. Compression negotiation is the runtime's job — the one
    // thing we must not do is claim to have re-encoded something. The trade is
    // that origin responses carry no X-HoneyMoney-Served header; their absence
    // is the signal.
    return res;
  } catch (err) {
    // A TimeoutError means "not within the budget for THIS kind of request",
    // and for /api/* that is a slow answer, not a dead host. Everything else —
    // DNS, TLS, connection refused — is the host, whatever was being asked of
    // it, and is worth sparing the next visitor the same wait.
    const timedOut = err && err.name === "TimeoutError";
    if (!timedOut || kind === "nav") await tripBreaker(host);
    return null;
  }
}

/**
 * Ask each origin in turn, and hand back the first one that answers.
 *
 * ⚠️ ONLY BODYLESS REQUESTS FAIL OVER, and that is a correctness rule, not a
 * simplification. A Request's body can be read once; retrying a POST against a
 * second host means either buffering the upload at the edge — receipts and
 * statement imports, unbounded, in a Worker's memory — or risking a write that
 * lands TWICE in a household's ledger because the first host actually got it
 * and died before answering. Neither is worth it, and neither is needed: the
 * app already queues failed writes on the client (lib/offlineQueue.ts, and the
 * OfflineGate that flushes it), which is the right layer for a retry because it
 * is the only one that knows whether the write already happened.
 *
 * So GET and HEAD — every navigation, every prefetch, every read — get the
 * second chance, and writes get an honest failure they already know how to
 * recover from.
 */
async function tryOrigin(request, url, kind = "other") {
  const canFailOver = request.method === "GET" || request.method === "HEAD";
  for (const host of ORIGINS) {
    const res = await askOrigin(request, url, host, kind);
    if (res) return res;
    if (!canFailOver) break;
  }
  return null;
}

// ── offline responses ────────────────────────────────────────────────────────

function offlineJson() {
  return new Response(JSON.stringify({ error: "offline", message: "The HoneyMoney app is temporarily unavailable." }), {
    status: 503,
    headers: { "Content-Type": "application/json", "Retry-After": "300", "Cache-Control": "no-store" },
  });
}

function offlinePage(url) {
  const wanted = normalize(url.pathname);
  return new Response(OFFLINE_HTML.replace("{{PATH}}", escapeHtml(wanted)), {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": "300",
      "Cache-Control": "no-store",
      "X-HoneyMoney-Served": "offline",
    },
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Self-contained on purpose: this page has to render when nothing else works,
// so it pulls in no stylesheet, no font and no script.
const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Back shortly · HoneyMoney</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 2rem 1.25rem;
    font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #27272a; background: #fffbeb;
  }
  .card { width: 100%; max-width: 34rem; text-align: center; }
  .mark { font-size: 2.75rem; line-height: 1; }
  h1 { margin: 1rem 0 .5rem; font-size: 1.5rem; letter-spacing: -.02em; }
  p { margin: 0 0 1rem; color: #52525b; }
  .path { display: inline-block; padding: .15rem .45rem; border-radius: .35rem; background: #fef3c7; color: #92400e; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em; }
  .links { display: flex; flex-wrap: wrap; gap: .6rem; justify-content: center; margin-top: 1.75rem; }
  a {
    padding: .6rem 1rem; border-radius: .75rem; border: 1px solid #fcd34d;
    background: #fff; color: #92400e; text-decoration: none; font-weight: 600; font-size: .9rem;
  }
  a:hover { border-color: #f59e0b; }
  a.primary { background: #f59e0b; border-color: #f59e0b; color: #fff; }
  small { display: block; margin-top: 1.75rem; color: #a1a1aa; font-size: .8rem; }
  @media (prefers-color-scheme: dark) {
    body { color: #e4e4e7; background: #18181b; }
    p { color: #a1a1aa; }
    .path { background: #451a03; color: #fcd34d; }
    a { background: #27272a; border-color: #57534e; color: #fcd34d; }
    a.primary { background: #f59e0b; border-color: #f59e0b; color: #1c1917; }
  }
</style>
</head>
<body>
  <div class="card">
    <div class="mark">🍯</div>
    <h1>This part of HoneyMoney is resting</h1>
    <p>
      <span class="path">{{PATH}}</span> runs on our own hardware and it isn't answering right now.
      It usually comes back within a few minutes — please try again shortly.
    </p>
    <p>Everything below is always available:</p>
    <div class="links">
      <a class="primary" href="/">Home</a>
      <a href="/gallery">Graph gallery</a>
      <a href="/deck">Deck &amp; demo</a>
      <a href="/guide">Guide</a>
      <a href="/learn">Academy</a>
    </div>
    <small>HoneyMoney — funding transparency, spending autonomy.</small>
  </div>
</body>
</html>
`;
