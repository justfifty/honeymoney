// Agentic receipt analytics.
//
// A single "read the image" call is OCR, not analysis — it tells you a number
// and a shop name, and leaves the user to do the thinking. This runs a small
// agent loop instead, where each step is grounded in the household's actual
// graph rather than in the model's imagination:
//
//   1. PERCEIVE  — a vision model reads the receipt / e-wallet screenshot.
//   2. GROUND    — we fetch the household's real buckets, vendors, recent
//                  spending, and which bucket they file each vendor under. No
//                  step below is allowed to invent an id.
//   3. DECIDE    — the household's own filing history picks the bucket where it
//                  has one, and arithmetic (not the model) decides duplicates.
//                  A text model, given only real options, fills the rest: spots
//                  a subscription and calls out anything anomalous versus this
//                  household's history.
//   4. EXPLAIN   — one plain-English line the user can act on.
//
// Nothing is written. The agent proposes; the human confirms; and if the human
// corrects it, that correction is what gets stored — and the correction itself
// is recorded in the audit ledger.

import { aiGenerate, aiVision } from "./ai";
import { activeAiProvider, isProviderConfigured, type AiProvider } from "./config";
import { findDuplicate, type DuplicateMatch, type ExistingTxn } from "./dedupe";
import { pbList, pbStr } from "./pocketbase";

export interface ReceiptExtraction {
  vendor: string;
  amount: number; // the final total paid — the canonical figure the app records
  currency: string;
  occurredAt: string; // ISO 8601, or "" if the receipt didn't say
  paymentMethod: string; // "Touch 'n Go", "MAE", "card", "cash"…
  // The Malaysian receipt breakdown, when printed. Each is 0 if the receipt
  // doesn't show it. `total` is the printed grand total and equals `amount`.
  subtotal: number; // goods/services before service charge & tax
  serviceCharge: number; // e.g. 10% (restaurants), 0 if none
  tax: number; // SST / service tax (or older GST), 0 if none
  total: number; // final total after service charge & tax
  lineItems: { label: string; amount: number }[];
  confidence: number; // 0..1, the model's own honesty about the read
}

export interface ReceiptAnalysis {
  bucket: { nodeId: string; label: string; reason: string } | null;
  duplicateOf:
    | { id: string; vendor: string; amount: number; occurredAt: string; why: string; certainty: "exact" | "likely" }
    | null;
  subscription: { likely: boolean; cadence: string; note: string } | null;
  anomaly: { flagged: boolean; note: string } | null;
  insight: string;
}

export interface ReceiptResult {
  extraction: ReceiptExtraction;
  analysis: ReceiptAnalysis | null;
  provider: AiProvider;
  degraded?: string; // set when a step failed and we returned less than we'd like
}

const EXTRACT_SYSTEM = `You read Malaysian payment receipts and e-wallet screenshots:
Touch 'n Go eWallet, MAE by Maybank, GrabPay, ShopeePay, Boost, DuitNow QR, and
bank apps, plus ordinary printed shop receipts (mamak, kedai runcit, 99 Speedmart,
Tesco/Lotus's, AEON, Mydin, Tealive, ZUS Coffee, Shell/Petronas).

Rules you must follow:
- The MERCHANT is who was paid. It is never the wallet app itself: "Touch 'n Go",
  "TNG eWallet", "DuitNow", "Maybank", "MAE", "GrabPay" are payment rails, not
  merchants. If the screenshot shows a transfer to a person, the merchant is that
  person's name.
- The AMOUNT is what left the user's pocket. Ignore the wallet's remaining
  balance, any reload amount, cashback, and points. If several totals appear,
  take the one labelled Total / Jumlah / Amount Paid / Bayaran.
- Many Malaysian receipts print a BREAKDOWN before the total: a Subtotal, then a
  Service Charge (often 10%, common in restaurants), then SST / Service Tax (or
  older receipts GST), sometimes a Rounding Adjustment, then the final Total.
  Capture subtotal, serviceCharge, tax and total separately when they are
  printed; put 0 for any that the receipt does not show. "amount" and "total"
  are the SAME final figure paid, after service charge and tax.
- Malaysian receipts write dates as DD/MM/YYYY, never MM/DD. "03/07/2026" is
  3 July, not 3 March.
- If the image genuinely does not show a field, leave it empty and lower your
  confidence. Do not guess. A wrong number a user trusts is worse than a blank
  one they fill in.`;

const EXTRACT_PROMPT = `Extract the payment from this image. Return ONLY strict JSON:
{
  "vendor": string,          // the merchant paid; "" if truly unreadable
  "amount": number,          // final total paid, as a number; 0 if unreadable
  "currency": string,        // ISO code, default "MYR"
  "occurredAt": string,      // ISO 8601 datetime, or "" if absent
  "paymentMethod": string,   // wallet/app/card/cash used, or ""
  "subtotal": number,        // before service charge & tax; 0 if not shown
  "serviceCharge": number,   // service charge (e.g. 10%); 0 if not shown
  "tax": number,             // SST / service tax / GST; 0 if not shown
  "total": number,           // final total after service charge & tax; = amount
  "lineItems": [ { "label": string, "amount": number } ],  // [] if not itemised
  "confidence": number       // 0..1 — your honest confidence in the amount+vendor
}`;

function parseJson<T>(raw: string): T {
  // Models sometimes wrap JSON in prose or a fenced block despite being asked not to.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The model did not return JSON.");
  return JSON.parse(body.slice(start, end + 1)) as T;
}

function coerceExtraction(raw: Partial<ReceiptExtraction>): ReceiptExtraction {
  // Non-negative money coercion, rounded to sen; 0 when absent/invalid.
  const money = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? Math.round(x * 100) / 100 : 0;
  };
  const total = money(raw.total);
  // The canonical amount is the final total; if the model only filled one of the
  // two, borrow from the other so the recorded figure is never lost.
  const amount = money(raw.amount) || total;
  return {
    vendor: typeof raw.vendor === "string" ? raw.vendor.trim().slice(0, 80) : "",
    amount,
    currency: (typeof raw.currency === "string" && raw.currency.trim().toUpperCase()) || "MYR",
    occurredAt: typeof raw.occurredAt === "string" ? raw.occurredAt : "",
    paymentMethod: typeof raw.paymentMethod === "string" ? raw.paymentMethod.slice(0, 40) : "",
    subtotal: money(raw.subtotal),
    serviceCharge: money(raw.serviceCharge),
    tax: money(raw.tax),
    total: total || amount,
    lineItems: Array.isArray(raw.lineItems)
      ? raw.lineItems
          .filter((li) => li && typeof li.label === "string" && Number.isFinite(Number(li.amount)))
          .slice(0, 30)
          .map((li) => ({ label: String(li.label).slice(0, 60), amount: Number(li.amount) }))
      : [],
    confidence: Number.isFinite(Number(raw.confidence))
      ? Math.min(1, Math.max(0, Number(raw.confidence)))
      : 0.5,
  };
}

// ── Step 1: perceive ────────────────────────────────────────────────────────
export async function extractReceipt(
  imageBase64: string,
  mimeType: string,
  meta?: { tenantId?: string; provider?: AiProvider },
): Promise<ReceiptExtraction> {
  const raw = await aiVision(EXTRACT_PROMPT, imageBase64, {
    mimeType,
    system: EXTRACT_SYSTEM,
    json: true,
    fn: "extractReceipt",
    provider: meta?.provider,
    meta: { tenantId: meta?.tenantId, source: "receipt" },
  });
  return coerceExtraction(parseJson<Partial<ReceiptExtraction>>(raw));
}

// ── Step 2: ground ──────────────────────────────────────────────────────────

export interface VendorMemory {
  vendor: string;
  count: number;
  total: number;
  amounts: number[];
  /** The bucket this household actually files this vendor under, and how often. */
  usualBucket: { id: string; label: string; timesOutOf: string } | null;
}

interface Grounding {
  buckets: { id: string; label: string; tier: number }[];
  recent: { id: string; vendor: string; amount: number; occurredAt: string }[];
  vendorHistory: VendorMemory[];
  /** Every live transaction in the window — the input to deterministic dedupe. */
  existing: ExistingTxn[];
}

// A year, not 120 days: the whole point of vendor memory is to remember the
// annual insurance renewal and the once-a-quarter dentist, which a 4-month
// window forgets. It costs one query either way.
const GROUND_DAYS = 400;

export async function ground(tenantId: string): Promise<Grounding> {
  const since = new Date();
  since.setDate(since.getDate() - GROUND_DAYS);

  const [buckets, txns] = await Promise.all([
    pbList<{ id: string; label: string; props: { bucket?: number } | null }>("nodes", {
      filter: `tenant = ${pbStr(tenantId)} && kind = 'bucket'`,
      sort: "created",
    }),
    pbList<{
      id: string;
      amount: number;
      occurred_at: string;
      voided: boolean;
      wallet_node: string;
      expand?: { vendor_node?: { label: string }; wallet_node?: { id: string; label: string } };
    }>("transactions", {
      filter: `tenant = ${pbStr(tenantId)} && occurred_at >= ${pbStr(
        since.toISOString().replace("T", " "),
      )}`,
      sort: "-occurred_at",
      expand: "vendor_node,wallet_node",
      perPage: 2000,
    }),
  ]);

  const live = txns.filter((t) => !t.voided);

  // Where this household files each vendor. Until now a user's correction was
  // thrown away — they could re-file Tesco under Groceries every single week and
  // the model would keep guessing afresh. The bucket they actually chose, last
  // time and the times before, is the strongest signal available about where the
  // next receipt from that shop belongs, and it costs nothing to remember.
  interface Agg {
    count: number;
    total: number;
    amounts: number[];
    buckets: Map<string, { label: string; n: number }>;
  }
  const byVendor = new Map<string, Agg>();

  for (const t of live) {
    const v = t.expand?.vendor_node?.label ?? "Unknown";
    const e: Agg = byVendor.get(v) ?? { count: 0, total: 0, amounts: [], buckets: new Map() };
    e.count += 1;
    e.total += Number(t.amount);
    e.amounts.push(Number(t.amount));

    const w = t.expand?.wallet_node;
    if (w?.id) {
      const b = e.buckets.get(w.id) ?? { label: w.label, n: 0 };
      b.n += 1;
      e.buckets.set(w.id, b);
    }
    byVendor.set(v, e);
  }

  const vendorHistory: VendorMemory[] = [...byVendor.entries()]
    .map(([vendor, e]) => {
      const top = [...e.buckets.entries()].sort((a, b) => b[1].n - a[1].n)[0];
      return {
        vendor,
        count: e.count,
        total: Math.round(e.total * 100) / 100,
        amounts: e.amounts.slice(0, 12),
        usualBucket: top
          ? { id: top[0], label: top[1].label, timesOutOf: `${top[1].n} of ${e.count}` }
          : null,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);

  return {
    buckets: buckets.map((b) => ({
      id: b.id,
      label: b.label,
      tier: Number(b.props?.bucket ?? 3),
    })),
    recent: live.slice(0, 40).map((t) => ({
      id: t.id,
      vendor: t.expand?.vendor_node?.label ?? "Unknown",
      amount: Number(t.amount),
      occurredAt: t.occurred_at,
    })),
    vendorHistory,
    existing: live.map((t) => ({
      id: t.id,
      vendor: t.expand?.vendor_node?.label ?? "",
      amount: Number(t.amount),
      occurredAt: t.occurred_at,
    })),
  };
}

// The bucket this household has most often used for a vendor, if any. Exported
// because the statement importer files hundreds of rows and should not need an
// AI call for a vendor the household has already made its choice about.
export function rememberedBucket(
  vendor: string,
  history: VendorMemory[],
): { id: string; label: string; reason: string } | null {
  const norm = (s: string) => s.trim().toLowerCase();
  const hit = history.find((h) => norm(h.vendor) === norm(vendor));
  if (!hit?.usualBucket) return null;
  return {
    id: hit.usualBucket.id,
    label: hit.usualBucket.label,
    reason: `You've filed ${hit.vendor} under ${hit.usualBucket.label} ${hit.usualBucket.timesOutOf} times.`,
  };
}

// ── Step 3 + 4: decide, then explain ────────────────────────────────────────
const ANALYZE_SYSTEM = `You are Honey, a careful household finance assistant for a
Malaysian family. You are given a freshly scanned receipt and the household's REAL
graph: its buckets, its recent spending, and its history with each vendor.

HoneyMoney's 3-bucket model:
  tier 1 = Must-paid (rent, bills, loans — money already promised)
  tier 2 = Savings (savings, emergency fund, goals)
  tier 3 = Spendings (groceries, food, everything discretionary)

Hard rules:
- You may ONLY choose a bucket from the list you are given, using its exact id.
  Never invent an id or a label.
- If the vendor history shows a "usualBucket" for this vendor, choose that
  bucket. The household has already made this decision — respect it. Override it
  only when the receipt itself clearly contradicts it, and say why in the reason.
- Duplicate detection is done arithmetically before you see this, so do not
  hunt for duplicates. Leave "duplicateOf" as null.
- Only flag an anomaly against THIS household's own history with THIS vendor. A
  RM 60 grocery run is not an anomaly. RM 60 at a vendor they've only ever spent
  RM 8 at is.
- Be marital-safe: this is read by both partners. Never blame, never moralise,
  never use words like "overspending", "wasteful" or "you should". State what
  changed and what it means. Neutral, kind, factual.
- This is education, not licensed financial advice. Never tell them to buy,
  sell, or invest in anything.
- If you have nothing useful to say, say so briefly. A bland insight is worse
  than none.`;

function analyzePrompt(extraction: ReceiptExtraction, g: Grounding): string {
  return `SCANNED RECEIPT
${JSON.stringify(extraction, null, 2)}

HOUSEHOLD BUCKETS (choose one id, or null)
${JSON.stringify(g.buckets, null, 2)}

RECENT SPENDING (newest first)
${JSON.stringify(g.recent, null, 2)}

THIS HOUSEHOLD'S HISTORY BY VENDOR
(usualBucket = the bucket they actually file this vendor under. Prefer it.)
${JSON.stringify(g.vendorHistory, null, 2)}

Return ONLY strict JSON:
{
  "bucket": { "nodeId": string, "label": string, "reason": string } | null,
  "subscription": { "likely": boolean, "cadence": string, "note": string } | null,
  "anomaly": { "flagged": boolean, "note": string } | null,
  "insight": string
}`;
}

interface RawAnalysis {
  bucket?: { nodeId?: string; label?: string; reason?: string } | null;
  subscription?: { likely?: boolean; cadence?: string; note?: string } | null;
  anomaly?: { flagged?: boolean; note?: string } | null;
  insight?: string;
}

export async function analyzeReceipt(
  tenantId: string,
  extraction: ReceiptExtraction,
  provider?: AiProvider,
  grounding?: Grounding,
): Promise<ReceiptAnalysis> {
  const g = grounding ?? (await ground(tenantId));

  // Arithmetic, not opinion. Runs before the model and independently of it, so a
  // duplicate is caught even when the analysis step fails outright.
  const duplicateOf = duplicateFor(extraction, g);

  const raw = await aiGenerate(analyzePrompt(extraction, g), {
    system: ANALYZE_SYSTEM,
    json: true,
    fn: "analyzeReceipt",
    provider,
    meta: { tenantId, source: "receipt" },
  });
  const a = parseJson<RawAnalysis>(raw);

  // Re-validate the bucket id against the real graph. A model that hallucinates
  // one would otherwise send a spend into a bucket that doesn't exist.
  const proposed = g.buckets.find((b) => b.id === a.bucket?.nodeId);
  const remembered = rememberedBucket(extraction.vendor, g.vendorHistory);

  // The household's own filing history outranks the model. If they have put this
  // vendor in a bucket before, that IS the answer; the model only gets to decide
  // for vendors they've never seen.
  const bucket = remembered
    ? { nodeId: remembered.id, label: remembered.label, reason: remembered.reason }
    : proposed
      ? { nodeId: proposed.id, label: proposed.label, reason: String(a.bucket?.reason ?? "").slice(0, 200) }
      : null;

  return {
    bucket,
    duplicateOf,
    subscription: a.subscription?.likely
      ? {
          likely: true,
          cadence: String(a.subscription.cadence ?? "monthly").slice(0, 30),
          note: String(a.subscription.note ?? "").slice(0, 200),
        }
      : null,
    anomaly: a.anomaly?.flagged
      ? { flagged: true, note: String(a.anomaly.note ?? "").slice(0, 200) }
      : null,
    insight: String(a.insight ?? "").slice(0, 400),
  };
}

function duplicateFor(e: ReceiptExtraction, g: Grounding): DuplicateMatch | null {
  if (!e.vendor || !(e.amount > 0)) return null;
  // A receipt with no readable date is treated as "today" for the purpose of
  // asking "did I already log this?", which is what the user means when they
  // scan the same slip twice in a row.
  const when = e.occurredAt || new Date().toISOString();
  return findDuplicate({ vendor: e.vendor, amount: e.amount, occurredAt: when }, g.existing);
}

// The whole pipeline. Extraction is the part the user actually needs; if the
// analysis step fails we still hand back the extraction rather than failing the
// scan outright.
export async function readReceipt(
  tenantId: string,
  imageBase64: string,
  mimeType: string,
): Promise<ReceiptResult> {
  const provider = activeAiProvider();
  if (!isProviderConfigured(provider)) {
    throw new Error(
      `AI is not configured (AI_PROVIDER=${provider}). The app still scans on-device — see docs/AI_SETUP.md.`,
    );
  }

  const extraction = await extractReceipt(imageBase64, mimeType, { tenantId, provider });
  const g = await ground(tenantId);

  try {
    const analysis = await analyzeReceipt(tenantId, extraction, provider, g);
    return { extraction, analysis, provider };
  } catch (err) {
    // The reasoning step is the part that can fail; the two things that actually
    // protect the ledger cannot. The duplicate check is arithmetic and the bucket
    // comes from the household's own filing history — so when the model is down
    // or rate-limited we still hand back both, rather than nothing.
    const remembered = rememberedBucket(extraction.vendor, g.vendorHistory);
    return {
      extraction,
      analysis: {
        bucket: remembered
          ? { nodeId: remembered.id, label: remembered.label, reason: remembered.reason }
          : null,
        duplicateOf: duplicateFor(extraction, g),
        subscription: null,
        anomaly: null,
        insight: "",
      },
      provider,
      degraded: err instanceof Error ? err.message : "Analysis step failed",
    };
  }
}
