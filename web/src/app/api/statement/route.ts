import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDatabaseConfigured, activeAiProvider, isProviderConfigured } from "@/lib/config";
import { requirePermission } from "@/lib/household";
import { PdfPasswordError } from "@/lib/pdf";
import { readStatement } from "@/lib/statement";
import { apiError } from "@/lib/apiError";
import { aiCloudDataAllowed, isLocalProvider } from "@/lib/aiGuard";

export const runtime = "nodejs";

// A statement is bigger than a receipt: several pages, sometimes with the bank's
// logo embedded at print resolution. 20 MB of base64 ≈ a 15 MB PDF, which covers
// every real statement while still bounding what one request can cost us.
const MAX_B64 = 20_000_000;

// POST /api/statement — read a credit-card or bank statement PDF.
// { fileBase64, password? }
//
// Nothing is written. This returns a *proposal*: every row we found, which ones
// we think are already in the books, and which bucket each belongs in. The user
// ticks what they want; /api/statement/commit is what actually saves.
export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const ctx = await requirePermission("add_record");

    // Unlike a receipt, statement import has no on-device path to fall back to
    // — so this refuses outright rather than degrading. Saying so plainly is
    // better than a feature that silently returns nothing: the household can
    // turn AI on, or keep importing by CSV.
    // Scales with EGRESS, not with the word "AI": on a local engine the
    // document never leaves the machine HoneyMoney runs on, so there is no
    // third-party disclosure for a household to consent to.
    if (!(await aiCloudDataAllowed(ctx.user.id, { local: isLocalProvider(activeAiProvider()) }))) {
      return NextResponse.json(
        {
          error: "ai_consent_missing",
          message:
            "Statement import reads the PDF with an AI model, and AI processing is off for this household. Turn it on under Settings → Privacy, or import a CSV instead.",
        },
        { status: 403 },
      );
    }

    const provider = activeAiProvider();
    if (!isProviderConfigured(provider)) {
      return NextResponse.json(
        {
          error: "ai_not_configured",
          message: `No AI key set for AI_PROVIDER=${provider}. Statement import needs one — see docs/AI_SETUP.md.`,
          provider,
        },
        { status: 501 },
      );
    }

    let body: { fileBase64?: string; password?: string; mimeType?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const file = (body.fileBase64 ?? "").replace(/^data:[^;]+;base64,/, "");
    if (!file) return NextResponse.json({ error: "fileBase64 is required" }, { status: 400 });
    if (file.length > MAX_B64) {
      return NextResponse.json(
        { error: "That file is too large — under 15 MB, please." },
        { status: 413 },
      );
    }

    // A photo/screenshot of a statement or a multi-item receipt reads all rows
    // through the same pipeline; anything else falls back to the PDF path.
    const mimeType = /^image\/(png|jpe?g|webp|heic|heif)$/.test(body.mimeType ?? "")
      ? body.mimeType!
      : "application/pdf";

    const result = await readStatement(ctx.tenant.id, file, body.password, mimeType, ctx.user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // A locked PDF isn't a failure — it's the app asking for the password. Most
    // Malaysian bank statements are locked with an IC number or a date of birth,
    // so this is the common path, not the rare one.
    if (err instanceof PdfPasswordError) {
      return NextResponse.json(
        {
          error: "password_required",
          needsPassword: err.needsPassword,
          message: err.message,
        },
        { status: 401 },
      );
    }
    return apiError(err);
  }
}
