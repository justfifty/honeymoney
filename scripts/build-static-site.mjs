#!/usr/bin/env node
// Build the always-on static snapshot of HoneyMoney's public pages.
//
// Why this exists: honeymoney.app is served from a laptop, so the whole site
// disappears whenever that laptop does. The pages a first-time visitor (or a
// judge) actually lands on — the pitch, the guide, the Academy, the gallery,
// the deck — need no database at all. This script renders them from the real
// running app and writes a self-contained copy that Cloudflare Pages serves
// forever, alongside a worker that proxies the genuinely dynamic routes back
// to the laptop (see deploy/pages/_worker.js).
//
// It deliberately snapshots the RUNNING production server rather than
// re-implementing the pages: one source of truth, no drift.
//
//   node scripts/build-static-site.mjs [--base http://localhost:3000]
//
// Prerequisite: `npm run build && npm run start` in web/ (the same server the
// tunnel publishes — deploy/start-honeymoney.ps1 already runs it).

import { mkdir, writeFile, readFile, rm, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "web");
// Which build's client assets go into the snapshot. It MUST be the build that
// the --base origin is serving, or the HTML will reference chunk hashes that
// are not in dist/_next/static, Cloudflare Pages will answer those with its
// fallback HTML at status 200, and the page renders with no stylesheet — which
// is what "the login page is haywire" looked like on 2026-08-24.
//
// It used to be hardcoded to .next, which was right only while the origin was
// this laptop. Now the origin is DOM Cloud, running the bundle push-build.ps1
// makes in .next-dc, and a next.config.ts change was enough to move two chunk
// hashes. Same variable name next.config.ts uses, so the two cannot disagree:
//
//   NEXT_DIST_DIR=.next-dc node scripts/build-static-site.mjs --base https://honeymoney-app.domcloud.dev
// Defaults to .next-dc for the same reason --base defaults to DOM Cloud: that
// is the build the origin runs. `.next` is this laptop's, and pairing it with
// the DOM Cloud origin is precisely the mismatch described above.
const NEXT_STATIC = path.join(WEB, process.env.NEXT_DIST_DIR || ".next-dc", "static");
const PUBLIC = path.join(WEB, "public");
const PAGES = path.join(ROOT, "deploy", "pages");
const DIST = path.join(PAGES, "dist");

// The default is the DOM CLOUD origin, not localhost, because that is what
// honeymoney.app actually proxies to since 2026-08-24. It used to default to
// the laptop, and leaving it that way would mean `npm run site:build` quietly
// snapshots one build while the origin serves another — the failure this file
// now guards against twice over (see NEXT_STATIC above). Pass --base
// http://localhost:3000 deliberately if you are snapshotting the laptop.
const argBase = process.argv.indexOf("--base");
const BASE = (argBase > -1 ? process.argv[argBase + 1] : "https://honeymoney-app.domcloud.dev").replace(/\/+$/, "");

// The public surface: every route here must render without PocketBase, because
// the snapshot has no database behind it. Keep this list and the SNAPSHOT set
// in deploy/pages/_worker.js identical.
// /demo belongs here more than anything else on the list: it is the one public
// page that is a working product rather than a description of one, and it holds
// its data in memory, so it stays fully interactive from the snapshot with the
// origin machine switched off.
// /privacy is in here for a reason that is not performance: a privacy notice
// that is only reachable while the origin happens to be up is not, in any
// meaningful sense, given. It renders from the snapshot so it survives the
// laptop being off, exactly like the pages a first-time visitor lands on.
const ROUTES = ["/", "/demo", "/guide", "/learn", "/gallery", "/deck", "/privacy"];

const log = (...a) => console.log("  ", ...a);

async function main() {
  console.log(`\n📸 HoneyMoney static snapshot\n   source: ${BASE}\n   out:    ${path.relative(ROOT, DIST)}\n`);

  if (!existsSync(NEXT_STATIC)) {
    throw new Error(`No production build found at ${NEXT_STATIC}. Run "npm run build" in web/ first.`);
  }
  await assertServerIsProd();

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  // 1. Render each public route.
  const referenced = new Set();
  for (const route of ROUTES) {
    const html = await fetchText(BASE + route);
    assertRenderable(route, html);
    const out = route === "/" ? "index.html" : path.join(route.slice(1), "index.html");
    await writeFileP(path.join(DIST, out), html);
    for (const u of collectAssets(html)) referenced.add(u);
    log(`✓ ${route.padEnd(9)} → ${out} (${kb(html)})`);
  }

  // 2. Ship the build's client assets wholesale. Scraping <script> tags misses
  //    lazily-imported chunks; copying .next/static cannot.
  await cp(NEXT_STATIC, path.join(DIST, "_next", "static"), { recursive: true });
  log(`✓ .next/static → _next/static`);

  // 3. …and everything in public/ (images, icons, gallery, deck PDFs, demo).
  //
  // The three MAIC upload PDFs are refreshed from docs/deck FIRST, because
  // web/public/deck was a second hand-kept copy of them and duly went stale:
  // on 2026-08-24 the live pitch deck was byte-identical to the JULY 11
  // archive while docs/deck held the current 13-slide export. It failed
  // silently — 200, valid application/pdf, wrong deck — which is the worst way
  // for a judge-facing link to be wrong.
  const { execFileSync } = await import("node:child_process");
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "sync-deck-pdfs.mjs")], {
    stdio: "inherit",
  });

  await cp(PUBLIC, DIST, { recursive: true });
  log(`✓ public/ → /`);

  // 4. Anything else the HTML asked for that we haven't already copied —
  //    favicon/icon/apple-icon and the PWA manifest all live at generated URLs.
  let extra = 0;
  for (const url of referenced) {
    const rel = url.split("?")[0].replace(/^\//, "");
    if (!rel || !path.extname(rel)) continue;
    const dest = path.join(DIST, rel);
    if (existsSync(dest)) continue;
    const body = await fetchBuffer(BASE + url).catch(() => null);
    if (!body) continue;
    await writeFileP(dest, body);
    extra++;
  }
  if (extra) log(`✓ ${extra} extra referenced asset(s)`);

  // The PWA manifest is a route handler, not a file convention — fetch it by name.
  for (const p of ["/manifest.webmanifest", "/favicon.ico"]) {
    const dest = path.join(DIST, p.slice(1));
    if (existsSync(dest)) continue;
    const body = await fetchBuffer(BASE + p).catch(() => null);
    if (body) {
      await writeFileP(dest, body);
      log(`✓ ${p}`);
    }
  }

  // 5. Verify every /_next/static asset the HTML references actually shipped.
  //    A mismatch means the running server is a DIFFERENT build to .next/ —
  //    the snapshot would load but never hydrate, which is worse than failing.
  const missing = [...referenced]
    .filter((u) => u.startsWith("/_next/static/"))
    .map((u) => u.split("?")[0])
    .filter((u) => !existsSync(path.join(DIST, u.slice(1))));
  if (missing.length) {
    throw new Error(
      `${missing.length} referenced chunk(s) are missing from .next/static — the running server is a different build.\n` +
        `Rebuild and restart the app, then re-run this script.\n  e.g. ${missing[0]}`,
    );
  }

  // 6. The worker + caching rules that turn the folder into the site. The
  //    worker's snapshot list is stamped from ROUTES so a page can never be
  //    snapshotted-but-not-served, or served-but-not-snapshotted.
  const worker = await readFile(path.join(PAGES, "_worker.js"), "utf8");
  const stamped = worker.replace(/\/\* @snapshot-routes \*\/ \[[^\]]*\]/, `/* @snapshot-routes */ ${JSON.stringify(ROUTES)}`);
  if (stamped === worker) throw new Error("Couldn't find the @snapshot-routes marker in deploy/pages/_worker.js.");
  await writeFile(path.join(DIST, "_worker.js"), stamped);
  await writeFile(path.join(DIST, "_headers"), HEADERS);
  await writeFile(
    path.join(DIST, "snapshot.json"),
    JSON.stringify({ builtAt: new Date().toISOString(), base: BASE, routes: ROUTES }, null, 2) + "\n",
  );
  log(`✓ _worker.js, _headers, snapshot.json`);

  console.log(`\n✅ Snapshot ready.\n   Preview: cd deploy/pages && npx wrangler pages dev dist\n   Deploy:  cd deploy/pages && npx wrangler pages deploy\n`);
}

// ── helpers ──────────────────────────────────────────────────────────────────

// A dev server renders the same HTML but serves chunks Next never wrote to
// .next/static, so the snapshot would be broken in a way that only shows up in
// the browser. Refuse early.
async function assertServerIsProd() {
  let res;
  try {
    res = await fetch(BASE + "/api/health", { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error(`Can't reach ${BASE}. Start the production app first: cd web && npm run start`);
  }
  if (!res.ok) throw new Error(`${BASE}/api/health returned ${res.status} — is the app healthy?`);
  const html = await fetchText(BASE + "/");
  if (html.includes("/_next/static/chunks/react-refresh") || html.includes("__next_devtools")) {
    throw new Error(`${BASE} is running "next dev". Snapshot the production server (npm run build && npm run start).`);
  }
}

// Catch the failure mode that matters: a page that rendered an error shell, or
// one that quietly lost its chrome because a data call threw.
function assertRenderable(route, html) {
  if (html.length < 2000) throw new Error(`${route} rendered only ${html.length} bytes — something is wrong.`);
  if (!html.includes("<body")) throw new Error(`${route} has no <body> — not a rendered page.`);
  if (/Application error: a (server|client)-side exception/.test(html)) {
    throw new Error(`${route} rendered a Next.js error page. Fix the page, then re-run.`);
  }
}

function collectAssets(html) {
  const out = new Set();
  // Attribute-borne URLs (scripts, styles, icons, images, the manifest)…
  for (const m of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) out.add(m[1]);
  // …plus anything the inline flight data points at.
  for (const m of html.matchAll(/\/_next\/static\/[A-Za-z0-9._\-/]+/g)) out.add(m[0]);
  return out;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "honeymoney-snapshot" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function writeFileP(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}

const kb = (s) => `${Math.round(Buffer.byteLength(s) / 1024)} kB`;

// Content-hashed build output is safe to pin forever; the pages themselves must
// not be, or a stale snapshot outlives the next deploy.
const HEADERS = `/_next/static/*
  Cache-Control: public, max-age=31536000, immutable

/gallery/*.png
  Cache-Control: public, max-age=86400

/deck/*
  Cache-Control: public, max-age=86400

/*
  Cache-Control: public, max-age=0, must-revalidate
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
`;

main().catch((err) => {
  console.error(`\n❌ ${err.message}\n`);
  process.exit(1);
});
