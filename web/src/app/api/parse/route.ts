import { NextResponse } from "next/server";
import { parseReceipt } from "@/lib/gemini";
import { ingestReceipt } from "@/lib/graph";
import { isDatabaseConfigured, isGeminiConfigured } from "@/lib/config";

export const runtime = "nodejs";

// Manual test harness for the OCR -> graph pipeline (bypasses Telegram).
// POST { imageBase64, mimeType, tenantId, persist? }
export async function POST(request: Request) {
  if (!isGeminiConfigured()) {
    return NextResponse.json({ error: "Gemini not configured" }, { status: 503 });
  }

  let body: {
    imageBase64?: string;
    mimeType?: string;
    tenantId?: string;
    persist?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { imageBase64, mimeType = "image/jpeg", tenantId, persist = true } = body;
  if (!imageBase64) {
    return NextResponse.json({ error: "imageBase64 is required" }, { status: 400 });
  }

  try {
    const parsed = await parseReceipt(imageBase64, mimeType);

    if (persist && tenantId) {
      if (!isDatabaseConfigured()) {
        return NextResponse.json(
          { parsed, warning: "Database not configured — parsed only, not stored." },
          { status: 200 },
        );
      }
      const result = await ingestReceipt(tenantId, parsed, "manual");
      return NextResponse.json({ parsed, stored: result });
    }

    return NextResponse.json({ parsed, stored: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
