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

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(web, "public", "ocr");
const APPLY = process.argv.includes("--apply");

// Copied from node_modules rather than downloaded: they are already pinned by
// package-lock, so taking them from disk means the served worker is exactly the
// version the app was built against. A downloaded copy could drift.
const LOCAL = [
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["tesseract.js-core/tesseract-core-simd.wasm", "tesseract-core-simd.wasm"],
  ["tesseract.js-core/tesseract-core-simd.js", "tesseract-core-simd.js"],
  ["tesseract.js-core/tesseract-core.wasm", "tesseract-core.wasm"],
  ["tesseract.js-core/tesseract-core.js", "tesseract-core.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm", "tesseract-core-simd-lstm.wasm"],
  ["tesseract.js-core/tesseract-core-simd-lstm.js", "tesseract-core-simd-lstm.js"],
  ["tesseract.js-core/tesseract-core-lstm.wasm", "tesseract-core-lstm.wasm"],
  ["tesseract.js-core/tesseract-core-lstm.js", "tesseract-core-lstm.js"],
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
