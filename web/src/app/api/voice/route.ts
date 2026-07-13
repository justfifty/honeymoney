import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { aiGenerate } from "@/lib/ai";
import { activeAiProvider, isDatabaseConfigured, isProviderConfigured } from "@/lib/config";
import { requirePermission } from "@/lib/household";
import { pbList, pbStr } from "@/lib/pocketbase";
import { parseVoiceLocal } from "@/lib/voiceParse";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";

// POST /api/voice — turn a spoken sentence into a spend. { transcript, lang }
//
// The on-device parser (lib/voiceParse.ts) handles the common cases with zero
// tokens and is always the fallback. But regexes can't really understand "the
// usual coffee run, about twenty ringgit, put it on groceries" — or the same
// sentence in Tamil. When an AI provider is configured we hand the transcript
// to it, grounded in this household's real buckets and vendors, and we validate
// every id it returns against the graph before trusting it.

const SYSTEM = `You turn a spoken sentence into one household spending entry.

The speaker is Malaysian and may mix English, Bahasa Melayu, Chinese, Tamil or
Hindi in a single sentence — that is normal, not an error. Understand the whole
sentence, whatever language(s) it is in.

Rules:
- The MERCHANT is where the money went. Never return the payment app ("Touch 'n
  Go", "GrabPay", "MAE") as the merchant.
- Malaysian merchant names are often mis-transcribed by speech engines. If the
  transcript sounds like a merchant in the household's known list, return the
  known spelling exactly.
- Amounts may be spoken in words ("lima puluh", "fifteen fifty", 三十五) or with
  no currency at all. Default the currency to MYR when none is spoken.
- Only choose a bucket id from the list given. Never invent one. If the speaker
  did not indicate a bucket and you are unsure, return null.
- Resolve relative dates ("yesterday", "semalam") against the supplied date.
- If you cannot hear an amount, return null for it — do not invent a plausible
  number. The user will fill it in.`;

interface AiVoice {
  vendor?: string | null;
  amount?: number | null;
  currency?: string | null;
  occurredAt?: string | null;
  bucketNodeId?: string | null;
  note?: string | null;
  confidence?: number;
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const ctx = await requirePermission("add_record");

    let body: { transcript?: string; lang?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const transcript = (body.transcript ?? "").trim().slice(0, 500);
    if (!transcript) {
      return NextResponse.json({ error: "transcript is required" }, { status: 400 });
    }

    // Ground on the household's real graph — both to bias the merchant match and
    // to constrain the bucket choice to ids that actually exist.
    const [buckets, vendorNodes] = await Promise.all([
      pbList<{ id: string; label: string; props: { bucket?: number } | null }>("nodes", {
        filter: `tenant = ${pbStr(ctx.tenant.id)} && kind = 'bucket'`,
        sort: "created",
      }),
      pbList<{ label: string }>("nodes", {
        filter: `tenant = ${pbStr(ctx.tenant.id)} && kind = 'vendor'`,
        sort: "-created",
        perPage: 80,
      }),
    ]);
    const knownVendors = vendorNodes.map((v) => v.label);

    const local = parseVoiceLocal(transcript, knownVendors);
    const provider = activeAiProvider();

    if (!isProviderConfigured(provider)) {
      return NextResponse.json({ ok: true, source: "on-device", transcript, parsed: local });
    }

    try {
      const raw = await aiGenerate(
        `TRANSCRIPT (spoken, language code "${body.lang ?? "en"}"):
"""${transcript}"""

TODAY: ${new Date().toISOString()}

HOUSEHOLD BUCKETS (choose one id, or null):
${JSON.stringify(buckets.map((b) => ({ id: b.id, label: b.label, tier: b.props?.bucket ?? 3 })))}

MERCHANTS THIS HOUSEHOLD HAS USED BEFORE:
${JSON.stringify(knownVendors)}

Return ONLY strict JSON:
{ "vendor": string|null, "amount": number|null, "currency": string|null,
  "occurredAt": string|null, "bucketNodeId": string|null, "note": string|null,
  "confidence": number }`,
        {
          system: SYSTEM,
          json: true,
          fn: "parseVoice",
          meta: { tenantId: ctx.tenant.id, source: "voice" },
        },
      );

      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const jsonText = fenced ? fenced[1] : raw;
      const a = JSON.parse(jsonText.slice(jsonText.indexOf("{"), jsonText.lastIndexOf("}") + 1)) as AiVoice;

      const amount = Number(a.amount);
      const bucket = buckets.find((b) => b.id === a.bucketNodeId); // validate the id

      return NextResponse.json({
        ok: true,
        source: "ai",
        provider,
        transcript,
        parsed: {
          // Fall back field-by-field, not all-or-nothing: if the model got the
          // merchant but fumbled the number, we still keep its merchant.
          vendor: a.vendor?.trim() || local.vendor,
          amount: Number.isFinite(amount) && amount > 0 ? amount : local.amount,
          currency: a.currency?.trim().toUpperCase() || local.currency || "MYR",
          occurredAt: a.occurredAt || local.occurredAt,
          bucketNodeId: bucket?.id,
          bucketLabel: bucket?.label,
          note: a.note?.trim() || undefined,
          confidence: Number.isFinite(Number(a.confidence))
            ? Math.min(1, Math.max(0, Number(a.confidence)))
            : local.confidence,
        },
      });
    } catch (err) {
      // The AI path is an enhancement, never a dependency — if it fails, the user
      // still gets the on-device parse rather than an error.
      return NextResponse.json({
        ok: true,
        source: "on-device",
        transcript,
        parsed: local,
        degraded: err instanceof Error ? err.message : "AI parse failed",
      });
    }
  } catch (err) {
    return apiError(err);
  }
}
