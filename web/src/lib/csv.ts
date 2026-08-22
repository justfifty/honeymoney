// CSV import — parsing, column mapping, and the format traps that make bank
// exports miserable.
//
// Task 10 of the 2026-08-22 brief. Two rules shape everything here:
//
//   1. NO PER-BANK PARSERS. Maybank, CIMB, Public Bank, RHB and Hong Leong share
//      no format, and a hardcoded parser per bank rots the first time one of them
//      changes an export. So this reads ANY delimited file and asks the user to
//      map the columns once, remembering the answer per source.
//
//   2. NOTHING FROM A BANK FILE GOES TO ANY MODEL. Not for parsing, not for
//      categorising, and — the one people reach for — not for guessing which
//      column is the date. A statement is the most sensitive file a household
//      owns: full merchant history, balances, account identifiers. Column
//      mapping is a UI problem, not an inference problem, and every heuristic
//      below is plain code you can read.
//
// Everything in this module is pure and synchronous, so it runs in the browser
// on the user's own machine and the file never needs to leave it.

export type Delimiter = "," | ";" | "\t" | "|";

/**
 * Split a delimited file into rows of raw strings.
 *
 * Hand-rolled rather than pulled from npm because the whole grammar is quotes,
 * doubled quotes and newlines, and a dependency here would be a supply-chain
 * risk sitting directly in the path of the most sensitive file the app touches.
 *
 * Handles: quoted fields, embedded delimiters, embedded newlines, doubled
 * quotes as an escape, CRLF, and a trailing newline.
 */
export function parseDelimited(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // A BOM at the start of a UTF-8 file becomes part of the first header name if
  // it is not stripped, so "Date" arrives as "﻿Date" and never matches.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // Swallow the \n of a \r\n rather than emitting a phantom empty row.
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  // Banks pad exports with blank lines and separator rows constantly.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * Guess the delimiter by which one produces the most CONSISTENT column count,
 * not simply the most occurrences. A description field full of commas will win
 * a naive count while producing ragged rows; consistency is what actually
 * indicates the right separator.
 */
export function sniffDelimiter(text: string): Delimiter {
  const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
  const candidates: Delimiter[] = [",", ";", "\t", "|"];
  let best: { d: Delimiter; score: number } = { d: ",", score: -1 };

  for (const d of candidates) {
    const rows = parseDelimited(sample, d).slice(0, 10);
    if (rows.length < 2) continue;
    const counts = rows.map((r) => r.length);
    const mode = counts.sort((a, b) => counts.filter((c) => c === a).length - counts.filter((c) => c === b).length).pop()!;
    if (mode < 2) continue;
    const consistent = counts.filter((c) => c === mode).length / counts.length;
    const score = consistent * mode;
    if (score > best.score) best = { d, score };
  }
  return best.d;
}

// ── amounts ────────────────────────────────────────────────────────────────

/**
 * Parse a bank's idea of a number.
 *
 * The traps, all of which appear in real Malaysian exports:
 *   • thousands separators — "1,234.56"
 *   • European decimals — "1.234,56"
 *   • trailing CR/DR markers — "1,234.56CR" means money IN
 *   • parenthesised negatives — "(1,234.56)"
 *   • currency prefixes — "RM1,234.56", "MYR 1,234.56"
 *   • a bare "-" for zero, which parses as NaN if you are not looking
 *
 * Returns null rather than 0 on failure: a row whose amount could not be read
 * must be surfaced, not silently imported as a free transaction.
 */
export function parseAmount(raw: string): { value: number; explicitSign: "in" | "out" | null } | null {
  let s = String(raw ?? "").trim();
  if (!s || s === "-" || s === "—") return null;

  let explicitSign: "in" | "out" | null = null;

  // CR/DR markers, either side, with or without a space.
  const cr = /(^cr\b|\bcr$)/i.test(s);
  const dr = /(^dr\b|\bdr$)/i.test(s);
  if (cr) explicitSign = "in";
  if (dr) explicitSign = "out";
  s = s.replace(/\b(cr|dr)\b/gi, "").trim();

  // Parenthesised negative.
  let negated = false;
  if (/^\(.*\)$/.test(s)) {
    negated = true;
    s = s.slice(1, -1).trim();
  }

  s = s.replace(/(rm|myr|sgd|usd)\s*/gi, "").replace(/\s/g, "");

  if (s.startsWith("-")) {
    negated = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  // Decide which separator is the decimal point by which one appears LAST — the
  // decimal separator is always the rightmost in both conventions. Guessing from
  // the file's locale instead gets "1.234" wrong in both directions.
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // Only commas. Two digits after the last one ⇒ decimal; otherwise thousands.
    s = /,\d{2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  }

  if (!/^\d*\.?\d+$/.test(s)) return null;
  const value = Number(s);
  if (!Number.isFinite(value)) return null;

  if (negated) explicitSign = "out";
  return { value, explicitSign };
}

// ── dates ──────────────────────────────────────────────────────────────────

export type DateOrder = "dmy" | "mdy" | "ymd";

/**
 * What order are these dates in? `03/04/2026` is 3 April in Malaysia and 4 March
 * in a US export, and a whole statement silently landing in the wrong month is
 * exactly the kind of error nobody notices until reconciliation.
 *
 * Returns the inferred order AND whether the file actually proves it. When any
 * value has a first component above 12, the order is certain. When every date is
 * ambiguous, this reports `certain: false` and the UI must ASK — the brief is
 * explicit that this is confirmed with the user, never assumed.
 */
export function inferDateOrder(samples: string[]): { order: DateOrder; certain: boolean } {
  let firstOver12 = 0;
  let secondOver12 = 0;
  let isoLike = 0;
  let seen = 0;

  for (const raw of samples) {
    const s = String(raw ?? "").trim();
    if (!s) continue;
    const m = s.match(/^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})$/);
    if (!m) continue;
    seen++;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (m[1].length === 4) {
      isoLike++;
      continue;
    }
    if (a > 12) firstOver12++;
    if (b > 12) secondOver12++;
  }

  if (isoLike > 0 && isoLike >= seen / 2) return { order: "ymd", certain: true };
  if (firstOver12 > 0 && secondOver12 === 0) return { order: "dmy", certain: true };
  if (secondOver12 > 0 && firstOver12 === 0) return { order: "mdy", certain: true };
  // Nothing in the file distinguishes them. Malaysian exports are overwhelmingly
  // day-first, so that is the default offered — but `certain: false` means the
  // user is asked rather than told.
  return { order: "dmy", certain: false };
}

/** Parse one date under a known order. Returns null rather than guessing. */
export function parseDate(raw: string, order: DateOrder): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  // Textual months ("12 Mar 2026", "Mar 12, 2026") are unambiguous, so they
  // bypass the order entirely.
  //
  // Rebuilt through UTC rather than returned straight from Date.parse, which
  // reads a bare date as LOCAL midnight — so in UTC+8 `toISOString()` then hands
  // back the previous day and a whole statement lands one day early. The numeric
  // path below already anchors at UTC noon for the same reason; this one has to
  // as well, and the check:csv case exists because the bug is invisible: every
  // date is still a plausible date.
  const text = Date.parse(s.replace(/(\d)(st|nd|rd|th)/gi, "$1"));
  if (/[a-z]{3}/i.test(s) && Number.isFinite(text)) {
    const local = new Date(text);
    return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate(), 12))
      .toISOString()
      .slice(0, 10);
  }

  const m = s.match(/^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})$/);
  if (!m) return null;
  const p = [Number(m[1]), Number(m[2]), Number(m[3])];

  let d: number, mo: number, y: number;
  if (order === "ymd" || m[1].length === 4) [y, mo, d] = p;
  else if (order === "mdy") [mo, d, y] = p;
  else [d, mo, y] = p;

  // Two-digit years: bank exports are recent, so 26 is 2026 and 98 is 1998.
  if (y < 100) y += y <= 70 ? 2000 : 1900;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  const date = new Date(Date.UTC(y, mo - 1, d, 12));
  // Rejects 31 February, which JS would otherwise roll into March.
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

// ── column mapping ─────────────────────────────────────────────────────────

export interface ColumnMap {
  date: number;
  description: number;
  /** One signed column. Mutually exclusive with debit/credit. */
  amount: number | null;
  /** Two-column layout: money out and money in. */
  debit: number | null;
  credit: number | null;
  balance: number | null;
  dateOrder: DateOrder;
}

const HEADER_HINTS: Record<keyof Omit<ColumnMap, "dateOrder">, RegExp> = {
  date: /^(date|txn date|transaction date|posting date|value date|tarikh)/i,
  description: /^(description|desc|details|particulars|narrative|transaction|reference|keterangan|butiran)/i,
  amount: /^(amount|value|jumlah|nilai)/i,
  debit: /^(debit|withdrawal|dr|out|paid out|keluar)/i,
  credit: /^(credit|deposit|cr|in|paid in|masuk)/i,
  balance: /^(balance|running balance|baki)/i,
};

/**
 * A first guess at the mapping from the header row. Only ever a SUGGESTION —
 * the user confirms it, which is what makes per-bank parsers unnecessary and
 * keeps the file away from any model.
 */
export function guessColumns(header: string[], rows: string[][]): ColumnMap {
  const find = (re: RegExp) => header.findIndex((h) => re.test(String(h ?? "").trim()));

  const map: ColumnMap = {
    date: find(HEADER_HINTS.date),
    description: find(HEADER_HINTS.description),
    amount: nullIfMissing(find(HEADER_HINTS.amount)),
    debit: nullIfMissing(find(HEADER_HINTS.debit)),
    credit: nullIfMissing(find(HEADER_HINTS.credit)),
    balance: nullIfMissing(find(HEADER_HINTS.balance)),
    dateOrder: "dmy",
  };

  // A file with separate debit and credit columns must not ALSO use a signed
  // amount column, or every row would be counted twice.
  if (map.debit !== null && map.credit !== null) map.amount = null;

  // No usable header — some exports start straight at the data. Fall back to
  // shape: the first column that parses as a date, and the last that parses as
  // a number, which is the near-universal layout.
  if (map.date === -1 && rows.length) {
    map.date = rows[0].findIndex((c) => parseDate(c, "dmy") !== null);
  }
  if (map.description === -1 && rows.length) {
    map.description = rows[0].findIndex((c, i) => i !== map.date && parseAmount(c) === null && c.trim() !== "");
  }
  if (map.amount === null && map.debit === null && map.credit === null && rows.length) {
    for (let i = rows[0].length - 1; i >= 0; i--) {
      if (i !== map.date && parseAmount(rows[0][i]) !== null) {
        map.amount = i;
        break;
      }
    }
  }

  const dateSamples = rows.slice(0, 40).map((r) => r[map.date] ?? "");
  map.dateOrder = inferDateOrder(dateSamples).order;
  return map;
}

function nullIfMissing(i: number): number | null {
  return i === -1 ? null : i;
}

export interface ParsedRow {
  date: string | null;
  description: string;
  /** Always positive. Direction is carried separately. */
  amount: number | null;
  direction: "in" | "out";
  balance: number | null;
  /** Why this row cannot be imported as-is. Empty ⇒ fine. */
  problems: string[];
}

/**
 * Apply a mapping to the data rows.
 *
 * A row that cannot be read is RETURNED WITH ITS PROBLEMS rather than dropped.
 * Silently skipping unreadable rows is how an import of 90 transactions
 * cheerfully creates 87 and reconciles to nothing.
 */
export function applyMapping(rows: string[][], map: ColumnMap): ParsedRow[] {
  return rows.map((r) => {
    const problems: string[] = [];

    const date = parseDate(r[map.date] ?? "", map.dateOrder);
    if (!date) problems.push("date");

    const description = String(r[map.description] ?? "").trim();
    if (!description) problems.push("description");

    let amount: number | null = null;
    let direction: "in" | "out" = "out";

    if (map.debit !== null || map.credit !== null) {
      const d = map.debit !== null ? parseAmount(r[map.debit] ?? "") : null;
      const c = map.credit !== null ? parseAmount(r[map.credit] ?? "") : null;
      if (d && d.value > 0) {
        amount = d.value;
        direction = "out";
      } else if (c && c.value > 0) {
        amount = c.value;
        direction = "in";
      }
    } else if (map.amount !== null) {
      const a = parseAmount(r[map.amount] ?? "");
      if (a) {
        amount = a.value;
        // An explicit sign or CR/DR marker wins; otherwise a bare positive
        // number in a single-column export is a debit, which is what these
        // files overwhelmingly contain.
        direction = a.explicitSign ?? "out";
      }
    }

    if (amount === null || !(amount > 0)) problems.push("amount");

    const balance = map.balance !== null ? (parseAmount(r[map.balance] ?? "")?.value ?? null) : null;

    return { date, description, amount, direction, balance, problems };
  });
}

/**
 * A stable content key for one row, used to spot a re-import of an overlapping
 * date range — the most common thing a user does.
 *
 * Deliberately readable rather than a hash. lib/dedupe.ts already fingerprints
 * the same way for live records, and a composite key can be eyeballed in a bug
 * report where a SHA-256 can only be compared. It is not a security boundary,
 * so opacity buys nothing.
 */
export function contentKey(r: ParsedRow): string {
  const desc = r.description.toLowerCase().replace(/[^a-z0-9¡-￿]+/g, " ").trim().slice(0, 40);
  return `${r.date ?? "?"}|${(r.amount ?? 0).toFixed(2)}|${r.direction}|${desc}`;
}
