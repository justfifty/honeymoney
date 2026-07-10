// Gemini via REST (fetch) — no SDK dependency, edge-safe, no version churn.
// Docs: https://ai.google.dev/api/generate-content

import { config, isGeminiConfigured, isPocketBaseConfigured } from "./config";
import { pbCreate } from "./pocketbase";
import { aiGenerate } from "./ai";
import type { ParsedReceipt } from "./types";
import type { Locale } from "./i18n";

const LANG_NAME: Record<Locale, string> = {
  en: "English", ms: "Bahasa Melayu", zh: "Simplified Chinese", "zh-Hant": "Traditional Chinese", hi: "Hindi", ta: "Tamil",
};

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

// Optional call context, logged to the ai_usage ledger alongside token counts.
export interface AiMeta {
  tenantId?: string;
  source?: string; // "web" | "telegram" | …
}

interface GeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

// Persist one row per Gemini call so token usage is a queryable, exportable
// record (MAIC AI disclosure + cost metrics). Never let telemetry break a request.
async function logUsage(fn: string, usage: GeminiUsage | undefined, meta?: AiMeta): Promise<void> {
  if (!isPocketBaseConfigured()) return;
  try {
    await pbCreate("ai_usage", {
      fn,
      model: config.geminiModel,
      prompt_tokens: Number(usage?.promptTokenCount) || 0,
      output_tokens: Number(usage?.candidatesTokenCount) || 0,
      total_tokens: Number(usage?.totalTokenCount) || 0,
      tenant: meta?.tenantId ?? "",
      source: meta?.source ?? "",
      ok: true,
    });
  } catch {
    /* swallow — usage logging must never fail the AI call */
  }
}

async function generate(
  parts: GeminiPart[],
  jsonMode: boolean,
  fn: string,
  meta?: AiMeta,
): Promise<string> {
  if (!isGeminiConfigured()) {
    throw new Error("Gemini is not configured. Set GEMINI_API_KEY.");
  }
  const url = `${ENDPOINT}/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: jsonMode
        ? { temperature: 0.1, responseMimeType: "application/json" }
        : { temperature: 0.7 },
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini error ${res.status}: ${detail.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: GeminiPart) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  await logUsage(fn, data?.usageMetadata as GeminiUsage | undefined, meta);
  return text;
}

function stripJsonFence(s: string): string {
  return s
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

const RECEIPT_PROMPT = `You are a receipt/e-wallet screenshot parser for Malaysian apps
(Touch 'n Go, MAE, GrabPay, ShopeePay, bank apps). Extract the payment details.
Return ONLY strict JSON with keys:
  "vendor"     (string, merchant/recipient name; "Unknown" if unclear),
  "amount"     (number, the transaction amount in the local currency),
  "currency"   (string ISO code, default "MYR"),
  "occurredAt" (string ISO 8601 timestamp; if only a date is visible use midnight; if absent use ""),
  "confidence" (number 0..1, your confidence in the extraction).
No commentary, no markdown.`;

export async function parseReceipt(
  imageBase64: string,
  mimeType: string,
  meta?: AiMeta,
): Promise<ParsedReceipt> {
  const raw = await generate(
    [{ text: RECEIPT_PROMPT }, { inlineData: { mimeType, data: imageBase64 } }],
    true,
    "parseReceipt",
    meta,
  );
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(stripJsonFence(raw));
  } catch {
    throw new Error(`Could not parse Gemini JSON: ${raw.slice(0, 200)}`);
  }
  const amount = Number(obj.amount);
  return {
    vendor: String(obj.vendor ?? "Unknown").slice(0, 120),
    amount: Number.isFinite(amount) ? Math.abs(amount) : 0,
    currency: String(obj.currency ?? "MYR").toUpperCase().slice(0, 8),
    occurredAt:
      typeof obj.occurredAt === "string" && obj.occurredAt
        ? obj.occurredAt
        : new Date().toISOString(),
    confidence: Math.max(0, Math.min(1, Number(obj.confidence) || 0.5)),
  };
}

const HONEY_SYSTEM = `You are "Honey", HoneyMoney's financial wellness companion for families.
Voice: warm, encouraging, forward-looking, and MARITAL-SAFE — never blame a spouse,
never interrogate past purchases ("what was this RM50 for?"). Focus on proactive
alignment toward shared goals. Keep it to 2-3 short sentences. Use RM for amounts.`;

export async function honeyInsight(contextText: string, locale: Locale = "en", meta?: AiMeta): Promise<string> {
  // Routed through the multi-provider layer (Gemini / Groq / Ollama per AI_PROVIDER).
  const langLine = locale === "en" ? "" : `\n\nReply in ${LANG_NAME[locale]}.`;
  return aiGenerate(`Household snapshot:\n${contextText}\n\nGive one insight now:${langLine}`, {
    system: HONEY_SYSTEM,
    fn: "honeyInsight",
    meta,
  });
}
