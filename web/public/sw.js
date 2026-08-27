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

const VERSION = "hm-v4";
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
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(request);
    if (res && res.status === 200) cache.put(request, res.clone());
    return res;
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
