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
// 2026-08-24: moved from origin.honeymoney.app — the tunnel to the laptop — to
// the DOM Cloud site. That single line is what makes the SIGNED-IN half of
// honeymoney.app 24/7; the public half already was. The laptop path is left
// entirely intact: `origin` still resolves, the tunnel still runs, and putting
// the old value back and redeploying is the whole rollback.
//
// The fallback below still matters. DOM Cloud Lite has no `docker` feature, so
// the app is spawned by Passenger on demand rather than sitting resident, and
// the first request after an idle spell pays a cold start (~3s measured). That
// is well inside ORIGIN_TIMEOUT_MS, but the snapshot remains the safety net.
const ORIGIN_HOST = "honeymoney-app.domcloud.dev";

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
const ORIGIN_TIMEOUT_MS = { nav: 2500, rsc: 1500, other: 25000 };

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
const BREAKER_TTL_S = 20;
const BREAKER_KEY = "https://honeymoney.invalid/__origin-breaker";

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
async function breakerOpen() {
  try {
    return Boolean(await caches.default.match(BREAKER_KEY));
  } catch {
    // No Cache API (wrangler dev in some modes) — degrade to "always probe",
    // which is exactly the behaviour this worker had before the breaker.
    return false;
  }
}

async function tripBreaker() {
  try {
    await caches.default.put(
      BREAKER_KEY,
      new Response("down", { headers: { "Cache-Control": `max-age=${BREAKER_TTL_S}` } }),
    );
  } catch {
    /* see breakerOpen */
  }
}

async function resetBreaker() {
  try {
    await caches.default.delete(BREAKER_KEY);
  } catch {
    /* see breakerOpen */
  }
}

// Returns null — never throws — when the origin can't be reached, so every
// caller can decide for itself what "offline" should look like.
//
// `kind` picks the wait from ORIGIN_TIMEOUT_MS and decides whether a failure is
// evidence about the ORIGIN or merely about this request. A slow language model
// on /api/* is the second kind, and must not park a marker that sends the next
// visitor's dashboard to the snapshot.
async function tryOrigin(request, url, kind = "other") {
  if (await breakerOpen()) return null;

  const target = new URL(url);
  target.protocol = "https:";
  target.hostname = ORIGIN_HOST;
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
      await tripBreaker();
      return null;
    }
    // Anything the app itself answered — a 200, a redirect, even a real 500 —
    // proves the origin is up. Clearing here is what makes recovery immediate.
    await resetBreaker();
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
    if (!timedOut || kind === "nav") await tripBreaker();
    return null;
  }
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
