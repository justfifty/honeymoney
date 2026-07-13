// Agentic receipt analytics.
//
// A single "read the image" call is OCR, not analysis — it tells you a number
// and a shop name, and leaves the user to do the thinking. This runs a small
// agent loop instead, where each step is grounded in the household's actual
// graph rather than in the model's imagination:
//
//   1. PERCEIVE  — a vision model reads the receipt / e-wallet screenshot.
//   2. GROUND    — we fetch the household's real buckets, vendors and recent
//                  spending. No step below is allowed to invent an id.
//   3. DECIDE    — a text model, given only those real options, picks the
//                  bucket, flags a probable duplicate, spots a subscription and
//                  calls out anything anomalous versus this household's history.
//   4. EXPLAIN   — one plain-English line the user can act on.
//
// Nothing is written. The agent proposes; the human confirms; and if the human
// corrects it, that correction is what gets stored — and the correction itself
// is recorded in the audit ledger.

import { aiGenerate, aiVision } from "./ai";
import { activeAiProvider, isProviderConfigured, type AiProvider } from "./config";
import { pbList, pbStr } from "./pocketbase";

export interface ReceiptExtraction {
  vendor: string;
  amount: number;
  currency: string;
  occurredAt: string; // ISO 8601, or "" if the receipt didn't say
  paymentMethod: string; // "Touch 'n Go", "MAE", "card", "cash"…
  lineItems: { label: string; amount: number }[];
  confidence: number; // 0..1, the model's own honesty about the read
}

export interface ReceiptAnalysis {
  bucket: { nodeId: string; label: string; reason: string } | null;
  duplicateOf: { id: string; vendor: string; amount: number; occurredAt: string; why: string } | null;
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
- Malaysian receipts write dates as DD/MM/YYYY, never MM/DD. "03/07/2026" is
  3 July, not 3 March.
- If the image genuinely does not show a field, leave it empty and lower your
  confidence. Do not guess. A wrong number a user trusts is worse than a blank
  one they fill in.`;

const EXTRACT_PROMPT = `Extract the payment from this image. Return ONLY strict JSON:
{
  "vendor": string,          // the merchant paid; "" if truly unreadable
  "amount": number,          // what was paid, as a number; 0 if unreadable
  "currency": string,        // ISO code, default "MYR"
  "occurredAt": string,      // ISO 8601 datetime, or "" if absent
  "paymentMethod": string,   // wallet/app/card/cash used, or ""
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
  const amount = Number(raw.amount);
  return {
    vendor: typeof raw.vendor === "string" ? raw.vendor.trim().slice(0, 80) : "",
    amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0,
    currency: (typeof raw.currency === "string" && raw.currency.trim().toUpperCase()) || "MYR",
    occurredAt: typeof raw.occurredAt === "string" ? raw.occurredAt : "",
    paymentMethod: typeof raw.paymentMethod === "string" ? raw.paymentMethod.slice(0, 40) : "",
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
interface Grounding {
  buckets: { id: string; label: string; tier: number }[];
  recent: { id: string; vendor: string; amount: number; occurredAt: string }[];
  vendorHistory: { vendor: string; count: number; total: number; amounts: number[] }[];
}

async function ground(tenantId: string): Promise<Grounding> {
  const since = new Date();
  since.setDate(since.getDate() - 120);

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
      expand?: { vendor_node?: { label: string } };
    }>("transactions", {
      filter: `tenant = ${pbStr(tenantId)} && occurred_at >= ${pbStr(
        since.toISOString().replace("T", " "),
      )}`,
      sort: "-occurred_at",
      expand: "vendor_node",
      perPage: 200,
    }),
  ]);

  const live = txns.filter((t) => !t.voided);
  const byVendor = new Map<string, { count: number; total: number; amounts: number[] }>();
  for (const t of live) {
    const v = t.expand?.vendor_node?.label ?? "Unknown";
    const e = byVendor.get(v) ?? { count: 0, total: 0, amounts: [] };
    e.count += 1;
    e.total += Number(t.amount);
    e.amounts.push(Number(t.amount));
    byVendor.set(v, e);
  }

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
    vendorHistory: [...byVendor.entries()]
      .map(([vendor, e]) => ({ vendor, ...e }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30),
  };
}

// ── Step 3 + 4: decide, then explain ────────────────────────────────────────
const ANALYZE_SYSTEM = `You are Honey, a careful household finance assistant for a
Malaysian family. You are given a freshly scanned receipt and the household's REAL
graph: its buckets, its recent spending, and its history with each vendor.

HoneyMoney's 3-bucket model:
  tier 1 = Commitments (rent, bills, loans — money already promised)
  tier 2 = Future Shield (savings, emergency fund, goals)
  tier 3 = Daily Spend (groceries, food, everything discretionary)

Hard rules:
- You may ONLY choose a bucket from the list you are given, using its exact id.
  Never invent an id or a label.
- Only report a duplicate if the id you cite is in the recent-spending list AND
  the amount and date genuinely look like the same payment (same vendor, amount
  within a few sen, within about 48 hours). A false duplicate makes the user
  delete a real spend — be conservative.
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

RECENT SPENDING (last 120 days, newest first)
${JSON.stringify(g.recent, null, 2)}

THIS HOUSEHOLD'S HISTORY BY VENDOR
${JSON.stringify(g.vendorHistory, null, 2)}

Return ONLY strict JSON:
{
  "bucket": { "nodeId": string, "label": string, "reason": string } | null,
  "duplicateOf": { "id": string, "why": string } | null,
  "subscription": { "likely": boolean, "cadence": string, "note": string } | null,
  "anomaly": { "flagged": boolean, "note": string } | null,
  "insight": string
}`;
}

interface RawAnalysis {
  bucket?: { nodeId?: string; label?: string; reason?: string } | null;
  duplicateOf?: { id?: string; why?: string } | null;
  subscription?: { likely?: boolean; cadence?: string; note?: string } | null;
  anomaly?: { flagged?: boolean; note?: string } | null;
  insight?: string;
}

export async function analyzeReceipt(
  tenantId: string,
  extraction: ReceiptExtraction,
  provider?: AiProvider,
): Promise<ReceiptAnalysis> {
  const g = await ground(tenantId);

  const raw = await aiGenerate(analyzePrompt(extraction, g), {
    system: ANALYZE_SYSTEM,
    json: true,
    fn: "analyzeReceipt",
    provider,
    meta: { tenantId, source: "receipt" },
  });
  const a = parseJson<RawAnalysis>(raw);

  // Re-validate every id against the real graph. A model that hallucinates a
  // bucket id would otherwise send a spend into a bucket that doesn't exist, and
  // a hallucinated duplicate id would invite the user to void an unrelated row.
  const bucket = g.buckets.find((b) => b.id === a.bucket?.nodeId);
  const dupe = g.recent.find((r) => r.id === a.duplicateOf?.id);

  return {
    bucket: bucket
      ? { nodeId: bucket.id, label: bucket.label, reason: String(a.bucket?.reason ?? "").slice(0, 200) }
      : null,
    duplicateOf: dupe
      ? {
          id: dupe.id,
          vendor: dupe.vendor,
          amount: dupe.amount,
          occurredAt: dupe.occurredAt,
          why: String(a.duplicateOf?.why ?? "").slice(0, 200),
        }
      : null,
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

  try {
    const analysis = await analyzeReceipt(tenantId, extraction, provider);
    return { extraction, analysis, provider };
  } catch (err) {
    return {
      extraction,
      analysis: null,
      provider,
      degraded: err instanceof Error ? err.message : "Analysis step failed",
    };
  }
}
