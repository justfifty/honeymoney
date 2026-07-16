import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { updateMyName } from "@/lib/account";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";

// POST /api/account/profile — update the signed-in account's display name.
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const result = await updateMyName(body.name ?? "");
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return apiError(err);
  }
}
