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
  lineItems?: { label: string; amount: number }[];
  /** How confident the *local* parser is. The AI path reports its own. */
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
function stripNonMoney(text: string): string {
  return text
    .replace(/\b\d{1,2}:\d{2}\b/g, " ") // 7:30
    .replace(/\b\d{1,2}[.:]\d{2}\s*(?:am|pm)\b/gi, " ") // 7.30pm
    .replace(/\b(?:19|20)\d{2}\b/g, " ") // years
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, " "); // 3/7, 03-07-2026
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
      /((?:sub)?)(?:total|jumlah|amount|bayar|paid|spent|harga|price|合计|總計|總共|मूल्य|மொத்தம்)[^\d\n]{0,40}(\d+(?:[.,]\d{1,2})?)/giu,
    ),
  ];
  const totals = hits.filter((h) => !h[1]);
  const chosen = (totals.length ? totals : hits).at(-1);
  if (chosen) return parseFloat(chosen[2].replace(",", "."));

  // 2) adjacent to a currency marker, either side: "RM 12.50" or "12.50 ringgit"
  const before = t.match(/(?:rm|myr|ringgit|s\$|sgd|usd|\$|£|฿|¥)\s*(\d+(?:[.,]\d{1,2})?)/iu);
  if (before) return parseFloat(before[1].replace(",", "."));
  const after = t.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:rm|myr|ringgit|sen|dollars?|pounds?|baht|yuan|yen)\b/iu);
  if (after) return parseFloat(after[1].replace(",", "."));

  // 3) "twelve ringgit fifty (sen)" — spoken decimals
  const split = t.match(/(\d+)\s*(?:ringgit|dollars?|point|perpuluhan)\s*(\d{1,2})\b/iu);
  if (split) return parseFloat(`${split[1]}.${split[2].padStart(2, "0")}`);

  // 4) any bare number. Prefer one with decimals (money usually has them);
  //    otherwise take the LAST, not the largest — "99 Speedmart, spent 12"
  //    should be 12, and the old Math.max() is exactly why it used to say 99.
  const digits = [...t.matchAll(/(\d+(?:[.,]\d{1,2})?)/g)]
    .map((m) => parseFloat(m[1].replace(",", ".")))
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
  const forms = [
    amount.toFixed(2), // 42.50
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

export function receiptLineItems(text: string, total?: number): { label: string; amount: number }[] | undefined {
  const items: { label: string; amount: number }[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length < 4 || RECEIPT_CHROME.test(line) || NOT_AN_ITEM.test(line)) continue;

    // Label, then optionally a "2 x 3.50" quantity clause, then the price.
    const m = line.match(
      /^(.{2,40}?)\s+(?:\d+\s*[x×]\s*[\d.,]+\s+)?(?:RM\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{2}))$/i,
    );
    if (!m) continue;

    const label = m[1].replace(/[.•*_-]+$/, "").trim();
    if ((label.match(/\p{L}/gu)?.length ?? 0) < 2) continue;

    const amount = Number(m[2].replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    items.push({ label, amount });
    // A till roll can be long; past twenty lines this stops being a summary.
    if (items.length >= 20) break;
  }

  // Apply the ceiling only if the total is credible — i.e. at least as large as
  // the biggest line. A total smaller than one of its own items is a misread,
  // and filtering by it would delete the real lines instead of the fake one.
  const max = Math.max(...items.map((i) => i.amount), 0);
  const kept = total !== undefined && total >= max ? items.filter((i) => i.amount <= total) : items;

  return kept.length ? kept : undefined;
}

export function parseReceiptText(text: string, knownVendors: string[] = []): ParsedVoice {
  // Amount comes from the WHOLE text — the total is usually on a line labelled
  // "Total" / "Jumlah" / "Amount Paid", and extractAmount specifically looks for
  // those keywords.
  const amount = extractAmount(text);
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

  return { vendor, amount, currency, occurredAt, lineItems, confidence: Math.min(1, confidence) };
}
