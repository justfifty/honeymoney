import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { resolveViewTenant } from "@/lib/household";
import { getLocale } from "@/lib/locale";
import { askHoney } from "@/lib/copilot";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/insight/ask — the what-if co-pilot. Grounded in the caller's own
// household (signed out → the public demo, so judges can try it), advice-free.
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  let body: { question?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  }
  try {
    const { tenantId } = await resolveViewTenant();
    if (!tenantId) return NextResponse.json({ error: "No household to reason over." }, { status: 404 });
    const locale = await getLocale();
    const result = await askHoney(question.slice(0, 300), tenantId, locale);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return apiError(err);
  }
}
