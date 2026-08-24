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
