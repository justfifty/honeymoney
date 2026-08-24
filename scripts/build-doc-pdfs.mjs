// Export the two one-page MAIC documents to PDF.
//
//   node scripts/build-doc-pdfs.mjs           # write both PDFs
//   node scripts/build-doc-pdfs.mjs --check   # verify the current PDFs only
//
// The project summary and the AI disclosure are each capped at 500 words by the
// competition and at ONE PAGE by their own layout, which is a tighter constraint
// than it sounds: PROJECT_SUMMARY.html is set at 9.6pt with 13mm margins
// precisely to fit, so a sentence added anywhere can push the last paragraph
// onto a second page or off the bottom entirely.
//
// That is why this exists rather than another hand export. scripts/check-summary
// -words.mjs already guards the word count; this guards the thing the word count
// cannot see — whether the words that survived actually appear in the PDF.
//
// The deck has its own script (build-deck-pdf.mjs): it stages downscaled images,
// carries a 5 MB ceiling, and expects 13 pages. Sharing one script would mean a
// page-count rule that fits neither.

import { execFileSync } from "node:child_process";
import { existsSync, copyFileSync, statSync, rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import { tmpdir } from "node:os";
import { clipped, pdfStats } from "./lib/pdf-check.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = dirname(here);
const DECK = join(repo, "docs", "deck");

const TARGETS = [
  { html: "PROJECT_SUMMARY.html", pdf: "HoneyMoney_Project_Summary_MAIC2026.pdf" },
  { html: "AI_DISCLOSURE.html", pdf: "HoneyMoney_AI_Disclosure_MAIC2026.pdf" },
];

// One page each. Two pages means the layout broke, and a judge reading a
// "one-page summary" that runs to two has been told something untrue before
// they reach the first sentence.
const MAX_PAGES = 1;
const MIN_WORDS = 200;

const CHROME =
  process.env.CHROME ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);

const kb = (b) => `${Math.round(b / 1024)} KB`;

function verify(pdfPath, htmlPath) {
  const { words, pages } = pdfStats(pdfPath);
  console.log(`   ${basename(pdfPath)}  ${kb(statSync(pdfPath).size)} · ${pages}p · ${words} words`);
  const problems = [];
  if (pages > MAX_PAGES) problems.push(`${pages} pages — this must fit on one`);
  if (words > 0 && words < MIN_WORDS) problems.push(`only ${words} words — likely rasterised`);
  problems.push(...clipped(pdfPath, htmlPath));
  return problems;
}

const checkOnly = process.argv.includes("--check");
if (!checkOnly && !CHROME) throw new Error("No Chrome/Edge found. Set CHROME=<path>.");

console.log(`\n📄 MAIC one-page documents${checkOnly ? " — check only" : ""}\n`);

let failed = false;
for (const t of TARGETS) {
  const htmlPath = join(DECK, t.html);
  const outPath = join(DECK, t.pdf);

  if (checkOnly) {
    const problems = verify(outPath, htmlPath);
    if (problems.length) {
      failed = true;
      console.error("     ✗ " + problems.join("\n     ✗ "));
    }
    continue;
  }

  const work = join(tmpdir(), `hm-doc-${process.pid}-${t.html}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const tmpPdf = join(work, "out.pdf");

  execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--run-all-compositor-stages-before-draw",
      // Same reason as the deck: without it Chrome prints before webfonts settle.
      "--virtual-time-budget=15000",
      "--no-pdf-header-footer",
      `--print-to-pdf=${tmpPdf}`,
      `file:///${htmlPath.replace(/\\/g, "/")}`,
    ],
    { stdio: "ignore" },
  );

  if (!existsSync(tmpPdf)) throw new Error(`Chrome produced no PDF for ${t.html}`);

  const problems = verify(tmpPdf, htmlPath);
  if (problems.length) {
    failed = true;
    console.error("     ✗ " + problems.join("\n     ✗ "));
    console.error(`     left for inspection: ${tmpPdf}`);
    continue;
  }

  try {
    copyFileSync(tmpPdf, outPath);
    rmSync(work, { recursive: true, force: true });
  } catch (err) {
    // A PDF open in a viewer holds a Windows lock. The raw EPERM buries the one
    // useful instruction: close it and run again.
    if (err?.code === "EBUSY" || err?.code === "EPERM") {
      failed = true;
      console.error(`     ✗ ${t.pdf} is open in another program — close it and re-run.`);
      console.error(`       Built fine, waiting at: ${tmpPdf}`);
      continue;
    }
    throw err;
  }
}

if (failed) process.exit(1);
console.log(`\n✅ ${checkOnly ? "Both documents pass." : "Both documents written."}`);
console.log(`   Sync to the live site with: node scripts/sync-deck-pdfs.mjs\n`);
