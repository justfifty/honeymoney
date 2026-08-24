#!/usr/bin/env node
/**
 * The MAIC upload documents have a hard 500-word limit each. Check them, don't eyeball them.
 *
 * The versions that preceded this check were 733 and 1,740 words, and neither
 * read as over-length — prose that explains itself rarely does. A number is the
 * only reliable judge, and a number nobody runs is not a limit.
 *
 *   node scripts/check-summary-words.mjs                     report both
 *   node scripts/check-summary-words.mjs --check             exit 1 if either is over
 *   node scripts/check-summary-words.mjs --file docs/deck/X.html   one file
 *
 * Counts what a reader sees: HTML comments and the <style> block are stripped,
 * since neither reaches the page. The header badge, title and tagline ARE
 * counted — they are words on the page a judge reads. Entities become a space,
 * so "&mdash;" is not scored as a word.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIMIT = 500;
const check = process.argv.includes("--check");

const argFile = process.argv.indexOf("--file");
const FILES =
  argFile > -1
    ? [path.resolve(ROOT, process.argv[argFile + 1])]
    : [
        path.join(ROOT, "docs", "deck", "PROJECT_SUMMARY.html"),
        path.join(ROOT, "docs", "deck", "AI_DISCLOSURE.html"),
      ];

function countWords(file) {
  const text = readFileSync(file, "utf8")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(" ").filter(Boolean).length : 0;
}

let over = 0;
for (const file of FILES) {
  const n = countWords(file);
  const name = path.basename(file);
  const pct = ((n / LIMIT) * 100).toFixed(0);
  console.log(`  ${name.padEnd(22)} ${String(n).padStart(4)} words  (limit ${LIMIT}, ${pct}%)`);
  if (n > LIMIT) {
    console.error(`    ✗ OVER by ${n - LIMIT}. Cut prose before cutting facts.`);
    over++;
  } else {
    console.log(`    ${LIMIT - n} word(s) of headroom.`);
  }
}

if (over) {
  console.error(`\n${over} document(s) over the ${LIMIT}-word limit.`);
  if (check) process.exit(1);
} else {
  console.log("\nBoth upload documents are within the limit.");
}
