import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs (statement import) does its own conditional loading of Node built-ins
  // and expects to resolve its .mjs entry at runtime. Bundling it breaks both.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
