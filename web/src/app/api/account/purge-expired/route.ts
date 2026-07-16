import { NextResponse } from "next/server";
import { config, isDatabaseConfigured } from "@/lib/config";
import { purgeExpiredHouseholds } from "@/lib/account";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";

// POST /api/account/purge-expired — permanently erase households whose 30-day
// grace window has elapsed. Meant to be called on a schedule (Windows Task /
// cron / Cloudflare cron), authorised by the ACCOUNT_PURGE_SECRET shared secret
// in the `x-purge-secret` header. Never exposed to browsers.
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const secret = config.accountPurgeSecret;
  if (!secret || request.headers.get("x-purge-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await purgeExpiredHouseholds();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return apiError(err);
  }
}
