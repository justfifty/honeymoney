// Honey's voice.
//
// This file used to be a Gemini REST client: its own fetch, its own token
// logging, its own JSON-fence stripper, and a parseReceipt() that made a single
// ungrounded call, silently defaulted a missing date to *today*, and fed a write
// path that saved without asking anyone.
//
// All of it is gone. Reading a receipt is lib/receipt.ts, which grounds every
// read in the household's real buckets and vendor history, decides duplicates
// arithmetically, and never writes. Talking to a model is lib/ai.ts, which does
// it across Gemini, Groq and Ollama and logs the tokens once, in one place.
//
// What's left is the only thing that was ever really *here*: how Honey speaks.

import { aiGenerate } from "./ai";
import type { Locale } from "./i18n";

const LANG_NAME: Record<Locale, string> = {
  en: "English", ms: "Bahasa Melayu", zh: "Simplified Chinese", "zh-Hant": "Traditional Chinese", hi: "Hindi", ta: "Tamil",
};

// Optional call context, logged to the ai_usage ledger alongside token counts.
export interface AiMeta {
  tenantId?: string;
  source?: string; // "web" | "telegram" | …
}

const HONEY_SYSTEM = `You are "Honey", HoneyMoney's financial wellness companion for families.
Voice: warm, encouraging, forward-looking, and MARITAL-SAFE — never blame a spouse,
never interrogate past purchases ("what was this RM50 for?"). Focus on proactive
alignment toward shared goals. Keep it to 2-3 short sentences. Use RM for amounts.`;

export async function honeyInsight(contextText: string, locale: Locale = "en", meta?: AiMeta): Promise<string> {
  const langLine = locale === "en" ? "" : `\n\nReply in ${LANG_NAME[locale]}.`;
  return aiGenerate(`Household snapshot:\n${contextText}\n\nGive one insight now:${langLine}`, {
    system: HONEY_SYSTEM,
    fn: "honeyInsight",
    // Class 2: buildContext() interpolates the household's own bucket LABELS
    // ("Ma's dialysis") alongside exact RM figures. This path ran on every
    // dashboard load and nothing was watching it.
    dataClass: 2,
    meta,
  });
}
