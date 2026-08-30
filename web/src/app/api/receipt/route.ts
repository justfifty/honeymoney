import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDatabaseConfigured, activeAiProvider, isProviderConfigured } from "@/lib/config";
import { requirePermission } from "@/lib/household";
import { readReceipt } from "@/lib/receipt";
import { apiError } from "@/lib/apiError";
import { aiCloudDataAllowed, isLocalProvider } from "@/lib/aiGuard";

export const runtime = "nodejs";

// ~8 MB of base64 ≈ a 6 MB photo. Bigger than any phone screenshot, and small
// enough that a stray upload can't wedge the request.
const MAX_B64 = 8_000_000;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "image/heif"]);

// POST /api/receipt — read a receipt or e-wallet screenshot and analyse it
// against this household's actual graph. { imageBase64, mimeType }
//
// Nothing is written here. It returns a *proposal* the user confirms or edits;
// whatever they finally accept is what gets saved, and any correction they make
// is itself recorded in the audit ledger.
export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const ctx = await requirePermission("add_record");

    // A receipt image is the least de-identifiable thing this app handles — and
    // one from a clinic or a pharmacy is health data, which is SENSITIVE
    // personal data under s.4 and a stricter regime than the financial data
    // everyone assumes is the sensitive part. It does not go to a model unless
    // this user has said it may.
    //
    // The decline is a 501, the same shape as "no key configured", because the
    // client already treats any non-ok response as "scan it on-device instead".
    // That fallback is not a consolation prize here: it is the zero-egress path
    // the product is designed around.
    // Scales with EGRESS, not with the word "AI": on a local engine the
    // document never leaves the machine HoneyMoney runs on, so there is no
    // third-party disclosure for a household to consent to.
    if (!(await aiCloudDataAllowed(ctx.user.id, { local: isLocalProvider(activeAiProvider()) }))) {
      return NextResponse.json(
        {
          error: "ai_consent_missing",
          message: "Sending documents to an AI service is off for this household. Reading it on your device instead.",
        },
        { status: 501 },
      );
    }

    const provider = activeAiProvider();
    if (!isProviderConfigured(provider)) {
      // Not an error state — the browser falls back to on-device OCR, which is
      // the zero-token path the app is designed around.
      return NextResponse.json(
        {
          error: "ai_not_configured",
          message: `No AI key set for AI_PROVIDER=${provider}. Scanning on-device instead.`,
          provider,
        },
        { status: 501 },
      );
    }

    let body: { imageBase64?: string; mimeType?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const image = (body.imageBase64 ?? "").replace(/^data:[^;]+;base64,/, "");
    const mimeType = (body.mimeType ?? "image/jpeg").toLowerCase();

    if (!image) return NextResponse.json({ error: "imageBase64 is required" }, { status: 400 });
    if (image.length > MAX_B64) {
      return NextResponse.json({ error: "That image is too large — under 6 MB, please." }, { status: 413 });
    }
    if (!ALLOWED.has(mimeType)) {
      return NextResponse.json({ error: `Unsupported image type: ${mimeType}` }, { status: 415 });
    }

    const result = await readReceipt(ctx.tenant.id, image, mimeType, ctx.user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return apiError(err);
  }
}
