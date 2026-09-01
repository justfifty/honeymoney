// On-device parsing of a free-text spend — the zero-token path.
//
// The module keeps the name `voiceParse` from when speech was one of its
// callers. Speech was removed on 2026-08-22 (NEXT.md §6.6 Task 3) and this is
// now purely a TEXT parser, with two live callers: the landing page's try-it
// box (what a visitor types) and `parseReceiptText` (what tesseract OCRs off a
// receipt). Nothing here ever touched a microphone — it takes a string.
//
// The old parser only ever returned a number for non-English speakers, and the
// reason was a single character class. `[a-z]` and `[^a-z'&\-\s]` cannot match
// 星巴克, ஸ்டார்பக்ஸ் or स्टारबक्स, so for Chinese, Tamil and Hindi transcripts every
// letter was stripped, the vendor came back undefined — and only the digits,
// which the ASR emits as ASCII regardless of language, survived. That is
// precisely the "it only recognises numbers" symptom.
//
// Everything here is therefore Unicode-first (\p{L} with the /u flag), and
// nothing assumes a language whose words are separated by spaces.
//
// This module is isomorphic — no node: imports — so the browser can parse
// offline with zero tokens, and the server can use the same code as a fallback
// when the AI provider is unavailable.

import { verify, type SuspectField } from "./receiptMath";

export interface ParsedVoice {
  vendor?: string;
  amount?: number;
  currency?: string;
  occurredAt?: string;
  /**
   * The itemised lines, when the receipt has any.
   *
   * lib/receipt.ts has produced these from the AI path since Task 6 and nothing
   * ever rendered them, so an itemised receipt looked exactly like a single
   * total. Producing them HERE too matters more than it sounds: the AI path
   * needs a configured key and 501s without one, while this runs in the browser
   * on Tesseract output and costs nothing. Itemisation is now a property of
   * scanning a receipt, not of having paid for an AI provider.
   */
  lineItems?: ParsedLineItem[];
  /**
   * Subtotal / service charge / tax / rounding, when the receipt printed them.
   * Absent for a typed line, which has no such thing.
   */
  breakdown?: { subtotal: number; serviceCharge: number; tax: number; rounding: number; total: number };
  /**
   * What the receipt's own arithmetic said. Same shape as the AI reader's, so
   * the UI has one thing to render rather than two — the household should not be
   * told a different story about its receipt depending on whether an API key
   * happens to be configured.
   */
  checks?: {
    confirmed: string[];
    conflicts: { relation: string; expected: number; found: number; suspect: SuspectField }[];
    suspect: SuspectField | null;
  };
  /**
   * How confident the *local* parser is. The AI path reports its own.
   *
   * On a receipt this is no longer a tally of what was FOUND. It used to add
   * 0.3 for an amount and 0.2 for a vendor and stop, which measures how many
   * fields came back rather than whether any of them is right — a confidently
   * wrong total scored exactly as well as a correct one. It is now moved by the
   * receipt's own arithmetic as well; see lib/receiptMath.ts.
   */
  confidence: number;
}

// ── Numbers ─────────────────────────────────────────────────────────────────

const NUM_WORDS: Record<string, number> = {
  // English
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  // Malay
  kosong: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, lapan: 8,
  delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11, seratus: 100, seribu: 1000,
};
const NUM_SCALES: Record<string, number> = {
  hundred: 100, thousand: 1000, ratus: 100, ribu: 1000, k: 1000, grand: 1000,
  puluh: 10, // Malay: "lima puluh" = five tens = 50
};

// CJK numerals — Chinese ASR often returns 三十五 rather than 35.
const CJK_DIGITS: Record<string, number> = {
  〇: 0, 零: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const CJK_SCALES: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000, 萬: 10000 };

function cjkToNumber(text: string): number | undefined {
  const chars = [...text].filter((c) => c in CJK_DIGITS || c in CJK_SCALES);
  if (chars.length === 0) return undefined;
  let total = 0;
  let current = 0;
  for (const c of chars) {
    if (c in CJK_DIGITS) {
      current = CJK_DIGITS[c];
    } else {
      const scale = CJK_SCALES[c];
      // 十五 = 15: a bare 十 means one ten.
      total += (current || 1) * scale;
      current = 0;
    }
  }
  const value = total + current;
  return value > 0 ? value : undefined;
}

function wordsToNumber(text: string): number | undefined {
  const tokens = text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  let total = 0;
  let current = 0;
  let active = false;
  let best: number | undefined;

  const flush = () => {
    const v = total + current;
    if (active && v > 0 && best === undefined) best = v;
    total = 0;
    current = 0;
    active = false;
  };

  for (const tok of tokens) {
    if (tok in NUM_WORDS) {
      current += NUM_WORDS[tok];
      active = true;
    } else if (tok in NUM_SCALES) {
      const s = NUM_SCALES[tok];
      // 10 and 100 multiply what's in hand ("lima puluh" = 5×10, "three
      // hundred" = 3×100); 1000+ closes off a group ("two thousand five").
      if (s <= 100) current = (current || 1) * s;
      else {
        total += (current || 1) * s;
        current = 0;
      }
      active = true;
    } else if (tok === "and" || tok === "dan") {
      // a connective inside a number ("one hundred and five") — keep going
    } else {
      flush();
    }
  }
  flush();
  return best;
}

// ── Currency ────────────────────────────────────────────────────────────────

const CURRENCY_WORDS: { re: RegExp; code: string }[] = [
  { re: /\brm\b|\bmyr\b|ringgit|林吉特|ரிங்கிட்|रिंगित/iu, code: "MYR" },
  { re: /\bsgd\b|\bs\$|sing(?:apore)?\s*dollar|新币|新加坡元/iu, code: "SGD" },
  { re: /\busd\b|\bus\$|\bdollars?\b|美元|美金/iu, code: "USD" },
  { re: /\bgbp\b|\bpounds?\b|英镑/iu, code: "GBP" },
  { re: /\bthb\b|\bbaht\b|฿|泰铢/iu, code: "THB" },
  { re: /\bcny\b|\brmb\b|yuan|人民币|元(?!旦)/iu, code: "CNY" },
  { re: /\bhkd\b|\bhk\$|港币|港元/iu, code: "HKD" },
  { re: /\btwd\b|\bnt\$|新台币/iu, code: "TWD" },
  { re: /\bjpy\b|\byen\b|日元|日圓/iu, code: "JPY" },
];

export function detectCurrency(text: string): string | undefined {
  for (const c of CURRENCY_WORDS) {
    if (c.re.test(text)) return c.code;
  }
  return undefined;
}

// ── Amount ──────────────────────────────────────────────────────────────────

// Digit groups that are clearly NOT money: a 4-digit year, a time, a date.
//
// Be careful here: "42.50" is a perfectly good clock time by shape, and an
// earlier version of this stripped it as one — so "I spent 42.50 at 99
// Speedmart" lost its amount entirely and fell through to the bare-number rule,
// which then answered 99. A dot-separated pair is only a time when it actually
// says am/pm; a colon is unambiguous on its own.
/** Month names across the six locales, for telling a year from an amount. */
const MONTH_WORD =
  /jan|feb|mac|mar|apr|mei|may|jun|jul|ogos|aug|sep|okt|oct|nov|dis|dec|month|bulan|月|माह|மாத/i;

/**
 * Is this four-digit number a DATE, or is it money?
 *
 * It used to be assumed a date, always: `\b(19|20)\d{2}\b` was deleted outright
 * before the amount was read. On OCR'd receipt text that is right. On a line a
 * human TYPED it is wrong far more often than it is right — and it became a
 * daily bug the moment the Record screen began parsing typed lines:
 *
 *     "bonus 2000"          → no amount at all
 *     "rent 2000"           → no amount at all
 *     "RM2,000 Raya trip"   → no amount at all
 *
 * RM2,000 is one of the most ordinary sums in Malaysian household money, and
 * "no amount" is a silent failure: the card simply does not appear.
 *
 * So a year is removed only where something beside it actually says "date" — a
 * separator touching it, or a month word next to it. A receipt's "03/07/2026"
 * is already removed whole by the rule above this one, and "26 Aug 2026" still
 * matches here.
 */
function isDateContext(whole: string, at: number, len: number): boolean {
  const before = whole.slice(Math.max(0, at - 14), at).toLowerCase();
  const after = whole.slice(at + len, at + len + 8).toLowerCase();
  return (
    /[/.-]\s*$/.test(before) ||
    /^\s*[/.-]/.test(after) ||
    MONTH_WORD.test(before) ||
    MONTH_WORD.test(after)
  );
}

function stripNonMoney(text: string): string {
  return text
    .replace(/\b\d{1,2}:\d{2}\b/g, " ") // 7:30
    .replace(/\b\d{1,2}[.:]\d{2}\s*(?:am|pm)\b/gi, " ") // 7.30pm
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, " ") // 3/7, 03-07-2026
    .replace(/\b(?:19|20)\d{2}\b/g, (year, at: number, whole: string) =>
      isDateContext(whole, at, year.length) ? " " : year,
    );
}

// ── one definition of "a money token" ──────────────────────────────────────
//
// 🛑 Every rule below used to spell its own, as `\d+(?:[.,]\d{1,2})?`, and that
// pattern cannot read a thousands separator. "RM2,000" matched as `2,00` and
// came back as **RM2.00** — a five-hundred-fold under-read, silently, on the
// most ordinary large sum in Malaysian household money. "Salary 5,000" was
// RM5.00. It survived this long because nothing typed grouped numbers until the
// Record screen started parsing typed lines.
//
// Grouped form is tried FIRST, and the two forms are distinguished by what
// follows the comma: three digits is a group ("2,000"), one or two is a decimal
// ("6,50", which some people do type).
const MONEY = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?`;

function toAmount(token: string): number {
  // 1,234.56 or 1,234 — the comma groups thousands, so it is not a decimal point.
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(token)) {
    return parseFloat(token.replace(/,/g, ""));
  }
  return parseFloat(token.replace(",", "."));
}

export function extractAmount(raw: string): number | undefined {
  const text = stripNonMoney(raw);
  const t = text.toLowerCase();

  // 1) next to a total/paid keyword — the strongest signal on a receipt.
  //
  // TWO THINGS THIS GETS WRONG IF YOU ARE NOT CAREFUL, both measured against a
  // printed Malaysian receipt:
  //
  //   • The gap used to be \D{0,12}. On a till roll the total sits across a
  //     whitespace COLUMN — "TOTAL" then seventeen spaces then "21.73" — so the
  //     match failed, execution fell through to the currency rule below, and it
  //     returned the first RM-prefixed number on the page. A receipt totalling
  //     RM21.73 was filed as RM4.80, the price of the drink. Widened to 40, and
  //     restricted to non-newline so it cannot jump to the next line's figure.
  //
  //   • "SUBTOTAL" contains "total". Matching the first hit takes the subtotal
  //     and quietly under-reports every receipt that lists tax separately. So
  //     collect every hit, drop the sub- prefixed ones when a real total exists,
  //     and take the LAST — receipts print running totals, and the final one is
  //     the amount actually paid.
  const hits = [
    ...t.matchAll(
      new RegExp(
        String.raw`((?:sub)?)(?:total|jumlah|amount|bayar|paid|spent|harga|price|合计|總計|總共|मूल्य|மொத்தம்)[^\d\n]{0,40}(${MONEY})`,
        "giu",
      ),
    ),
  ];
  const totals = hits.filter((h) => !h[1]);
  const chosen = (totals.length ? totals : hits).at(-1);
  if (chosen) return toAmount(chosen[2]);

  // 2) adjacent to a currency marker, either side: "RM 12.50" or "12.50 ringgit"
  const before = t.match(new RegExp(String.raw`(?:rm|myr|ringgit|s\$|sgd|usd|\$|£|฿|¥)\s*(${MONEY})`, "iu"));
  if (before) return toAmount(before[1]);
  const after = t.match(
    new RegExp(String.raw`(${MONEY})\s*(?:rm|myr|ringgit|sen|dollars?|pounds?|baht|yuan|yen)\b`, "iu"),
  );
  if (after) return toAmount(after[1]);

  // 3) "twelve ringgit fifty (sen)" — spoken decimals
  const split = t.match(/(\d+)\s*(?:ringgit|dollars?|point|perpuluhan)\s*(\d{1,2})\b/iu);
  if (split) return parseFloat(`${split[1]}.${split[2].padStart(2, "0")}`);

  // 4) any bare number. Prefer one with decimals (money usually has them);
  //    otherwise take the LAST, not the largest — "99 Speedmart, spent 12"
  //    should be 12, and the old Math.max() is exactly why it used to say 99.
  const digits = [...t.matchAll(new RegExp(`(${MONEY})`, "g"))]
    .map((m) => toAmount(m[1]))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (digits.length) {
    const decimal = digits.find((n) => !Number.isInteger(n));
    return decimal ?? digits[digits.length - 1];
  }

  // 5) spoken number words, then CJK numerals
  return wordsToNumber(t) ?? cjkToNumber(text);
}

// ── Vendor ──────────────────────────────────────────────────────────────────

// Words that are never a merchant. Deliberately does NOT include the number
// words: the old version spread all of NUM_WORDS/NUM_SCALES in here, so a shop
// called "Lima" or "Satu" — or any vendor containing "k" — was deleted outright.
const FILLER = new Set([
  // English
  "i", "spent", "spend", "paid", "pay", "for", "on", "at", "the", "a", "an", "just", "of",
  "buy", "bought", "get", "got", "and", "my", "we", "was", "were", "is", "it", "to", "in",
  "today", "yesterday", "morning", "afternoon", "evening", "night", "some", "there",
  // currency nouns
  "rm", "myr", "ringgit", "sen", "cent", "cents", "dollar", "dollars", "buck", "bucks",
  // Malay
  "beli", "bayar", "kat", "di", "ke", "untuk", "harga", "dengan", "dan", "saya", "aku",
  "tadi", "semalam", "hari", "ini", "itu", "kena", "belanja",
  // Tamil and Hindi are postpositional — the marker TRAILS the merchant, so
  // these have to be filtered by name; there's no preposition to anchor on.
  "இல்", "இல", "லிருந்து", "செலவு", "செலவழித்தேன்", "நான்", "ரிங்கிட்", "ரூபாய்",
  "मैंने", "मैं", "में", "को", "पर", "से", "खर्च", "किए", "किया", "रुपये", "रुपए", "दिए", "पैसे",
]);

const PREPOSITIONS = /(?:\bat\b|\bfrom\b|\bin\b|\bkat\b|\bdi\b|\bke\b|\bdari\b|\bpada\b|在|去|于|從|从)/iu;

// Cheap, high-value merchant biasing. ASR mangles Malaysian shop names because
// they're out-of-vocabulary; if a mangled token is close to one we know, snap it.
const KNOWN_VENDORS = [
  "99 Speedmart", "Tealive", "ZUS Coffee", "Starbucks", "Mydin", "AEON",
  "Lotus's", "Tesco", "Giant", "Village Grocer", "Jaya Grocer", "NSK", "Econsave",
  "Shell", "Petronas", "Petron", "Caltex", "BHP",
  "Grab", "GrabFood", "Foodpanda", "Shopee", "Lazada", "Touch 'n Go", "Watsons", "Guardian",
  "McDonald's", "KFC", "Subway", "Domino's", "Secret Recipe", "Old Town White Coffee",
  "Maybank", "CIMB", "Public Bank", "TNB", "Unifi", "Astro", "Celcom", "Maxis", "Digi",
];

// Levenshtein, bounded — we only care whether it's within `max` edits.
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[b.length];
}

export function snapToKnownVendor(candidate: string, extra: string[] = []): string {
  const c = candidate.trim().toLowerCase();
  if (!c) return candidate;
  const pool = [...extra, ...KNOWN_VENDORS];

  for (const known of pool) {
    if (known.toLowerCase() === c) return known;
  }

  // People say the short name: "ZUS" for "ZUS Coffee". Snap up to the full name
  // — but only when exactly one known vendor starts with it, so "Grab" doesn't
  // get silently promoted to "GrabFood".
  const prefixed = pool.filter((k) => k.toLowerCase().startsWith(`${c} `));
  if (prefixed.length === 1) return prefixed[0];

  // Allow roughly one edit per four characters — enough to fix "speed mart" or
  // "tea live", not so loose that unrelated names collide.
  const budget = Math.max(1, Math.floor(c.length / 4));
  let best: { name: string; d: number } | null = null;
  for (const known of pool) {
    const k = known.toLowerCase();
    const d = editDistance(c, k, budget);
    if (d <= budget && (!best || d < best.d)) best = { name: known, d };
  }
  return best?.name ?? candidate;
}

function titleCase(s: string): string {
  return s.replace(/\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1));
}

// `amount` is the value extractAmount already found. Pass it, and we delete only
// THAT number from the sentence. Blanket-stripping every digit — which is what
// this used to do — destroys the merchant in "99 Speedmart", "7-Eleven" and
// "1 Utama", all of which are real Malaysian names.
export function extractVendor(
  raw: string,
  knownVendors: string[] = [],
  amount?: number,
): string | undefined {
  const text = raw.trim();
  if (!text) return undefined;

  // Languages without spaces (Chinese, Japanese) can't be word-tokenised, so
  // handle them by deletion: strip the digits, currency markers and the verbs,
  // and whatever's left is the merchant.
  const isScriptural = /[一-鿿぀-ヿ]/u.test(text);
  if (isScriptural) {
    const stripped = text
      .replace(/\d+(?:[.,]\d{1,2})?/g, "")
      .replace(/[〇零一二两兩三四五六七八九十百千万萬]/gu, "")
      .replace(/(?:花了|用了|付了|买了|買了|在|去|块|塊|元|令吉|林吉特|马币|馬幣|我|了)/gu, "")
      .replace(/[\p{P}\p{S}\s]+/gu, "")
      .trim();
    return stripped ? snapToKnownVendor(stripped, knownVendors) : undefined;
  }

  // Remove the amount we already identified, and nothing else numeric.
  const withoutAmount = amount === undefined ? text : removeAmount(text, amount);

  // Drop the words that are never part of a merchant name: fillers, currency
  // nouns and spoken numbers. Applied to BOTH strategies below — the
  // preposition match used to skip this, so "kat Tealive harga lima puluh
  // ringgit" came back as the merchant "Tealive Harga Lima Puluh Ringgit".
  // \p{M} matters as much as \p{L} here. Tamil and Devanagari build a syllable
  // from a letter PLUS combining marks (the virama in ஸ்டார்பக்ஸ், the matras in
  // स्टारबक्स). Splitting on anything that isn't \p{L} treats those marks as
  // separators and shatters one word into letter-fragments — so the merchant
  // came back as "ஸ ட ர பக" instead of ஸ்டார்பக்ஸ்.
  const meaningful = (span: string): string[] =>
    span
      .split(/[^\p{L}\p{M}\p{N}'&.\-]+/u)
      .filter(Boolean)
      .filter((w) => !FILLER.has(w.toLowerCase()))
      .filter((w) => !(w.toLowerCase() in NUM_WORDS) && !(w.toLowerCase() in NUM_SCALES));

  // 1) after a preposition: "… at Tesco", "… kat 99 Speedmart".
  //    Stop at a time word so "at Tesco yesterday" doesn't become the vendor.
  const prep = withoutAmount.match(
    new RegExp(
      `${PREPOSITIONS.source}\\s+([\\p{L}\\p{M}\\p{N}'&.\\- ]{2,40}?)(?=\\s+(?:today|yesterday|tadi|semalam|this|last|for|on|and|dan)\\b|[,.!?]|$)`,
      "iu",
    ),
  );
  if (prep?.[1]?.trim()) {
    const words = meaningful(prep[1]);
    if (words.length) {
      const v = words.slice(0, 4).join(" ");
      if (!/^\d+$/.test(v)) return snapToKnownVendor(titleCase(v), knownVendors);
    }
  }

  // 2) otherwise: keep whatever meaningful text is left.
  const words = meaningful(stripNonMoney(withoutAmount));
  if (!words.length) return undefined;
  const v = words.slice(0, 4).join(" ");
  if (/^\d+$/.test(v)) return undefined;
  return snapToKnownVendor(titleCase(v), knownVendors);
}

// Delete the first literal occurrence of the amount — "42.50", "42,50" or "42".
function removeAmount(text: string, amount: number): string {
  const whole = String(Math.trunc(amount));
  // How the user may have WRITTEN it, not just how JavaScript prints it. The
  // grouped forms are here because extractAmount learned to read "RM2,000": if
  // only the ungrouped "2000" were removed, the vendor came back as "RM2 000
  // Raya Trip" — the amount left behind, in pieces, inside the merchant name.
  const grouped = (n: number) => n.toLocaleString("en-US"); // 2,000 · 1,234.56
  const forms = [
    grouped(amount), // 2,000
    amount.toFixed(2), // 42.50
    grouped(Number(amount.toFixed(2))), // 1,234.56
    amount.toFixed(2).replace(".", ","), // 42,50
    String(amount), // 42.5
    ...(Number.isInteger(amount) ? [whole] : []),
  ];
  for (const form of forms) {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![\\d.,])${escaped}(?![\\d])`);
    if (re.test(text)) return text.replace(re, " ");
  }
  return text;
}

// ── Relative dates ──────────────────────────────────────────────────────────

export function extractDate(text: string, now = new Date()): string | undefined {
  const t = text.toLowerCase();
  const day = (offset: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return d.toISOString();
  };
  if (/\byesterday\b|\bsemalam\b|昨天|कल|நேற்று/iu.test(t)) return day(-1);
  if (/\bday before yesterday\b|\bkelmarin\b|前天/iu.test(t)) return day(-2);
  if (/\btoday\b|\bhari ini\b|\btadi\b|今天|आज|இன்று/iu.test(t)) return day(0);

  const daysAgo = t.match(/(\d+)\s*(?:days?|hari)\s*(?:ago|lepas|lalu)/iu);
  if (daysAgo) return day(-Number(daysAgo[1]));

  const lastWeek = /\blast week\b|\bminggu lepas\b|上周|上週/iu.test(t);
  if (lastWeek) return day(-7);

  return undefined;
}

// ── The whole local parse ───────────────────────────────────────────────────

export function parseVoiceLocal(transcript: string, knownVendors: string[] = []): ParsedVoice {
  const amount = extractAmount(transcript);
  // Order matters: the vendor step needs to know which number was the amount, so
  // it can remove that one and leave any digits belonging to the shop's name.
  const vendor = extractVendor(transcript, knownVendors, amount);
  const currency = detectCurrency(transcript);
  const occurredAt = extractDate(transcript);

  // Be honest about how well this went, so the UI can decide whether to show a
  // "check this" warning rather than silently saving a bad guess.
  let confidence = 0.35;
  if (amount !== undefined) confidence += 0.3;
  if (vendor) confidence += 0.25;
  if (currency) confidence += 0.05;
  if (occurredAt) confidence += 0.05;

  return { vendor, amount, currency, occurredAt, confidence: Math.min(1, confidence) };
}

// ── Receipts / screenshots ──────────────────────────────────────────────────

// Wallet-app furniture: never the merchant. Note this list contains "paid",
// "payment" and "total" — words that also sit on the line carrying the AMOUNT.
// So it may only ever be used to find the *vendor*, never to pre-filter the text
// we look for the amount in, or we'd throw away the number we came for.
const RECEIPT_CHROME =
  /touch\s*'?n?\s*go|tng|e-?wallet|duitnow|grabpay|shopeepay|\bboost\b|maybank|\bmae\b|transaction|successful|success|receipt|payment|\bpaid\b|transfer|reference|\bref\b|balance|status|\bdate\b|\btime\b|thank you|terima kasih|invoice|\btotal\b|jumlah|subtotal|\btax\b|\bsst\b|\bgst\b|cashier|change|tunai/i;

// DD/MM/YYYY — Malaysian receipts never use the American MM/DD order, so
// reading "03/07/2026" as 3 March would silently file the spend four months out.
function receiptDate(text: string): string | undefined {
  const m = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (!m) return undefined;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (day < 1 || day > 31 || month < 1 || month > 12) return undefined;

  const time = text.match(/\b(\d{1,2}):(\d{2})\b/);
  const d = new Date(
    year,
    month - 1,
    day,
    time ? Number(time[1]) : 12,
    time ? Number(time[2]) : 0,
  );
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Pull the itemised lines out of raw OCR text.
 *
 * The shape being matched is "some words, then a price at the end of the line" —
 * which is what a printed receipt looks like in every language on it, because
 * the price column is positional rather than labelled.
 *
 * Three rules keep the noise out, each earning its place:
 *
 *   • RECEIPT_CHROME excludes the furniture — TOTAL, SUBTOTAL, SST, CHANGE,
 *     CASH. Those all match the same pattern as an item and are emphatically
 *     not items; a "total" line captured as an item double-counts the receipt.
 *   • The label must hold at least two letters, which drops phone numbers,
 *     receipt IDs and table numbers.
 *   • Nothing may exceed the receipt total. An OCR misread turning 4.50 into
 *     450.00 is common, and one wrong line is worse than no lines because it
 *     looks authoritative.
 *
 * Returns undefined rather than [] when nothing qualifies, so a caller can tell
 * "this receipt was not itemised" from "this receipt had zero items".
 */
// Tender and settlement lines, which look exactly like items and are not.
//
// Kept SEPARATE from RECEIPT_CHROME on purpose: that regex is documented as
// vendor-detection only, and widening it would change which line is read as the
// shop name. This list is narrower and answers a different question -- "is this
// row something the customer bought?" CASH is the one that motivated it: it
// matches no part of `cashier`, so a 25.00 tender sailed through as the most
// expensive item on a 21.73 receipt.
const NOT_AN_ITEM =
  /\bcash\b|\btunai\b|\bchange\b|\bbaki\b|\bbalance\b|\btendered\b|\bdebit\b|\bcredit\b|\bcard\b|\bqty\b|round(?:ing)?/i;

// ── OCR DIGIT CONFUSIONS ────────────────────────────────────────────────────
//
// Tesseract reading thermal paper mixes up a small, extremely stable set of
// glyph pairs: O/0, l and I/1, S/5, B/8, Z/2, G/6. On a price that turns "7.00"
// into "7.OO", and the strict `\d` in every money pattern here then failed to
// match the line AT ALL — so a misread of two characters did not produce a
// slightly wrong item, it silently deleted the item. On a long receipt that is
// several rows gone with nothing on screen to say so.
//
// Applied ONLY to a token already positioned as money — matched in a price
// column, or beside a currency marker — and NEVER to a label. That constraint is
// what makes it safe: "SOS" in an item name stays "SOS", while the same three
// characters in the price column of a line are read as 505. Outside that
// position the substitution would be vandalism.
const DIGIT_LOOKALIKES: Record<string, string> = {
  O: "0", o: "0", D: "0", Q: "0",
  l: "1", I: "1", i: "1", "|": "1", "!": "1",
  S: "5", s: "5",
  B: "8",
  Z: "2", z: "2",
  G: "6",
  T: "7",
};

/** The character class a money token may contain once lookalikes are allowed. */
const MONEYISH_CHARS = String.raw`0-9OoDQlIi|!SsBZzGT`;

/** Normalise a token that is already KNOWN to be in a money position. */
export function fixOcrDigits(token: string): string {
  return token.replace(/[A-Za-z|!]/g, (c) => DIGIT_LOOKALIKES[c] ?? c);
}

// Malaysian receipts print a TAX CODE after the price -- "SR" (standard-rated),
// "ZR" (zero-rated), "S", "Z", "T", "E", "OS", or a bare asterisk or hash. The
// item regex anchored the price to end-of-line, so every line on a GST/SST-era
// receipt -- which is most printed receipts in Malaysia -- failed to match
// because of two trailing characters. This is the single most common reason
// on-device itemisation came back empty on a receipt that was itemised.
const TAX_CODE = String.raw`(?:\s*[*#]|\s+(?:SR|ZR|OS|ES|RS|S|Z|T|E|N|X)\b)?`;

// A row that TAKES money off: a discount, a voucher, a member saving, a rebate.
// Recognised so it can be KEPT as an item rather than dropped, because a receipt
// whose items sum to more than its total reads as a misread when in fact the
// discount line is simply missing from the list.
const DISCOUNT_LINE = /discount|disc\b|diskaun|voucher|baucar|rebate|rebat|promo|saving|potongan/i;

// A till roll really can run past a hundred lines. This used to stop at twenty
// and return a "summary", which was defensible while the list was decoration:
// the user can now choose to record every line as its own record, and a list
// that silently stops is then a ledger that is silently short.
const MAX_LOCAL_ITEMS = 150;

export interface ParsedLineItem {
  label: string;
  amount: number;
  qty?: number;
  unitPrice?: number;
  discount?: boolean;
}

export function receiptLineItems(text: string, total?: number): ParsedLineItem[] | undefined {
  const items: ParsedLineItem[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length < 4 || RECEIPT_CHROME.test(line) || NOT_AN_ITEM.test(line)) continue;

    // Label, then optionally a "2 x 3.50" quantity clause, then the price. The
    // quantity clause was matched and DISCARDED here for as long as this
    // function has existed: the user saw "Nasi lemak  7.00" with no way to tell
    // whether that was one at 7.00 or two at 3.50 — exactly the kind of misread
    // an itemised view exists to make visible. It is captured now.
    const m = line.match(
      new RegExp(
        // label
        String.raw`^(.{2,40}?)\s+` +
          // optional "2 x 3.50" quantity clause
          String.raw`(?:(\d+(?:\.\d+)?)\s*[x×]\s*([${MONEYISH_CHARS}.,]+)\s+)?` +
          // optional currency marker, then the price — lookalike glyphs allowed
          String.raw`(?:RM\s*)?(-?[${MONEYISH_CHARS}]{1,3}(?:,[${MONEYISH_CHARS}]{3})*(?:\.[${MONEYISH_CHARS}]{2}))` +
          // …and the tax code Malaysian tills print after it
          TAX_CODE +
          String.raw`$`,
        "i",
      ),
    );
    if (!m) continue;

    const label = m[1].replace(/[.•*_-]+$/, "").trim();
    if ((label.match(/\p{L}/gu)?.length ?? 0) < 2) continue;

    // The price is in a price POSITION, which is what licenses the substitution
    // — see fixOcrDigits. A token that is still not a number after it (a label
    // that happened to end in letters) is rejected below rather than coerced.
    const signed = Number(fixOcrDigits(m[4]).replace(/,/g, ""));
    if (!Number.isFinite(signed) || signed === 0) continue;
    // Positive amount plus a flag, matching lib/receipt.ts and the statement
    // importer. A minus sign on the paper and the word "discount" say the same
    // thing here, and either one alone is enough.
    const discount = signed < 0 || DISCOUNT_LINE.test(label);
    const amount = Math.abs(signed);

    const qty = m[2] ? Number(m[2]) : undefined;
    const unitPrice = m[3] ? Number(fixOcrDigits(m[3]).replace(/,/g, "")) : undefined;

    items.push({
      label,
      amount,
      ...(qty !== undefined && Number.isFinite(qty) && qty > 0 ? { qty } : {}),
      ...(unitPrice !== undefined && Number.isFinite(unitPrice) && unitPrice > 0 ? { unitPrice } : {}),
      ...(discount ? { discount: true } : {}),
    });
    if (items.length >= MAX_LOCAL_ITEMS) break;
  }

  // Apply the ceiling only if the total is credible — i.e. at least as large as
  // the biggest line. A total smaller than one of its own items is a misread,
  // and filtering by it would delete the real lines instead of the fake one.
  //
  // Discounts are exempt in both directions: they do not add to the bill, so
  // they cannot be the line that exceeds it, and a large discount against a
  // small final total is ordinary rather than suspicious.
  const max = Math.max(...items.filter((i) => !i.discount).map((i) => i.amount), 0);
  const kept =
    total !== undefined && total >= max ? items.filter((i) => i.discount || i.amount <= total) : items;

  return kept.length ? kept : undefined;
}

/**
 * The total, allowing for OCR lookalike glyphs — the LAST resort, after the
 * strict reader has found nothing.
 *
 * Ordered this way deliberately. `extractAmount` is shared with the landing
 * page's try-it box, where a person is TYPING and "S" is a letter; widening its
 * money pattern would make "spent SOS money" parse as 505. Here the text came
 * out of Tesseract, "TOTAL" has already been matched immediately before the
 * token, and a total of "2I.73" is a misread of 21.73 rather than a word.
 *
 * So the tolerance is scoped to the one place it is safe: OCR output, in a
 * price position, anchored to the word that says it is the total.
 *
 * ⚠️ THIS RUNS BEFORE `extractAmount`, NOT AS ITS FALLBACK, and the first draft
 * had that backwards. A fallback only fires when the strict pass finds NOTHING,
 * and the strict pass does not fail cleanly on a mangled total — it fails
 * PARTIALLY. Given "TOTAL   2O.40" its money pattern matches the leading "2",
 * because 2 is a digit and O is where it stops, so it returns a confident
 * RM 2.00 for a receipt that says RM 20.40 and never yields to any fallback.
 * A truncated number is far worse than a missing one: it prefills the form, it
 * looks ordinary, and the household has no reason to check it.
 *
 * On receipt text this is also simply the better reader. It requires a total
 * keyword AND a full two-decimal figure, where `extractAmount` ends in a cascade
 * of guesses ending at "any bare number on the page" — the fallbacks that make
 * it right for a line somebody TYPED are what make it weak on a page of OCR.
 * `\btotal\b` also cannot match inside "SUBTOTAL", so the subtotal trap is
 * closed by construction here rather than by filtering afterwards.
 */
function ocrTotal(text: string): number | undefined {
  const m = [
    ...text.matchAll(
      new RegExp(
        String.raw`(?:^|\n)[^\n]*?\b(?:total|jumlah|amount\s*(?:paid|due)?|bayaran)\b[^\n\d${MONEYISH_CHARS}]{0,40}` +
          String.raw`(?:RM\s*)?([${MONEYISH_CHARS}]{1,3}(?:,[${MONEYISH_CHARS}]{3})*\.[${MONEYISH_CHARS}]{2})`,
        "giu",
      ),
    ),
  ]
    // Running totals are printed as you go; the last one is what was paid.
    .at(-1);
  if (!m) return undefined;
  const value = Number(fixOcrDigits(m[1]).replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Subtotal, service charge, tax and rounding — the figures BETWEEN the items and
 * the total.
 *
 * The on-device reader did not look for these at all, so a household with no AI
 * key got line items and a total and no way to reconcile the two. That is the
 * household this product is designed around: the AI route 501s without a key,
 * and the zero-token path is the default rather than the consolation prize. The
 * arithmetic check in lib/receiptMath.ts is worth most precisely when nobody is
 * paying for a second opinion, and it needs these to run.
 *
 * Each label is matched with its own alternatives across English and Malay,
 * anchored to the line, and read with the same OCR tolerance as a price. A
 * figure that is not printed stays 0, which is what `verify` reads as "not
 * checkable" rather than as "zero ringgit".
 */
export function receiptBreakdown(text: string): {
  subtotal: number;
  serviceCharge: number;
  tax: number;
  rounding: number;
} {
  const find = (labels: string, allowNegative = false): number => {
    const m = [
      ...text.matchAll(
        new RegExp(
          String.raw`(?:^|\n)[^\n]*?\b(?:${labels})\b[^\n\d${MONEYISH_CHARS}]{0,40}` +
            String.raw`(?:RM\s*)?(-?[${MONEYISH_CHARS}]{1,3}(?:,[${MONEYISH_CHARS}]{3})*\.[${MONEYISH_CHARS}]{2})`,
          "giu",
        ),
      ),
    ].at(-1);
    if (!m) return 0;
    const v = Number(fixOcrDigits(m[1]).replace(/,/g, ""));
    if (!Number.isFinite(v)) return 0;
    return allowNegative ? Math.round(v * 100) / 100 : Math.max(0, Math.round(v * 100) / 100);
  };

  return {
    subtotal: find("sub\s*-?\s*total|subjumlah|jumlah\s+kecil"),
    // "svc" and "service charge", but NOT "service tax" — those are different
    // lines on the same Malaysian receipt and adding one to the other would
    // double-count the bill by ten percent.
    serviceCharge: find("service\s*charge|svc\s*charge|caj\s*perkhidmatan|caj\s*servis"),
    tax: find("sst|gst|service\s*tax|sales\s*tax|cukai|tax"),
    // The 5-sen adjustment, which is usually NEGATIVE — the one figure here that
    // must keep its sign.
    rounding: find("rounding(?:\s*adj(?:ustment)?)?|pembundaran|adjustment", true),
  };
}

export function parseReceiptText(text: string, knownVendors: string[] = []): ParsedVoice {
  // Amount comes from the WHOLE text — the total is usually on a line labelled
  // "Total" / "Jumlah" / "Amount Paid", and extractAmount specifically looks for
  // those keywords.
  const amount = ocrTotal(text) ?? extractAmount(text);
  const currency = detectCurrency(text);
  const occurredAt = receiptDate(text) ?? extractDate(text);

  // The merchant, though, is the first line that ISN'T furniture. On a Touch 'n
  // Go screenshot that's the payee; on a printed receipt it's the shop header.
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(
      (l) =>
        l.length >= 3 &&
        /\p{L}/u.test(l) && // Unicode, so a Chinese or Tamil shop name qualifies
        !RECEIPT_CHROME.test(l) &&
        // mostly letters, not a row of numbers
        (l.match(/\p{L}/gu)?.length ?? 0) >= l.replace(/\s/g, "").length * 0.5,
    );

  const vendor = line ? snapToKnownVendor(line.slice(0, 40), knownVendors) : undefined;

  let confidence = 0.3;
  if (amount !== undefined) confidence += 0.3;
  if (vendor) confidence += 0.2;
  if (currency) confidence += 0.1;
  if (occurredAt) confidence += 0.1;

  const lineItems = receiptLineItems(text, amount);
  const printed = receiptBreakdown(text);
  const hasBreakdown = Boolean(printed.subtotal || printed.serviceCharge || printed.tax || printed.rounding);
  const breakdown = hasBreakdown ? { ...printed, total: amount ?? 0 } : undefined;

  // ── THE RECEIPT'S OWN ARITHMETIC ─────────────────────────────────────────
  //
  // Evidence from somewhere other than the parser's opinion of itself. Items
  // that add to the printed subtotal, and a subtotal that plus the charges
  // makes the total, corroborate a read in a way "I found a vendor" never can —
  // and figures that contradict each other prove something on screen is wrong
  // whatever the tally above says.
  const checked = verify({
    amount: amount ?? 0,
    subtotal: printed.subtotal,
    serviceCharge: printed.serviceCharge,
    tax: printed.tax,
    rounding: printed.rounding,
    total: amount ?? 0,
    lineItems: lineItems ?? [],
  });

  return {
    vendor,
    amount,
    currency,
    occurredAt,
    lineItems,
    // The repaired subtotal, so an unprinted one recovered from the items is
    // still shown to the user rather than left as a blank they cannot explain.
    breakdown: breakdown ?? (checked.repaired.subtotal ? { ...printed, subtotal: checked.repaired.subtotal, total: amount ?? 0 } : undefined),
    checks: {
      confirmed: checked.confirmed,
      conflicts: checked.conflicts,
      suspect: checked.conflicts[0]?.suspect ?? null,
    },
    confidence: Math.min(1, Math.max(0, confidence * checked.factor)),
  };
}
