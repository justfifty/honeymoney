import { NextResponse } from "next/server";
import { config, isDatabaseConfigured } from "@/lib/config";
import { runProactiveNudges } from "@/lib/nudge";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";

// POST /api/insight/nudge — run the proactive Honey agent over every household.
// Scheduled (Windows Task / cron), authorised by the same shared secret as the
// purge sweep (ACCOUNT_PURGE_SECRET) in the `x-purge-secret` header. Never
// exposed to browsers.
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const secret = config.accountPurgeSecret;
  if (!secret || request.headers.get("x-purge-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runProactiveNudges();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return apiError(err);
  }
}
