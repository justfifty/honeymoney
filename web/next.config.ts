import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
