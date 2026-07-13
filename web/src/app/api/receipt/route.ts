import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDatabaseConfigured, activeAiProvider, isProviderConfigured } from "@/lib/config";
import { requirePermission } from "@/lib/household";
import { readReceipt } from "@/lib/receipt";
import { apiError } from "@/lib/apiError";

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

    const result = await readReceipt(ctx.tenant.id, image, mimeType);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return apiError(err);
  }
}
