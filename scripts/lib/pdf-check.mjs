// Shared PDF sanity checks for the three MAIC upload documents.
//
// Extracted from build-deck-pdf.mjs once the project summary needed the same
// guarantees. All three documents are exported the same way (Chrome print) and
// fail the same two ways: text the fixed layout silently ate, and a rasterised
// export that looks fine and contains no text at all. Both have happened here.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Pages and extractable word count, or zeroes if poppler is unavailable. */
export function pdfStats(pdf) {
  try {
    const words = execFileSync("pdftotext", ["-q", pdf, "-"], { encoding: "utf8" })
      .split(/\s+/)
      .filter(Boolean).length;
    const info = execFileSync("pdfinfo", [pdf], { encoding: "utf8" });
    return { words, pages: Number(/Pages:\s*(\d+)/.exec(info)?.[1] ?? 0) };
  } catch {
    return { words: 0, pages: 0 };
  }
}

/**
 * Catch text the layout silently ATE.
 *
 * These documents are fixed-size boxes with `overflow: hidden`, so copy that
 * grows by two lines does not spill visibly — it is cut mid-word and the PDF
 * still looks plausible. The deck had been ending a sentence at "can be" and
 * overprinting a statistic onto the footer, and nothing in the build said so.
 *
 * A set difference, not a rendering engine: take every run of prose in the HTML,
 * take the text pdftotext can find, report anything that went in and did not
 * come out.
 */
export function clipped(pdf, htmlPath) {
  let pdfText = "";
  try {
    // BOTH reading orders. A multi-column slide has its cards walked across by
    // pdftotext's default order, splicing a neighbour's words into the middle
    // of a sentence that is perfectly intact on the page. -layout keeps columns
    // together. Present in either is present.
    pdfText =
      execFileSync("pdftotext", ["-q", pdf, "-"], { encoding: "utf8" }) +
      execFileSync("pdftotext", ["-q", "-layout", pdf, "-"], { encoding: "utf8" });
  } catch {
    return [];
  }

  // Compare on LETTERS AND DIGITS ONLY. An em dash prints as "--", hyphenated
  // words break across lines, and absolutely-positioned blocks get re-ordered.
  // Every one of those was a false positive on the first run of this check, for
  // text plainly present on the page. Stripping punctuation kills the class.
  const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const haystack = norm(pdfText);

  const html = readFileSync(htmlPath, "utf8")
    // <head> first, and the whole of it. The <title> is prose by every measure
    // this function uses — long, sentence-shaped, never on the page — so it read
    // as clipped text on every document that has one.
    .replace(/<head[\s\S]*?<\/head>/i, " ")
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const misses = [];
  for (const raw of html.split(/<[^>]+>/)) {
    const readable = raw.replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
    const text = norm(readable);
    // 50 letters is past headings and stat labels, and short enough to catch a
    // single clipped sentence rather than only a whole missing card.
    if (text.length < 50) continue;
    // Compare on the TAIL: a clipped block keeps its opening words, so matching
    // the start would pass. The end is the part that disappears.
    if (!haystack.includes(text.slice(-40))) {
      misses.push(`clipped: "...${readable.slice(-60)}"`);
    }
  }
  return misses.slice(0, 6);
}
