// Credit-card and bank statement import.
//
// A receipt is one payment. A statement is a month of them — which changes what
// "getting it right" means. Three things follow from that, and they're the whole
// design:
//
//   1. EXACT AMOUNTS. We read the PDF's text layer, not an OCR of it. A bank's
//      PDF already contains "1,234.56" as characters. Nothing here guesses at a
//      digit. (A scanned statement has no text layer; that path is vision, and
//      it says so out loud — see readStatement.)
//
//   2. DUPLICATES ARE THE NORMAL CASE, not the exception. You scanned the ZUS
//      receipt on Tuesday; the card statement lists it too. You imported
//      January; February's statement overlaps it. So every row is checked
//      arithmetically against what's already stored (lib/dedupe.ts) and against
//      the rest of the batch, and a match is un-ticked before the user sees it.
//
//   3. IT RECONCILES. We add up what we found and check it against the balance
//      the bank itself printed. If those don't agree, we say so. An importer
//      that silently drops three rows out of ninety is worse than useless — you
//      would never know, and the books would be quietly wrong.
//
// Nothing is written here. This produces a proposal; the user ticks what to
// keep, and only then does anything reach the ledger.

import { aiGenerate, aiVision } from "./ai";
import { activeAiProvider, isProviderConfigured, type AiProvider } from "./config";
import { findDuplicates, type DuplicateMatch } from "./dedupe";
import { loadExisting } from "./dedupe";
import { ground, rememberedBucket } from "./receipt";
import { extractPdfText } from "./pdf";

// Money out of the account (a real spend) vs money back into it. The distinction
// decides both what gets ticked by default and how we reconcile.
export const OUTFLOW = ["purchase", "fee", "interest"] as const;
export const INFLOW = ["payment", "refund", "cashback"] as const;
export type RowType = (typeof OUTFLOW)[number] | (typeof INFLOW)[number];

export function isOutflow(t: RowType): boolean {
  return (OUTFLOW as readonly string[]).includes(t);
}

export interface StatementRow {
  date: string; // ISO 8601
  description: string; // the raw descriptor, kept verbatim for the audit trail
  vendor: string; // the merchant, cleaned
  amount: number; // always positive; `type` carries the direction
  type: RowType;
  foreign: { amount: number; currency: string } | null;
}

export interface StatementMeta {
  issuer: string;
  cardLast4: string;
  statementDate: string;
  dueDate: string;
  currency: string;
  previousBalance: number | null;
  newBalance: number | null;
  minimumPayment: number | null;
}

export interface ProposedRow extends StatementRow {
  index: number;
  bucket: { nodeId: string; label: string; reason: string } | null;
  duplicate: DuplicateMatch | null;
  /** What we suggest. The user overrides it; we never decide for them. */
  include: boolean;
}

export interface Reconciliation {
  ok: boolean;
  outflow: number;
  inflow: number;
  previousBalance: number | null;
  newBalance: number | null;
  /** What the statement's own balances say the month's movement was. */
  expectedMovement: number | null;
  /** What our rows add up to. */
  foundMovement: number;
  discrepancy: number | null;
  note: string;
}

export interface StatementResult {
  meta: StatementMeta;
  rows: ProposedRow[];
  reconciliation: Reconciliation;
  pageCount: number;
  provider: AiProvider;
  scanned: boolean;
  degraded?: string;
}

// ── Prompts ─────────────────────────────────────────────────────────────────

const EXTRACT_SYSTEM = `You read Malaysian credit-card and bank statements: Maybank,
CIMB, Public Bank, RHB, Hong Leong, AmBank, Bank Islam, UOB, HSBC, Standard
Chartered, Alliance, Affin, and the digital banks (GXBank, Boost Bank, AEON Bank).

Rules you must follow:

- DATES ARE DD/MM. Malaysian statements never write MM/DD. "03/07" is 3 July.
  Many statements print two dates per row (transaction date and posting date) —
  use the TRANSACTION date, the one the money was actually spent.
- A statement usually shows only day and month, not the year. Infer the year from
  the statement date you are given, and remember a statement dated January often
  contains December transactions — those belong to the previous year.
- AMOUNTS: "1,234.56" is one thousand two hundred and thirty four ringgit. Strip
  the thousands separator. A trailing "CR" (or a minus sign, or a bracketed
  figure) means money coming BACK to the customer — a payment, a refund, a
  reversal, cashback. Everything else is money going out.
- CLASSIFY every row:
    purchase — a normal spend at a merchant
    fee      — annual fee, late-payment charge, service tax, stamp duty, cash-advance fee
    interest — finance charges
    payment  — the customer paying their card bill (money in). NOT a spend.
    refund   — a merchant refund or a reversed charge (money in)
    cashback — rebates and rewards credited (money in)
- The AMOUNT you return is always POSITIVE. The "type" carries the direction.
- MERCHANT: card descriptors are noisy — "GRABFOOD*ORDER 4Y2K KUALA LUMPUR MY",
  "SHOPEE MY*82910 SINGAPORE". Return the readable merchant ("GrabFood",
  "Shopee"), and keep the raw descriptor in "description" untouched.
- FOREIGN CURRENCY: a row billed abroad shows the original amount too. Put the
  RINGGIT figure in "amount" (that is what actually left the account) and the
  original in "foreign".
- SKIP anything that is not a transaction: opening/closing balance lines, credit
  limit, minimum payment due, reward-point summaries, column headers, page
  footers, marketing text.
- Do not invent rows and do not merge two rows into one. If a line is unreadable,
  leave it out rather than guessing at the number.`;

function rowsPrompt(chunk: string, knownVendors: string[], statementDate: string): string {
  return `STATEMENT TEXT (a fragment of a longer statement)
"""
${chunk}
"""

STATEMENT DATE (use it to infer the year of each row): ${statementDate || "unknown"}

MERCHANTS THIS HOUSEHOLD ALREADY HAS
(If a descriptor clearly refers to one of these, return that merchant's name
EXACTLY as written here. Matching the existing spelling is what lets us tell that
a row you return is the same payment they already logged from a receipt.)
${JSON.stringify(knownVendors)}

Return ONLY strict JSON:
{
  "rows": [
    {
      "date": string,          // ISO 8601 date, e.g. "2026-07-03"
      "description": string,   // the raw descriptor line, verbatim
      "vendor": string,        // the readable merchant
      "amount": number,        // POSITIVE ringgit figure
      "type": "purchase" | "fee" | "interest" | "payment" | "refund" | "cashback",
      "foreign": { "amount": number, "currency": string } | null
    }
  ]
}`;
}

function metaPrompt(head: string): string {
  return `The first page of a Malaysian card/bank statement:
"""
${head}
"""

Return ONLY strict JSON. Use null for anything the page does not state:
{
  "issuer": string,              // the bank, e.g. "Maybank"
  "cardLast4": string,           // last 4 digits only, "" if absent
  "statementDate": string,       // ISO date
  "dueDate": string,             // ISO date
  "currency": string,            // ISO code, default "MYR"
  "previousBalance": number | null,
  "newBalance": number | null,
  "minimumPayment": number | null
}`;
}

// ── Parsing helpers ─────────────────────────────────────────────────────────

function parseJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The model did not return JSON.");
  return JSON.parse(body.slice(start, end + 1)) as T;
}

const ALL_TYPES: RowType[] = [...OUTFLOW, ...INFLOW];

function coerceRow(raw: Record<string, unknown>): StatementRow | null {
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const vendor = typeof raw.vendor === "string" ? raw.vendor.trim().slice(0, 80) : "";
  const description = typeof raw.description === "string" ? raw.description.trim().slice(0, 200) : "";
  if (!vendor && !description) return null;

  const d = new Date(String(raw.date));
  if (Number.isNaN(d.getTime())) return null;

  const type = ALL_TYPES.includes(raw.type as RowType) ? (raw.type as RowType) : "purchase";

  const f = raw.foreign as { amount?: unknown; currency?: unknown } | null | undefined;
  const fAmount = Number(f?.amount);
  const foreign =
    f && Number.isFinite(fAmount) && fAmount > 0 && typeof f.currency === "string"
      ? { amount: Math.round(fAmount * 100) / 100, currency: f.currency.toUpperCase().slice(0, 4) }
      : null;

  return {
    date: d.toISOString(),
    description,
    vendor: vendor || description.slice(0, 40),
    amount: Math.round(amount * 100) / 100,
    type,
    foreign,
  };
}

// Statements run to thousands of characters and a model asked to transcribe 90
// rows in one breath starts dropping them somewhere around row 40. Feeding it a
// page or two at a time keeps recall high — and because we reconcile against the
// bank's own totals afterwards, a chunk that goes wrong is *visible* rather than
// silent.
const CHUNK_CHARS = 12_000;

function chunkPages(pages: string[]): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const page of pages) {
    if (current && current.length + page.length > CHUNK_CHARS) {
      chunks.push(current);
      current = "";
    }
    current += (current ? "\n\n" : "") + page;
  }
  if (current) chunks.push(current);
  return chunks;
}

// ── The pipeline ────────────────────────────────────────────────────────────

export async function readStatement(
  tenantId: string,
  fileBase64: string,
  password?: string,
  mimeType = "application/pdf",
): Promise<StatementResult> {
  const provider = activeAiProvider();
  if (!isProviderConfigured(provider)) {
    throw new Error(`AI is not configured (AI_PROVIDER=${provider}). See docs/AI_SETUP.md.`);
  }

  // Grounding and the existing-transaction list are needed either way, and
  // neither depends on the file — fetch them while the model reads.
  const [g, existing] = await Promise.all([ground(tenantId), loadExisting(tenantId)]);
  const knownVendors = g.vendorHistory.map((v) => v.vendor).filter((v) => v && v !== "Unknown");

  let meta: StatementMeta;
  let rows: StatementRow[];
  let degraded: string | undefined;
  let pageCount = 1;
  let scanned = false;

  if (mimeType.startsWith("image/")) {
    // A phone photo or screenshot of a statement / multi-item receipt — read
    // EVERY row visually. Unlike a raw PDF this works on any vision provider.
    scanned = true;
    degraded =
      "This was read from an image, so the amounts were read visually rather than from text — please check them against the original.";
    const raw = await aiVision(
      rowsPrompt("(the attached image)", knownVendors, "") + "\n\nAlso return the statement header fields.",
      fileBase64,
      {
        mimeType,
        system: EXTRACT_SYSTEM,
        json: true,
        fn: "readStatement.image",
        provider,
        meta: { tenantId, source: "statement" },
      },
    );
    const parsed = parseJson<{ rows?: Record<string, unknown>[] } & Partial<StatementMeta>>(raw);
    rows = (parsed.rows ?? []).map(coerceRow).filter((r): r is StatementRow => r !== null);
    meta = coerceMeta(parsed);
    return finalizeStatement(rows, meta, { g, existing, provider, pageCount, scanned, degraded, tenantId });
  }

  const bytes = Buffer.from(fileBase64, "base64");
  const pdf = await extractPdfText(new Uint8Array(bytes), password);
  pageCount = pdf.pageCount;
  scanned = pdf.scanned;

  if (pdf.scanned) {
    // No text layer. Only a multimodal model can read this, and only Gemini
    // accepts a PDF directly — so say plainly what's needed rather than handing
    // back a confidently wrong set of numbers.
    if (provider !== "gemini") {
      throw new Error(
        "This PDF is a scan — it has no text to read. Reading it needs a vision model that accepts PDFs: set AI_PROVIDER=gemini, or upload a photo/screenshot image of the pages instead.",
      );
    }
    degraded =
      "This statement is a scan, so the amounts were read visually rather than from the PDF's text. Please check them against the paper.";
    const raw = await aiVision(
      rowsPrompt("(the attached PDF)", knownVendors, "") + "\n\nAlso return the statement header fields.",
      fileBase64,
      {
        mimeType: "application/pdf",
        system: EXTRACT_SYSTEM,
        json: true,
        fn: "readStatement.vision",
        provider,
        meta: { tenantId, source: "statement" },
      },
    );
    const parsed = parseJson<{ rows?: Record<string, unknown>[] } & Partial<StatementMeta>>(raw);
    rows = (parsed.rows ?? []).map(coerceRow).filter((r): r is StatementRow => r !== null);
    meta = coerceMeta(parsed);
  } else {
    meta = await readMeta(pdf.pages[0] ?? "", tenantId, provider);

    const chunks = chunkPages(pdf.pages);
    const perChunk = await Promise.all(
      chunks.map(async (chunk) => {
        const raw = await aiGenerate(rowsPrompt(chunk, knownVendors, meta.statementDate), {
          system: EXTRACT_SYSTEM,
          json: true,
          fn: "readStatement.rows",
          provider,
          meta: { tenantId, source: "statement" },
        });
        const parsed = parseJson<{ rows?: Record<string, unknown>[] }>(raw);
        return (parsed.rows ?? []).map(coerceRow).filter((r): r is StatementRow => r !== null);
      }),
    );
    rows = perChunk.flat();
  }

  return finalizeStatement(rows, meta, { g, existing, provider, pageCount, scanned, degraded, tenantId });
}

// Shared tail for both the PDF and image paths: sort, dedupe against the books,
// pre-file buckets from history (+ classify genuinely-new merchants), and build
// the reviewable proposal. Nothing is saved here — the user confirms on /import.
async function finalizeStatement(
  rows: StatementRow[],
  meta: StatementMeta,
  ctx: {
    g: Awaited<ReturnType<typeof ground>>;
    existing: Awaited<ReturnType<typeof loadExisting>>;
    provider: AiProvider;
    pageCount: number;
    scanned: boolean;
    degraded?: string;
    tenantId: string;
  },
): Promise<StatementResult> {
  const { g, existing, provider, pageCount, scanned, degraded, tenantId } = ctx;
  rows.sort((a, b) => a.date.localeCompare(b.date));

  // Duplicates: against the books, and against the rest of this statement.
  const dupes = findDuplicates(
    rows.map((r) => ({ vendor: r.vendor, amount: r.amount, occurredAt: r.date })),
    existing,
  );

  // Buckets: the household's own filing history first — free, instant, and more
  // trustworthy than any model. Only genuinely new merchants cost an AI call.
  const remembered = rows.map((r) => rememberedBucket(r.vendor, g.vendorHistory));
  const unknownVendors = [
    ...new Set(
      rows
        .filter((r, i) => !remembered[i] && isOutflow(r.type))
        .map((r) => r.vendor)
        .filter(Boolean),
    ),
  ];

  let guessed: Record<string, { nodeId: string; label: string }> = {};
  if (unknownVendors.length && g.buckets.length) {
    try {
      guessed = await classifyVendors(unknownVendors, g.buckets, tenantId, provider);
    } catch {
      // A failed classification just means those rows arrive with no bucket
      // pre-selected. The import still works; the user picks.
    }
  }

  const proposed: ProposedRow[] = rows.map((r, i) => {
    const mem = remembered[i];
    const guess = guessed[r.vendor];
    const bucket = mem
      ? { nodeId: mem.id, label: mem.label, reason: mem.reason }
      : guess
        ? { nodeId: guess.nodeId, label: guess.label, reason: "Suggested — you haven't filed this merchant before." }
        : null;

    const duplicate = dupes[i];

    return {
      ...r,
      index: i,
      bucket,
      duplicate,
      // Card payments, refunds and cashback are money moving back — importing
      // them as spends would double-count the month. And a row already in the
      // books is exactly what we're here to prevent.
      include: isOutflow(r.type) && duplicate?.certainty !== "exact",
    };
  });

  return {
    meta,
    rows: proposed,
    reconciliation: reconcile(rows, meta),
    pageCount,
    provider,
    scanned,
    degraded,
  };
}

function coerceMeta(raw: Partial<StatementMeta>): StatementMeta {
  const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  };
  const date = (v: unknown): string => {
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  };
  return {
    issuer: String(raw.issuer ?? "").slice(0, 60),
    cardLast4: String(raw.cardLast4 ?? "").replace(/\D/g, "").slice(-4),
    statementDate: date(raw.statementDate),
    dueDate: date(raw.dueDate),
    currency: (String(raw.currency ?? "MYR").toUpperCase() || "MYR").slice(0, 4),
    previousBalance: num(raw.previousBalance),
    newBalance: num(raw.newBalance),
    minimumPayment: num(raw.minimumPayment),
  };
}

async function readMeta(head: string, tenantId: string, provider: AiProvider): Promise<StatementMeta> {
  try {
    const raw = await aiGenerate(metaPrompt(head.slice(0, 6000)), {
      system: EXTRACT_SYSTEM,
      json: true,
      fn: "readStatement.meta",
      provider,
      meta: { tenantId, source: "statement" },
    });
    return coerceMeta(parseJson<Partial<StatementMeta>>(raw));
  } catch {
    return coerceMeta({});
  }
}

// One call for every new merchant on the statement, rather than one call per
// row. A 90-row statement from a household that shops in the usual places has
// maybe eight merchants it has never seen.
async function classifyVendors(
  vendors: string[],
  buckets: { id: string; label: string; tier: number }[],
  tenantId: string,
  provider: AiProvider,
): Promise<Record<string, { nodeId: string; label: string }>> {
  const raw = await aiGenerate(
    `Assign each merchant to the single best bucket for this household.

BUCKETS (use the exact id; tier 1 = Must-paid, 2 = Savings, 3 = Spendings)
${JSON.stringify(buckets)}

MERCHANTS
${JSON.stringify(vendors)}

Return ONLY strict JSON: { "assignments": [ { "vendor": string, "nodeId": string } ] }
Every vendor must appear exactly once. Never invent a nodeId.`,
    {
      system:
        "You file merchants into a Malaysian household's spending buckets. Rent, utilities, telco, insurance, loan and school fees are commitments the household has already promised — tier 1. Transfers into savings or investment are tier 2. Groceries, food, fuel, retail and everything discretionary is tier 3. Choose only from the ids given.",
      json: true,
      fn: "readStatement.classify",
      provider,
      meta: { tenantId, source: "statement" },
    },
  );

  const parsed = parseJson<{ assignments?: { vendor?: string; nodeId?: string }[] }>(raw);
  const out: Record<string, { nodeId: string; label: string }> = {};
  for (const a of parsed.assignments ?? []) {
    const bucket = buckets.find((b) => b.id === a.nodeId); // never trust an id we didn't issue
    if (bucket && typeof a.vendor === "string") {
      out[a.vendor] = { nodeId: bucket.id, label: bucket.label };
    }
  }
  return out;
}

// Does what we found add up to what the bank says happened? This is the check
// that turns "the AI read your statement" into something a person can actually
// rely on — and the only one that can catch a row the model quietly dropped.
export function reconcile(rows: StatementRow[], meta: StatementMeta): Reconciliation {
  const sum = (pred: (r: StatementRow) => boolean) =>
    Math.round(rows.filter(pred).reduce((n, r) => n + r.amount, 0) * 100) / 100;

  const outflow = sum((r) => isOutflow(r.type));
  const inflow = sum((r) => !isOutflow(r.type));
  const foundMovement = Math.round((outflow - inflow) * 100) / 100;

  const { previousBalance: prev, newBalance: next } = meta;
  if (prev === null || next === null) {
    return {
      ok: true,
      outflow,
      inflow,
      previousBalance: prev,
      newBalance: next,
      expectedMovement: null,
      foundMovement,
      discrepancy: null,
      note: `Found ${rows.length} transactions totalling RM ${outflow.toFixed(2)} out${inflow ? ` and RM ${inflow.toFixed(2)} in` : ""}. This statement didn't print an opening and closing balance, so there's nothing to cross-check them against — worth a glance before you import.`,
    };
  }

  const expectedMovement = Math.round((next - prev) * 100) / 100;
  const discrepancy = Math.round((foundMovement - expectedMovement) * 100) / 100;
  // A sen or two is rounding. Anything more is a row we missed or misread.
  const ok = Math.abs(discrepancy) <= 0.02;

  return {
    ok,
    outflow,
    inflow,
    previousBalance: prev,
    newBalance: next,
    expectedMovement,
    foundMovement,
    discrepancy,
    note: ok
      ? `Balanced. ${rows.length} transactions: RM ${outflow.toFixed(2)} out, RM ${inflow.toFixed(2)} in — which is exactly the RM ${expectedMovement.toFixed(2)} your balance moved this month.`
      : `The ${rows.length} rows I read come to RM ${foundMovement.toFixed(2)}, but your balance moved RM ${expectedMovement.toFixed(2)} — a difference of RM ${Math.abs(discrepancy).toFixed(2)}. Something on the statement didn't get read. Import what's here if you like, then add the missing rows by hand.`,
  };
}
