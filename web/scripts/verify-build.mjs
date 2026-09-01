// Compile-check a change WITHOUT taking the live site down.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
//
// `npm run build` is not a safe thing to run on this machine, and that is
// counter-intuitive enough that it keeps catching people out.
//
// The laptop is the ORIGIN for honeymoney.app. `/_next/static/*` is served by
// the Cloudflare Pages snapshot, not by the origin — so the two must agree on
// content-hashed filenames. A build renames all of them. The moment `.next` is
// rebuilt and the origin restarts, the origin serves HTML pointing at chunks
// the snapshot has never heard of: the stylesheet 404s, the client bundle 404s,
// and every route in the app renders as unstyled HTML that never hydrates. The
// login form does not submit and the hamburger menu does not open, because
// there is no React on the page.
//
// deploy/pages/README.md has warned about this since 2026-08-25 and offers the
// remedy — build into a scratch directory instead. It happened anyway on
// 2026-09-01, during a session where `npm run build` was run several times just
// to confirm some new code compiled. A documented remedy that requires
// remembering a environment variable at the moment you are thinking about
// something else is not a remedy; it needs to be the easier thing to type.
//
//   npm run verify      ← compiles into .next-verify, leaves .next untouched
//   npm run build       ← the real thing; follow it with site:publish
//
// `next build` also rewrites tsconfig.json as a side effect, so that is put
// back afterwards — otherwise a verify run leaves the tree dirty and the next
// `git status` is confusing for reasons that have nothing to do with the work.

import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TSCONFIG = path.join(WEB, "tsconfig.json");

const before = readFileSync(TSCONFIG, "utf8");

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "build"],
  {
    cwd: WEB,
    stdio: "inherit",
    // The whole point: a separate output directory, so `.next` — the one the
    // running origin is serving — is never renamed underneath it.
    env: { ...process.env, NEXT_DIST_DIR: ".next-verify" },
  },
);

child.on("exit", (code) => {
  const after = readFileSync(TSCONFIG, "utf8");
  if (after !== before) {
    writeFileSync(TSCONFIG, before);
    console.log("\n(restored tsconfig.json — next build rewrites it)");
  }
  if (code === 0) {
    console.log(
      "\n✓ compiles. .next was NOT touched, so the live site is unaffected.\n" +
        "  To actually ship: npm run build && restart the origin && npm run site:publish\n",
    );
  }
  process.exit(code ?? 1);
});

// Keep a reference so lint does not flag the import as unused if the block
// above is ever refactored to drop it.
void execFileSync;
