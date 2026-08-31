import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This repo is built on the same machine that serves the live site, and
  // `next start` serves out of the build directory it finds. So a plain
  // `npm run build` to check that a change compiles overwrites the build the
  // public site is currently running on — honeymoney.app goes down mid-build,
  // for a check that was never meant to deploy anything.
  //
  // Default is unchanged. Set NEXT_DIST_DIR to build somewhere harmless:
  //   NEXT_DIST_DIR=.next-verify npm run build
  //
  // One wrinkle: next build appends the dist dir's generated types to
  // tsconfig.json's `include` and reformats the file while it's there. That
  // edit is noise from a throwaway build — `git checkout -- tsconfig.json`
  // afterwards.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // DOM Cloud gives 1.5 GB on the free tier and 5 GiB on Lite, and a default
  // Next.js build does not fit: measured 2026-08-23, `.next` is 713 MB and
  // `node_modules` 587 MB — 1.3 GB before PocketBase, `pb_data` or one receipt.
  // `standalone` emits `.next/standalone` containing the server plus only the
  // modules actually reached — 65 MB measured, and `node_modules` never ships.
  //
  // OPT-IN, and that is not tidiness. This machine serves the live site with
  // `next start` (deploy/start-honeymoney.ps1), and Next refuses that pairing:
  //   "next start" does not work with "output: standalone" configuration.
  // Setting it unconditionally would put honeymoney.app on a path its own
  // framework warns about, to benefit a host this laptop is not.
  // deploy/domcloud/push-build.ps1 sets NEXT_STANDALONE=1 for its build only.
  ...(process.env.NEXT_STANDALONE
    ? {
        output: "standalone" as const,
        // The bundle is built on this Windows x64 laptop and runs on DOM Cloud's
        // ARM64 host, so any NATIVE binary the tracer pulls in is not merely
        // dead weight — it is dead weight for the wrong CPU. Measured in the
        // staged bundle: exactly one, `@img/sharp-win32-x64/lib/*.node`.
        //
        // Nothing at runtime wants it. `images: { unoptimized: true }` below
        // means Next never invokes the image optimiser, and the only `import
        // sharp` in this repo is scripts/generate-icons.mjs, which runs here at
        // build time and never ships. The tracer includes it conservatively.
        //
        // Excluded rather than left in place: shipping a win32 .node to an ARM
        // host is at best confusing to whoever debugs this next, and if
        // anything ever did load it the failure would be about architecture
        // instead of about the missing dependency it actually is.
        outputFileTracingExcludes: {
          "*": ["node_modules/@img/**", "node_modules/sharp/**"],
        },
      }
    : {}),

  // Start the real fetch on finger-DOWN, not finger-up.
  //
  // Next already pings its prefetcher when a pointer lands on a Link — hover on
  // a mouse, touchstart on a phone. By default that pulls only the route's
  // loading boundary, i.e. the skeleton we were going to show anyway. This
  // upgrades that same intent to a full prefetch of the page.
  //
  // What it buys on a phone: a tap physically takes 70-120 ms between finger
  // down and finger up, and a warm origin render of these routes measures
  // 30-100 ms. Spending the tap's own duration on the fetch is often the whole
  // fetch — the content is there when the finger lifts, and the navigation is
  // a swap rather than a wait.
  //
  // Deliberately NOT the same thing as prefetching everything in the viewport.
  // This fires on intent, so nothing is fetched that a pointer was not aimed
  // at, and the origin does no speculative work for links nobody touches.
  experimental: {
    dynamicOnHover: true,

    // ── THE BACK BUTTON, AND THE TAB YOU JUST CAME FROM ────────────────────
    //
    // Next 16 ships `staleTimes.dynamic` at 0, which means the client router
    // cache keeps a dynamically-rendered page for no time at all. Every route
    // in this app that matters is `force-dynamic`, so Dashboard -> H-Score ->
    // Dashboard was three renders in Singapore for two distinct pages, and the
    // third one re-fetched figures that were seconds old and had not moved.
    //
    // Measured 2026-08-31 from KL: the edge answers its snapshot in 119ms, and
    // an origin round trip is the entire rest of the wait. Not making the trip
    // is the only version of that which is free.
    //
    // ── WHY 60 SECONDS IS NOT A STALE BALANCE ─────────────────────────────
    //
    // The number that would be dangerous here is one that outlives a WRITE, and
    // it cannot: `router.refresh()` drops the whole client router cache, and
    // every path in this app that changes money already calls it —
    // dashboard/AddTransaction (which is also what /record renders),
    // records/RecordRow, goals/GoalsManager, graph/FlexibleInput,
    // import/StatementImport, household/HouseholdManager. So the cache can only
    // ever hold figures that nothing has changed since they were read.
    //
    // What is left is another household member writing on their own device
    // inside the same minute, which this page would not have shown live anyway
    // — there is no subscription here, only a render.
    //
    // Set both to 0 to restore Next's default behaviour exactly.
    staleTimes: {
      dynamic: 60,
      // Prefetched-in-full entries (`prefetch`) — the floor Next enforces is
      // 30, and going much above it would keep a prefetch alive long after the
      // intent that triggered it.
      static: 180,
    },
  },

  // Security headers, set at the origin rather than at the edge.
  //
  // WHY HERE: deploy/pages/_headers covers what Cloudflare Pages serves itself
  // — the static snapshot. Every signed-in route (/dashboard, /setup, /sharing,
  // /api/*) is PROXIED to this server by _worker.js, and a proxied response
  // carries the origin's headers, not the edge's. Measured 2026-08-27:
  // honeymoney.app/setup came back with no security headers at all. Setting
  // them here is the only place that covers both paths.
  //
  // Deliberately NOT a full Content-Security-Policy. A real CSP for Next.js
  // needs per-request nonces threaded through the document, and a half-done one
  // either breaks hydration or is trivially bypassed — both worse than the
  // targeted directives below. `frame-ancestors` is the exception: it cannot
  // break rendering and it is the clickjacking defence that matters for an app
  // showing somebody's bank balances.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The terms now say "traffic is encrypted in transit". HSTS is what
          // makes that an enforced fact rather than a hope — without it the
          // first request of a session can still be downgraded to plaintext.
          // No `preload`: that is a one-way submission to a browser-vendor list
          // and is not a decision to take on a household's behalf mid-pilot.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Both, because X-Frame-Options is what older browsers honour and
          // frame-ancestors is what current ones do.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The camera is genuinely used — receipt capture — so it stays for
          // this origin. Everything else a finance app has no business asking
          // for is denied outright rather than left to a permission prompt.
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()",
          },
        ],
      },
      {
        // Never let a signed-in page or an API response sit in a shared cache.
        // On a household device this is the difference between "log out" and
        // "log out, and the next person presses Back".
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
        ],
      },
    ];
  },

  // pdfjs (statement import) does its own conditional loading of Node built-ins
  // and expects to resolve its .mjs entry at runtime. Bundling it breaks both.
  serverExternalPackages: ["pdfjs-dist"],

  // next/image's optimizer is a server route (/_next/image). The public pages
  // are snapshotted to a static host that has no server (see
  // scripts/build-static-site.mjs), so an optimized <Image> would 404 there
  // exactly when the origin is down — the one moment the snapshot has to work.
  // We serve a handful of already-sized assets, so this costs us little.
  images: { unoptimized: true },
};

export default nextConfig;
