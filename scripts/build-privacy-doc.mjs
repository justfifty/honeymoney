// Generate docs/PRIVACY.md from web/src/app/privacy/notice.ts.
//
// There are two audiences for the same notice: a user on /privacy, and a judge
// or reviewer reading the repo. Maintaining two copies of a legal text by hand
// is how they end up saying different things, and "which version were you shown"
// is exactly the question a consent record has to be able to answer.
//
//   node scripts/build-privacy-doc.mjs           # write docs/PRIVACY.md
//   node scripts/build-privacy-doc.mjs --check   # exit 1 if it is out of date
//
// The --check form runs in the same spirit as check:domcloud: drift is a build
// failure, not something to spot in review.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = dirname(here);
const NOTICE = join(repo, "web", "src", "app", "privacy", "notice.ts");
const CONSENT = join(repo, "web", "src", "lib", "consent.ts");
const OUT = join(repo, "docs", "PRIVACY.md");

// Parsing TypeScript with a regex is usually a bad idea; here the input is a
// file we own, whose shape is asserted by tsc on every build, and the
// alternative is adding a TS toolchain to a doc generator. If this ever throws,
// the fix is to keep notice.ts a plain literal — not to make this cleverer.
function readSections() {
  const src = readFileSync(NOTICE, "utf8");
  const body = src.slice(src.indexOf("export const NOTICE_SECTIONS"));
  const sections = [];
  const sectionRe = /\{\s*id:\s*"([^"]+)",\s*en:\s*\{([\s\S]*?)\},\s*ms:\s*\{([\s\S]*?)\},\s*\},/g;
  let m;
  while ((m = sectionRe.exec(body)) !== null) {
    sections.push({ id: m[1], en: parseLang(m[2]), ms: parseLang(m[3]) });
  }
  if (!sections.length) throw new Error("No sections parsed from notice.ts — has its shape changed?");
  return sections;
}

function parseLang(chunk) {
  const heading = /heading:\s*"((?:[^"\\]|\\.)*)"/.exec(chunk)?.[1] ?? "";
  const bodyBlock = /body:\s*\[([\s\S]*?)\]/.exec(chunk)?.[1] ?? "";
  const body = [...bodyBlock.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => unescape_(x[1]));
  return { heading: unescape_(heading), body };
}

const unescape_ = (s) => s.replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n");

function version() {
  const src = readFileSync(CONSENT, "utf8");
  return /NOTICE_VERSION\s*=\s*"([^"]+)"/.exec(src)?.[1] ?? "unknown";
}

function render(sections, v) {
  const L = [];
  L.push("# HoneyMoney — Privacy Notice / Notis Privasi");
  L.push("");
  L.push("<!-- GENERATED FILE — DO NOT EDIT.");
  L.push("     Source: web/src/app/privacy/notice.ts");
  L.push("     Regenerate: npm run privacy:doc -->");
  L.push("");
  L.push(`**Version ${v}** · Issued under the Personal Data Protection Act 2010 (Malaysia)`);
  L.push("");
  L.push("Live at https://honeymoney.app/privacy");
  L.push("");
  L.push("> The Bahasa Malaysia text is a working translation and has not yet been");
  L.push("> certified by a Malaysian legal practitioner. See the note at the top of");
  L.push("> `web/src/app/privacy/notice.ts`.");
  L.push("");
  L.push("---");
  for (const s of sections) {
    L.push("");
    L.push(`## ${s.en.heading}`);
    L.push("");
    for (const p of s.en.body) L.push(`- ${p}`);
    L.push("");
    L.push(`### ${s.ms.heading}`);
    L.push("");
    for (const p of s.ms.body) L.push(`- ${p}`);
  }
  L.push("");
  return L.join("\n");
}

const md = render(readSections(), version());

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    /* missing counts as out of date */
  }
  if (current.replace(/\r\n/g, "\n") !== md) {
    console.error("docs/PRIVACY.md is out of date. Run: npm run privacy:doc");
    process.exit(1);
  }
  console.log("docs/PRIVACY.md is up to date.");
} else {
  writeFileSync(OUT, md, "utf8");
  console.log(`Wrote ${OUT}`);
}
