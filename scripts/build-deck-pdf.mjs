// Export docs/deck/PITCH_DECK.html to a submission-sized PDF.
//
// WHY THIS SCRIPT EXISTS. The deck was previously exported by hand from
// Chrome's print dialog, which is not reproducible: the 2026-08-24 export came
// out at 10.8 MB against a 5 MB submission ceiling, and an earlier hand export
// came out RASTERISED -- 0 extractable words, 2 pages -- which nobody noticed
// until it had already been synced to the live site. Both failures are the same
// failure: a manual step with no check on the result.
//
// WHERE THE SIZE ACTUALLY COMES FROM. Not the source images -- deck_assets is
// only 3.1 MB in total. Chrome RE-ENCODES every image when it prints, at a
// quality well above what the source was saved at, so a 382 KB JPEG landed in
// the PDF at 1904 KB. Compressing the sources harder therefore does nothing;
// Chrome throws that away and re-encodes. The only lever that survives the
// round trip is PIXEL DIMENSIONS, because Chrome re-encodes at the size it is
// given. So this script downscales into a staging copy and prints from there.
//
// The originals are never touched. Everything happens in a temp directory, and
// the HTML is copied beside the optimised assets so its relative
// `deck_assets/...` paths keep working with no rewriting.
//
//   node scripts/build-deck-pdf.mjs            # write the PDF
//   node scripts/build-deck-pdf.mjs --check    # verify the current PDF only
//
// Chrome/Edge is required. ImageMagick is OPTIONAL: the file sits well under
// the ceiling once Chrome honours the deck's own @page size, and the
// downscaling below is headroom for when a slide gains another photo.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, basename } from "node:path";
import { tmpdir } from "node:os";
import { clipped, pdfStats } from "./lib/pdf-check.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = dirname(here);
const DECK = join(repo, "docs", "deck");
const HTML = join(DECK, "PITCH_DECK.html");
const ASSETS = join(DECK, "deck_assets");
const OUT = join(DECK, "HoneyMoney_Pitch_Deck_MAIC2026.pdf");

// The submission ceiling, with room to spare. A file that lands at 4.98 MB
// passes today and fails the next time a slide gains a photo.
const MAX_BYTES = 5 * 1024 * 1024;
const TARGET_BYTES = 4.2 * 1024 * 1024;

// 13.333in page at 150 ppi = 2000 px. That is already generous for a deck read
// on a laptop or thrown at a projector; the 3000 px originals were carrying
// detail no viewer will ever resolve.
const MAX_WIDTH = 2000;
const JPEG_QUALITY = 82;

const CHROME =
  process.env.CHROME ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);

const mb = (b) => `${(b / 1024 / 1024).toFixed(2)} MB`;

// `convert` on Windows is the FAT-to-NTFS conversion utility, NOT ImageMagick,
// and it fails noisily rather than usefully. Probing for the ImageMagick banner
// stops this script quietly copying every asset unchanged while printing
// sixteen "Invalid Parameter" lines and then reporting success — which is
// exactly what it did on its first run.
const MAGICK = ["magick", "convert"].find((bin) => {
  try {
    const out = execFileSync(bin, ["-version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return /ImageMagick/i.test(out);
  } catch {
    return false;
  }
});

/** Verify a finished PDF is actually usable, not merely small. */
function verify(pdf) {
  const size = statSync(pdf).size;
  const { words, pages } = pdfStats(pdf);
  console.log(`   size:  ${mb(size)}`);
  console.log(`   pages: ${pages}`);
  console.log(`   words: ${words}`);

  const problems = [];
  if (size > MAX_BYTES) problems.push(`over the ${mb(MAX_BYTES)} ceiling`);
  problems.push(...clipped(pdf, HTML));
  // The rasterisation tripwire. A deck that exports as pictures of text has no
  // extractable words, looks fine in a viewer, and is unreadable to anything
  // that indexes or reflows it. It has happened here once already.
  if (words > 0 && words < 200) problems.push(`only ${words} extractable words — likely rasterised`);
  if (pages > 0 && pages < 8) problems.push(`only ${pages} pages — slides were dropped or merged`);
  return problems;
}

if (process.argv.includes("--check")) {
  console.log(`\nChecking ${basename(OUT)}`);
  const problems = verify(OUT);
  if (problems.length) {
    console.error("\n✗ " + problems.join("\n✗ "));
    process.exit(1);
  }
  console.log("\n✅ Deck PDF is within limits and not rasterised.");
  process.exit(0);
}

if (!CHROME) throw new Error("No Chrome/Edge found. Set CHROME=<path>.");

const work = join(tmpdir(), `hm-deck-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, "deck_assets"), { recursive: true });

if (!MAGICK) {
  console.log("   ⚠ ImageMagick not found - assets copied at full size, no downscaling.");
  console.log("     Chrome honouring @page is what keeps the file small today; install");
  console.log("     ImageMagick if a future slide pushes it past the ceiling.");
}

console.log(`\n📄 HoneyMoney deck → PDF\n   staging: ${work}\n`);

// 1. Downscale into the staging copy. Anything already narrow enough is copied
//    verbatim rather than re-encoded, so small logos and icons do not lose a
//    generation of quality for no size benefit.
let before = 0;
let after = 0;
for (const name of readdirSync(ASSETS)) {
  const src = join(ASSETS, name);
  const dst = join(work, "deck_assets", name);
  const ext = extname(name).toLowerCase();
  before += statSync(src).size;

  if (!MAGICK || ![".jpg", ".jpeg", ".png"].includes(ext)) {
    copyFileSync(src, dst);
    after += statSync(dst).size;
    continue;
  }

  let width = 0;
  try {
    width = Number(execFileSync(MAGICK, [src, "-format", "%w", "info:"], { encoding: "utf8" }).trim());
  } catch {
    /* fall through to a straight copy */
  }

  if (!width || width <= MAX_WIDTH) {
    copyFileSync(src, dst);
  } else {
    const args = [src, "-resize", `${MAX_WIDTH}x>`, "-strip"];
    // PNGs here carry transparency (the PDF shows them with an smask), so they
    // stay PNG. Flattening them onto white would put a hard rectangle behind
    // every logo on a tinted banner.
    if (ext !== ".png") args.push("-quality", String(JPEG_QUALITY), "-interlace", "none");
    execFileSync(MAGICK, [...args, dst]);
  }
  const sz = statSync(dst).size;
  after += sz;
  if (width > MAX_WIDTH) console.log(`   ↓ ${name.padEnd(14)} ${width}px → ${MAX_WIDTH}px`);
}
console.log(`\n   assets: ${mb(before)} → ${mb(after)}\n`);

copyFileSync(HTML, join(work, "PITCH_DECK.html"));

// 2. Print. --virtual-time-budget is not optional: without it Chrome prints
//    before webfonts and images settle, which is how an earlier export produced
//    a faint hero headline that looked like a contrast bug.
const tmpPdf = join(work, "out.pdf");
execFileSync(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=15000",
    "--no-pdf-header-footer",
    `--print-to-pdf=${tmpPdf}`,
    `file:///${join(work, "PITCH_DECK.html").replace(/\\/g, "/")}`,
  ],
  { stdio: "ignore" },
);

if (!existsSync(tmpPdf)) throw new Error("Chrome produced no PDF.");

console.log(`Result`);
const problems = verify(tmpPdf);
if (problems.length) {
  console.error("\n✗ " + problems.join("\n✗ "));
  console.error(`\nLeft in place for inspection: ${tmpPdf}`);
  process.exit(1);
}

// A PDF open in a viewer holds a Windows lock, and the raw EBUSY stack trace
// buries the one thing that matters: close the file and run it again. The build
// itself succeeded, so the temp copy is named rather than discarded.
try {
  copyFileSync(tmpPdf, OUT);
} catch (err) {
  if (err?.code === "EBUSY" || err?.code === "EPERM") {
    console.error(`\n✗ ${basename(OUT)} is open in another program — close it and re-run.`);
    console.error(`  The new PDF built fine and is waiting at: ${tmpPdf}`);
    process.exit(1);
  }
  throw err;
}
rmSync(work, { recursive: true, force: true });
const finalSize = statSync(OUT).size;
console.log(`\n✅ Wrote ${OUT}`);
if (finalSize > TARGET_BYTES) {
  console.log(
    `   Note: ${mb(finalSize)} is under the ${mb(MAX_BYTES)} ceiling but over the ${mb(
      TARGET_BYTES,
    )} comfort target — lower MAX_WIDTH if a slide gains another photo.`,
  );
}
console.log(`   Sync to the live site with: npm run deck:sync\n`);
