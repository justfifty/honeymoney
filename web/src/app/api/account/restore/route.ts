import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { restoreMyAccount } from "@/lib/account";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";

// POST /api/account/restore — undo a soft-delete while inside the grace window.
export async function POST() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const result = await restoreMyAccount();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return apiError(err);
  }
}
