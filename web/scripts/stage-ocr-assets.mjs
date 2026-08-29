// Put the OCR engine on our own origin, so receipt scanning works offline.
//
// THE PROBLEM THIS FIXES: the deck says "Receipt OCR in the browser, zero
// tokens", and it is true — tesseract.js really does run on the device. But by
// default tesseract.js fetches its worker, its WASM core and its language data
// from a CDN at the moment you scan, so the feature that is advertised as
// working without the cloud does not work without the internet. The fallback in
// SpendCapture even says so: "The language pack may not be downloadable
// (offline…)" — and then falls back to English, which also has to be
// downloaded. On a plane, in a basement, or on a Malaysian prepaid SIM that has
// run out of data, the whole thing fails.
//
// Staging the assets here means the service worker can cache them, and after
// one successful scan the device never needs the network for OCR again.
//
//   node scripts/stage-ocr-assets.mjs            # what is missing
//   node scripts/stage-ocr-assets.mjs --apply    # copy + download
//
// Output lands in web/public/ocr/ and is GITIGNORED — 20 MB of language models
// do not belong in the history of a source repository. Re-run it after a fresh
// clone, and on any machine that builds the static snapshot.

import {
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  copyFileSync,
  unlinkSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(web, "public", "ocr");
const APPLY = process.argv.includes("--apply");

// Copied from node_modules rather than downloaded: they are already pinned by
// package-lock, so taking them from disk means the served worker is exactly the
// version the app was built against. A downloaded copy could drift.
//
// ── WHY THE CORE LIST IS READ OUT OF THE WORKER INSTEAD OF WRITTEN HERE ─────
//
// It used to be nine hand-written filenames, and eight of them were the wrong
// ones. tesseract.js-core ships each core THREE ways — `x.js` + `x.wasm` (a
// loader that fetches its binary at runtime) and `x.wasm.js` (the same core with
// the binary inlined) — and the worker only ever reaches for the third. It
// builds the name itself, from the browser's SIMD support:
//
//   corePath + (relaxedSimd ? "/tesseract-core-relaxedsimd-lstm.wasm.js"
//             : simd        ? "/tesseract-core-simd-lstm.wasm.js"
//                           : "/tesseract-core-lstm.wasm.js")
//
// then importScripts() it. So staging `tesseract-core-simd.js` and
// `tesseract-core-simd.wasm` put 12 MB on the origin that nothing can ask for,
// while every name the worker DOES ask for 404'd — and because corePath points
// at our origin for every language, there was no CDN left to fall back to. The
// whole on-device tier failed at "loading tesseract core", one caught exception
// before any pixel of the receipt was read, and the user saw "Scan failed".
// Nothing about it looked like a missing file: public/ocr was full.
//
// The fix is to stop restating the library's own naming scheme. worker.min.js
// contains those literals; take them from there, so a tesseract upgrade that
// renames or adds a core is followed automatically instead of silently leaving
// the app pointing at a directory of files from the previous major.
const CORE_RE = /tesseract-core[a-z0-9-]*\.wasm\.js/g;

function coresTheWorkerAsksFor(workerSrc) {
  const all = [...new Set(workerSrc.match(CORE_RE) ?? [])];
  // The `-lstm` builds are the LSTM-only engine. The others are the legacy
  // Tesseract engine, reachable only via `legacyCore: true`, which SpendCapture
  // never passes — 14 MB for a code path the app does not have.
  const lstm = all.filter((f) => f.includes("-lstm."));
  if (!lstm.length) {
    // Better to stop than to stage nothing and write a manifest that says the
    // engine is complete. An empty core list IS the bug this comment describes.
    throw new Error(
      "Found no tesseract-core-*.wasm.js names in worker.min.js — tesseract.js " +
        "has changed how it loads its core. Read dist/worker.min.js and update CORE_RE.",
    );
  }
  return lstm;
}

const workerRel = "tesseract.js/dist/worker.min.js";
const workerSrc = existsSync(join(web, "node_modules", workerRel))
  ? readFileSync(join(web, "node_modules", workerRel), "utf8")
  : "";
if (!workerSrc) {
  console.log("  ✗ tesseract.js is not installed (run npm install)");
  process.exit(1);
}

const LOCAL = [
  [workerRel, "worker.min.js"],
  ...coresTheWorkerAsksFor(workerSrc).map((f) => [`tesseract.js-core/${f}`, f]),
];

// The "fast" models, not "best". Measured: fast eng is 10.9 MB, best is 12.8 MB,
// and on a phone the accuracy difference on a printed thermal receipt does not
// pay for the extra download or the extra seconds of CPU. A receipt is large
// clean print, which is the case fast models were trained to handle.
//
// Only the two languages a Malaysian household actually scans in. The other
// four app locales still OCR — SpendCapture falls back to English, which reads
// the digits, and the digits are the half that matters. Staging all six would
// be 65 MB to make four rare cases marginally better.
const TESSDATA = "https://tessdata.projectnaptha.com/4.0.0";
const LANGS = ["eng", "msa"];

function human(n) {
  return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} kB`;
}

mkdirSync(OUT, { recursive: true });

let missing = 0;
let staged = 0;

for (const [from, to] of LOCAL) {
  const src = join(web, "node_modules", from);
  const dst = join(OUT, to);
  if (!existsSync(src)) {
    console.log(`  ✗ ${to} — not in node_modules (run npm install)`);
    missing++;
    continue;
  }
  if (existsSync(dst) && statSync(dst).size === statSync(src).size) {
    console.log(`  · ${to} — already staged (${human(statSync(dst).size)})`);
    continue;
  }
  if (!APPLY) {
    console.log(`  ✗ ${to} — would copy (${human(statSync(src).size)})`);
    missing++;
    continue;
  }
  copyFileSync(src, dst);
  staged++;
  console.log(`  ✓ ${to} (${human(statSync(dst).size)})`);
}

for (const lang of LANGS) {
  const name = `${lang}.traineddata.gz`;
  const dst = join(OUT, name);
  if (existsSync(dst) && statSync(dst).size > 1e6) {
    console.log(`  · ${name} — already staged (${human(statSync(dst).size)})`);
    continue;
  }
  if (!APPLY) {
    console.log(`  ✗ ${name} — would download from ${TESSDATA}`);
    missing++;
    continue;
  }
  const res = await fetch(`${TESSDATA}/${name}`);
  if (!res.ok) {
    console.log(`  ✗ ${name} — HTTP ${res.status}`);
    missing++;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  // A truncated language model fails at recognition time with an unhelpful
  // error, long after the download that caused it. Refuse it here instead.
  if (buf.length < 1e6) {
    console.log(`  ✗ ${name} — only ${human(buf.length)}, refusing a truncated model`);
    missing++;
    continue;
  }
  writeFileSync(dst, buf);
  staged++;
  console.log(`  ✓ ${name} (${human(buf.length)})`);
}

// Cores left behind by an earlier tesseract version are not merely wasted disk:
// they are what made the wrong-filenames bug invisible. public/ocr looked full,
// so nobody thought to ask whether it held the files the worker actually loads.
// The directory should contain exactly the current engine and nothing else.
if (APPLY) {
  const keep = new Set(LOCAL.map(([, to]) => to));
  for (const f of readdirSync(OUT)) {
    if (!f.startsWith("tesseract-core") || keep.has(f)) continue;
    unlinkSync(join(OUT, f));
    console.log(`  − ${f} — removed, no tesseract.js version here asks for it`);
  }
}

// A manifest the service worker reads, so the precache list cannot drift from
// what is actually on disk. Hand-maintaining that list in two places is how a
// service worker ends up caching a file that 404s and failing its whole install.
if (APPLY) {
  const files = [...LOCAL.map(([, to]) => to), ...LANGS.map((l) => `${l}.traineddata.gz`)].filter(
    (f) => existsSync(join(OUT, f)),
  );
  writeFileSync(
    join(OUT, "manifest.json"),
    JSON.stringify({ files, langs: LANGS, stagedAt: new Date().toISOString() }, null, 2),
  );
  console.log(`\nmanifest.json lists ${files.length} files.`);
}

console.log(
  APPLY
    ? `\nStaged ${staged} file(s) into public/ocr/.`
    : `\n${missing} file(s) missing. Re-run with --apply to stage them.`,
);
