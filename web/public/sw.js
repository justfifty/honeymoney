// HoneyMoney's service worker — what still works when the network does not.
//
// Two things forced this. The app is served from a laptop behind a Cloudflare
// Tunnel, and that laptop is off for hours at a time; and the product claims
// on-device receipt OCR while fetching a 15 MB engine from a CDN at the moment
// you press scan. Both are the same failure from the user's side: the thing
// they were promised needs a network they do not have.
//
// ── FOUR STRATEGIES, CHOSEN PER PATH ───────────────────────────────────────
//
//   /ocr/*            cache-first, forever. Immutable, version-pinned engine
//                     binaries and language models. 28 MB, so it is cached on
//                     first use rather than precached on install — see below.
//   /_next/static/*   cache-first, forever. Content-hashed by the framework, so
//                     a stale copy is impossible by construction.
//   navigations       network-first, falling back to cache, falling back to the
//                     offline page. A finance app must never serve yesterday's
//                     balance from a cache when today's is one request away.
//   /api/*            network-only. NEVER cached, in either direction. A cached
//                     API response is a stale figure presented as current, and
//                     a cached response to a *household member's* request is a
//                     privacy failure — the cache has no idea who was signed in
//                     when it stored the body.
//
// ── WHY /ocr IS NOT PRECACHED ──────────────────────────────────────────────
//
// A 28 MB install would download the OCR engine and two language models to
// every visitor who ever loaded the landing page, including the ones who will
// never scan a receipt, on connections metered by the megabyte. Worse, a
// precache is atomic: one 404 among those eleven files and the whole service
// worker fails to install, taking the offline page down with it.
//
// So the engine is cached the first time somebody actually scans something.
// The cost lands on the user who wants the feature, at the moment they want it,
// and every scan after that is offline. Settings offers a button to do it
// deliberately for someone who knows they are about to lose signal.

// Bumped whenever the caching RULES change. Changing these bytes is also what
// makes a browser install this worker at all, so a bump is how an existing
// client is rescued from a cache written by an older set of rules.
const VERSION = "hm-v5";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const OCR = `${VERSION}-ocr`;
const KEEP = new Set([SHELL, ASSETS, OCR]);

// Small, and every entry must exist or install fails. Kept to the offline page
// and the icons it needs — anything larger belongs in the runtime caches.
const PRECACHE = ["/icon-192.png"];

// The offline page is cached under THIS key whatever URL actually served it.
const OFFLINE_KEY = "/offline.html";

/**
 * Cache the offline page, defeating two things that silently broke it.
 *
 * 1. Cloudflare Pages serves clean URLs, so /offline.html answers 308 -> /offline
 *    at the edge while the origin answers 200 for the .html. Whichever one is
 *    reachable has to work.
 * 2. `cache.put` REJECTS any response whose `redirected` flag is set. So a plain
 *    `cache.add('/offline.html')` throws at the edge — and because install
 *    tolerates per-URL failures, the worker installed happily with no offline
 *    page at all. The fallback then degraded to a line of plain text, which is
 *    exactly the moment a user most needs a real page.
 *
 * Rebuilding the Response from its body clears the redirected flag, so the copy
 * we store is cacheable no matter how many hops it took to fetch.
 */
async function cacheOfflinePage(cache) {
  for (const url of ["/offline.html", "/offline"]) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) continue;
      const body = await res.blob();
      await cache.put(
        OFFLINE_KEY,
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
      );
      return true;
    } catch {
      /* try the next spelling */
    }
  }
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Individually, not addAll: addAll rejects the whole batch on one
      // failure, and a service worker that will not install because an icon
      // moved is worse than one missing an icon.
      await Promise.all(
        PRECACHE.map((url) => cache.add(url).catch(() => undefined)),
      );
      await cacheOfflinePage(cache);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !KEEP.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

function isOcr(url) {
  return url.pathname.startsWith("/ocr/");
}

function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/deck/") ||
    /\.(png|svg|jpg|jpeg|webp|woff2?)$/.test(url.pathname)
  );
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  // Only 200s. Caching an opaque or error response means the next offline load
  // gets the error back instead of trying again.
  if (res && res.status === 200) cache.put(request, res.clone());
  // A 404 on a content-hashed build asset is not an ordinary miss. See below.
  if (res && res.status === 404 && request.url.includes("/_next/static/")) {
    await onDeadBuildAsset();
  }
  return res;
}

// ── THE UNSTYLED-SITE FAILURE, ARRIVING FROM THIS CACHE ────────────────────
//
// `/_next/static/*` filenames are content-hashed, and the header above argues
// that this makes a stale copy "impossible by construction". True — and it is
// answering the wrong question. The danger was never a stale ASSET. It is a
// stale DOCUMENT: an HTML page from build A, asking for build A's chunks, at a
// moment when only build B exists.
//
// This worker can produce exactly that on its own. Navigations are cached in
// SHELL and assets in ASSETS, in two independent caches with no shared notion
// of which build either came from. `networkFirst` hands over the cached page
// after NAV_TIMEOUT_MS — three seconds, which the comment there notes is about
// what a Passenger cold start costs — so a slow origin serves yesterday's HTML,
// and if the matching chunks have since been redeployed away, they 404. The
// page renders as unstyled HTML with giant unsized icons and never hydrates:
// no working login form, no hamburger menu, because there is no React on it.
//
// deploy/pages/README.md records the same failure arriving four other ways,
// "each time by a route nobody had considered". This is a fifth, and the only
// one that lives on the user's device — which also makes it the only one that
// cannot be fixed by redeploying, because the broken page is coming out of
// their own cache. It has to fix itself.
//
// So: a 404 on a hashed asset is treated as proof that the document asking for
// it is dead. Drop the cached HTML — never the assets, which are keyed by URL
// and are not the thing that went wrong — and tell the page to reload once.
//
// ONCE. The client guards the reload with sessionStorage, and this guards the
// purge with a flag, because the other cause of a 404 here is a genuinely
// broken deploy at the edge, where reloading gets the same broken page back.
// A recovery that loops is worse than the fault it is recovering from.
let deadBuildHandled = false;
async function onDeadBuildAsset() {
  if (deadBuildHandled) return;
  deadBuildHandled = true;
  try {
    await caches.delete(SHELL);
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) client.postMessage({ type: "hm-stale-build" });
  } catch {
    /* best effort — a failed recovery must not also break the response */
  }
}

/**
 * How long a navigation waits for the network before the cached copy wins.
 *
 * `fetch` has no timeout of its own, so "network-first" against a host that
 * accepts the connection and then says nothing meant waiting out the browser's
 * own limit — a minute and more — on a blank tab, with a perfectly good cached
 * copy of the page sitting one line below in this function. The whole point of
 * a fallback is that it is reachable.
 *
 * This does NOT loosen the rule in the header. A finance app must never serve
 * yesterday's balance from a cache when today's is one request away, and it
 * still does not: the network is asked first, every time, and only a network
 * that has FAILED to answer within the budget hands over. Three seconds is well
 * past a warm origin render (~100 ms measured) and past a Passenger cold start
 * (~3 s is the reason it is not two).
 */
const NAV_TIMEOUT_MS = 3000;

/**
 * Is this a page that rendered WITHOUT the household's data?
 *
 * A React Server Component cannot set a status code, so the "we can't reach
 * your records" screen (app/DegradedNotice.tsx) comes back as a perfectly
 * ordinary 200 — and this worker cached it like any other. That is worse than
 * showing it: an outage OVERWROTE the last good copy of the dashboard, so the
 * next time that household opened the app with no signal, the offline fallback
 * they got was an error page instead of yesterday's balances. The outage
 * outlived itself, in a cache, on a phone.
 *
 * `data-hm-degraded` is the marker the notice carries for exactly this. Read
 * from a CLONE, so the response handed to the page is untouched, and only the
 * first chunk — the attribute is in the first element of <body>, and streaming
 * a whole dashboard through here to check a flag would cost more than the flag
 * is worth.
 */
async function isDegraded(res) {
  const type = res.headers.get("content-type") || "";
  if (!type.includes("text/html")) return false;
  try {
    const reader = res.clone().body?.getReader();
    if (!reader) return false;
    const { value } = await reader.read();
    reader.cancel();
    return new TextDecoder().decode(value || new Uint8Array()).includes("data-hm-degraded");
  } catch {
    // Unreadable for any reason — treat as fine to cache, which is exactly the
    // behaviour this worker had before the check existed.
    return false;
  }
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    // Not AbortSignal.timeout on the fetch itself: aborting would also cancel
    // the request, and this request is the thing that repopulates the cache.
    // Racing lets the answer keep arriving and be stored even after the reader
    // has already been given the cached page.
    const live = fetch(request);
    live
      .then(async (res) => {
        if (res && res.status === 200 && !(await isDegraded(res))) {
          cache.put(request, res.clone());
        }
      })
      .catch(() => undefined);

    const res = await Promise.race([
      live,
      new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS)),
    ]);
    if (res) return res;

    // The budget ran out. A cached page beats a blank tab; nothing cached means
    // we go on waiting, because an offline page would be a lie while a real
    // response is still in flight.
    const stale = await cache.match(request);
    if (stale) return stale;
    return await live;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;
    let offline = await cache.match(OFFLINE_KEY);
    // A worker that installed before this fix, or one whose install ran while
    // the network was already failing, has no offline page. Try once more here
    // rather than serving bare text forever.
    if (!offline) {
      await cacheOfflinePage(cache).catch(() => false);
      offline = await cache.match(OFFLINE_KEY);
    }
    return (
      offline ??
      new Response("Offline, and no cached copy of this page.", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Someone else's origin is someone else's business. Range requests are for
  // media seeking and a partial response in a cache is a corrupt one.
  if (url.origin !== self.location.origin) return;
  if (request.headers.has("range")) return;

  // Never, under any circumstance, cache the API. See the header.
  if (url.pathname.startsWith("/api/")) return;

  if (isOcr(url)) {
    event.respondWith(cacheFirst(request, OCR));
    return;
  }
  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  }
});

// Deliberate, user-initiated download of the OCR engine, triggered from
// Settings. Reports progress back so the button can say something truthful
// rather than spinning for 28 MB.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "cache-ocr") return;
  event.waitUntil(
    (async () => {
      const client = event.source;
      try {
        const manifest = await fetch("/ocr/manifest.json").then((r) => r.json());
        const cache = await caches.open(OCR);
        let done = 0;
        for (const file of manifest.files) {
          const url = `/ocr/${file}`;
          if (!(await cache.match(url))) {
            const res = await fetch(url);
            if (res.status === 200) await cache.put(url, res.clone());
          }
          done++;
          client?.postMessage({ type: "cache-ocr-progress", done, total: manifest.files.length });
        }
        client?.postMessage({ type: "cache-ocr-done", files: manifest.files.length });
      } catch (err) {
        client?.postMessage({ type: "cache-ocr-failed", error: String(err) });
      }
    })(),
  );
});
