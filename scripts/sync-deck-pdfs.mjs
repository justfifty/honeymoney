#!/usr/bin/env node
/**
 * Keep the three mandatory MAIC upload PDFs that the SITE serves identical to
 * the ones the repo builds.
 *
 * WHY THIS EXISTS. docs/deck/ is where the PDFs are exported from their HTML
 * sources. web/public/deck/ is what honeymoney.app actually serves. They were
 * two hand-kept copies, and on 2026-08-24 the live pitch deck was found to be
 * byte-identical to HoneyMoney_Pitch_Deck_MAIC2026_Archive1.pdf — the JULY 11
 * archive — while docs/deck held the current 13-slide 16:9 export from Aug 23.
 * The AI disclosure was a month stale too. Nothing had gone wrong loudly: the
 * URLs returned 200 with a valid application/pdf, and a judge following the
 * link would simply have read the wrong deck.
 *
 * A copy that must be updated by remembering is a copy that will be stale.
 *
 *   node scripts/sync-deck-pdfs.mjs           copy docs/deck -> web/public/deck
 *   node scripts/sync-deck-pdfs.mjs --check   exit 1 if any differ
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "docs", "deck");
const DST = path.join(ROOT, "web", "public", "deck");
const check = process.argv.includes("--check");

// Exactly the three the competition requires. Named explicitly rather than
// globbed: docs/deck also holds archives and dated originals, and shipping
// "HoneyMoney_Pitch_Deck_MAIC2026_Archive1.pdf" to the public site is the
// precise failure this file is about.
const FILES = [
  "HoneyMoney_Pitch_Deck_MAIC2026.pdf",
  "HoneyMoney_Project_Summary_MAIC2026.pdf",
  "HoneyMoney_AI_Disclosure_MAIC2026.pdf",
  // The demo video has exactly the same two-copies problem and it bit in the
  // same way: web/src/app/deck/page.tsx embeds /deck/HoneyMoney_Demo_MAIC2026.mp4,
  // and the copy under web/public was the 27 July build while docs/deck held a
  // current one. The live page played a two-month-old video and returned 200
  // doing it. Anything docs/deck is the source of belongs in this list.
  "HoneyMoney_Demo_MAIC2026.mp4",
];

const md5 = (b) => createHash("md5").update(b).digest("hex");

if (!existsSync(DST)) mkdirSync(DST, { recursive: true });

let stale = 0;
let missing = 0;
for (const f of FILES) {
  const src = path.join(SRC, f);
  const dst = path.join(DST, f);
  if (!existsSync(src)) {
    // A missing SOURCE with a present site copy is not a broken deploy — it is
    // every fresh clone. docs/deck/*.pdf is gitignored (the exports live on
    // the laptop), while web/public/deck/* is committed, so a CI runner or a
    // new checkout has exactly the four files the site serves and none of the
    // ones they were exported from. Aborting the whole snapshot there shipped
    // NOTHING, which is strictly worse than shipping the committed copy — and
    // it is what made a publish impossible from anywhere but one machine.
    //
    // So: warn, and serve what is committed. The failure this file exists for
    // — a stale site copy going out silently — still cannot happen from here:
    // nothing is copied, so nothing can be copied wrong, and the line below is
    // louder than the silence that preceded 2026-08-24. Source AND site copy
    // both absent is still the hard error it always was.
    if (existsSync(dst)) {
      console.warn(`  !    ${f} — no export in docs/deck; serving the committed site copy as-is`);
      continue;
    }
    console.error(`  ✗ ${f} — missing from docs/deck AND from web/public/deck. Export it before deploying.`);
    missing++;
    continue;
  }
  const a = readFileSync(src);
  const b = existsSync(dst) ? readFileSync(dst) : null;
  if (b && md5(a) === md5(b)) {
    console.log(`  ok   ${f}  (${(a.length / 1024).toFixed(0)} KB)`);
    continue;
  }
  stale++;
  if (check) {
    console.error(`  ✗ ${f} — site copy differs from docs/deck (${b ? `${(b.length / 1024).toFixed(0)} KB vs ${(a.length / 1024).toFixed(0)} KB` : "absent"})`);
  } else {
    writeFileSync(dst, a);
    console.log(`  ↻ ${f}  ${b ? `${(b.length / 1024).toFixed(0)} KB → ` : ""}${(a.length / 1024).toFixed(0)} KB`);
  }
}

if (missing) process.exit(2);
if (check && stale) {
  console.error(`\n${stale} deck PDF(s) stale on the site. Run: node scripts/sync-deck-pdfs.mjs`);
  process.exit(1);
}
console.log(check ? "\nDeck PDFs are in sync." : "\nDone.");
