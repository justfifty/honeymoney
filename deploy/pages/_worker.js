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

// Long enough to ride out a slow cold start on the laptop, short enough that a
// visitor never sits on a blank tab waiting for a machine that is switched off.
const ORIGIN_TIMEOUT_MS = 8000;

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

    // 1. Files we shipped — never worth a round trip to the laptop.
    if (isAsset(pathname)) return env.ASSETS.fetch(request);

    // 2. Public pages. Anonymous English visitors (which is every first-time
    //    visitor, and every judge following a link) get the edge copy: instant,
    //    and immune to the laptop being off. Anyone who is signed in or reading
    //    in another language needs the real render, so they go to the origin —
    //    and still fall back to the snapshot if it's down.
    if (SNAPSHOT.has(pathname) && isPageRequest(request, url)) {
      if (!needsPersonalRender(request)) return snapshot(env, url, request);
      return (await tryOrigin(request, url)) ?? (await snapshot(env, url, request));
    }

    // 3. A failed prefetch is harmless — the click after it just becomes a full
    //    page load. Never answer an RSC request with HTML; that confuses the
    //    router far more than a 404 does.
    if (isRscRequest(request, url)) {
      return (await tryOrigin(request, url)) ?? new Response(null, { status: 404 });
    }

    // 4. The app proper.
    const live = await tryOrigin(request, url);
    if (live) return live;
    return pathname.startsWith("/api/") ? offlineJson() : offlinePage(url);
  },
};

// ── routing helpers ──────────────────────────────────────────────────────────

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

// Returns null — never throws — when the laptop can't be reached, so every
// caller can decide for itself what "offline" should look like.
async function tryOrigin(request, url) {
  const target = new URL(url);
  target.protocol = "https:";
  target.hostname = ORIGIN_HOST;
  target.port = "";

  const req = new Request(target, request);
  req.headers.set("X-Forwarded-Host", url.host);
  req.headers.set("X-Forwarded-Proto", "https");

  try {
    const res = await fetch(req, { redirect: "manual", signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS) });
    if (ORIGIN_DOWN.has(res.status)) return null;
    // Returned untouched, deliberately. `new Response(res.body, res)` copies
    // Content-Encoding and Content-Length from a body we no longer hold in that
    // form, and the mismatch reaches any client that didn't advertise brotli as
    // unreadable bytes. Compression negotiation is the runtime's job — the one
    // thing we must not do is claim to have re-encoded something. The trade is
    // that origin responses carry no X-HoneyMoney-Served header; their absence
    // is the signal.
    return res;
  } catch {
    return null; // timeout, DNS, TLS, connection refused — all mean "off".
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
