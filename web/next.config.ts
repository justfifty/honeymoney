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
