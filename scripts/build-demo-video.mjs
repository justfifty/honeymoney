#!/usr/bin/env node
/**
 * Build the competition demo MP4 from the LIVE site — real screens, no mockups.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT. This produces a captioned explainer: real
 * screenshots of honeymoney.app, held and cross-faded, with a caption bar. It is
 * NOT the narrated walkthrough docs/deck/DEMO_SCRIPT.md describes — that needs a
 * human voice and a live screen recording, and no script can fake either. Treat
 * this as the artefact that is always current and always truthful, and record
 * the narrated one on top of it when there is time.
 *
 * WHY PRODUCTION SCREENSHOTS rather than a staged local build: the demo-video
 * skill's first rule is "only real screens". A frame captured from the live URL
 * cannot drift from what a judge sees when they open the link — which is exactly
 * how the July video went stale without anyone noticing.
 *
 *   node scripts/build-demo-video.mjs            capture + encode
 *   node scripts/build-demo-video.mjs --no-shoot reuse the frames already taken
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORK = path.join(ROOT, ".demo-video");
const OUT = path.join(ROOT, "docs", "deck", "HoneyMoney_Demo_MAIC2026.mp4");
const SITE = process.env.DEMO_SITE || "https://honeymoney.app";
const shoot = !process.argv.includes("--no-shoot");

const CHROME =
  process.env.CHROME ||
  ["C:/Program Files/Google/Chrome/Application/chrome.exe",
   "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!CHROME) throw new Error("No Chrome/Edge found. Set CHROME=<path>.");

const W = 1920, H = 1080, FPS = 30, XFADE = 0.6;

// Pages are captured TALL and cropped per shot. Chrome's --screenshot cannot
// scroll, so "show the part further down the page" is done by rendering a tall
// viewport once and taking a different 1080-high window out of it. It also means
// one capture serves several shots of the same page.
const SHOT_H = 2800;

// drawtext needs an explicit font on Windows: there is no fontconfig config
// here, so without fontfile= ffmpeg dies with "Fontconfig error: Cannot load
// default config file" — nothing to do with the text. Segoe UI rather than
// Arial because the captions carry → and ·.
const FONT = ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"].find(existsSync);
if (!FONT) throw new Error("No caption font found under C:/Windows/Fonts.");
const FONTARG = FONT.replace(/:/g, "\\\\:");

/**
 * The beat sheet: hook → problem → solution → proof → scale → CTA.
 * `y` is how far down the captured page this shot looks.
 */
const SHOTS = [
  { page: "/",      y: 0,    hold: 4.5, cap: "Money is the #1 source of conflict in Malaysian households." },
  { page: "/",      y: 260,  hold: 4.5, cap: "Snap it or type it — one line, not a spreadsheet." },
  { page: "/demo",  y: 60,   hold: 5.0, cap: "Four real households, a year of spending each. No sign-up." },
  { page: "/demo",  y: 520,  hold: 5.0, cap: "H-Score: one number for how the month is really going." },
  { page: "/graph", y: 120,  hold: 5.0, cap: "Underneath is a living knowledge graph, not a flat list." },
  { page: "/graph", y: 700,  hold: 4.5, cap: "Income → three buckets → where the money actually lands." },
  { page: "/guide", y: 200,  hold: 4.5, cap: "On-device receipt scanning. Zero AI tokens. Private by design." },
  { page: "/",      y: 0,    hold: 4.5, cap: "Live 24/7 · honeymoney.app · MAIC Nexus 2026 · Track T3" },
];

const pages = [...new Set(SHOTS.map((s) => s.page))];
const pageFile = (p) => path.join(WORK, "page" + p.replace(/[^a-z0-9]/gi, "_") + ".png");

if (shoot) {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  for (const p of pages) {
    execFileSync(CHROME, [
      "--headless", "--disable-gpu", "--hide-scrollbars",
      // A fresh profile each time: an established one shows the PWA install
      // banner over the lower-right of every page.
      `--user-data-dir=${path.join(WORK, "prof" + p.replace(/[^a-z0-9]/gi, "_"))}`,
      `--window-size=${W},${SHOT_H}`,
      // Load-bearing: the hero copy fades in, and a screenshot taken before that
      // finishes catches the headline at ~15% opacity. It looks like a contrast
      // bug and is not one.
      "--virtual-time-budget=8000",
      `--screenshot=${pageFile(p)}`,
      SITE + p,
    ], { stdio: "ignore" });
    if (!existsSync(pageFile(p))) throw new Error(`capture failed: ${p}`);
    console.log(`  captured ${p}`);
  }
}
for (const p of pages) if (!existsSync(pageFile(p))) throw new Error(`missing frame for ${p} — run without --no-shoot`);

const esc = (t) => t.replace(/[\\:']/g, (c) => "\\" + c).replace(/,/g, "\\,");

// 1. Each shot becomes a still: crop the right slice of its page, hold it.
const filters = SHOTS.map((s, i) =>
  `[${i}:v]crop=${W}:${H}:0:${s.y},setsar=1,fps=${FPS},format=yuv420p[v${i}]`,
);

// 2. Cross-fade the IMAGERY only.
let prev = "v0", acc = SHOTS[0].hold;
const starts = [0];
for (let i = 1; i < SHOTS.length; i++) {
  const out = `x${i}`;
  filters.push(`[${prev}][v${i}]xfade=transition=fade:duration=${XFADE}:offset=${(acc - XFADE).toFixed(2)}[${out}]`);
  starts.push(acc - XFADE);
  acc += SHOTS[i].hold - XFADE;
  prev = out;
}

// 3. Captions go on AFTERWARDS, switched by timestamp rather than faded.
//    Burning them in before the xfade made two captions dissolve THROUGH each
//    other at every transition — legible in neither state. Drawing them on the
//    finished stream with enable=between() gives a clean cut instead, and the
//    caption bar stays put while the picture behind it changes.
let chain = prev;
filters.push(`[${chain}]drawbox=y=ih-150:w=iw:h=150:color=black@0.82:t=fill[bg]`);
chain = "bg";
SHOTS.forEach((s, i) => {
  const from = i === 0 ? 0 : starts[i] + XFADE / 2;
  const to = i === SHOTS.length - 1 ? acc + 1 : starts[i + 1] + XFADE / 2;
  const out = i === SHOTS.length - 1 ? "vout" : `c${i}`;
  filters.push(
    `[${chain}]drawtext=fontfile=${FONTARG}:text='${esc(s.cap)}':` +
    `fontcolor=white:fontsize=42:x=(w-text_w)/2:y=h-97:` +
    `enable='between(t,${from.toFixed(2)},${to.toFixed(2)})'[${out}]`,
  );
  chain = out;
});

const args = [];
SHOTS.forEach((s) => args.push("-loop", "1", "-t", String(s.hold), "-i", pageFile(s.page)));
args.push("-filter_complex", filters.join(";"), "-map", "[vout]",
  "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
  "-movflags", "+faststart", "-r", String(FPS), "-y", OUT);

console.log(`\n  encoding ${SHOTS.length} shots → ${path.relative(ROOT, OUT)} (~${acc.toFixed(1)}s)`);
execFileSync("ffmpeg", args, { stdio: ["ignore", "ignore", "ignore"] });
writeFileSync(path.join(WORK, "beats.json"), JSON.stringify({ site: SITE, runtime: acc, shots: SHOTS }, null, 2));
console.log("  done.");
