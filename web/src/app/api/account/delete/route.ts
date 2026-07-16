import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { deleteMyAccount } from "@/lib/account";
import { AUTH_COOKIE } from "@/lib/auth";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";

// POST /api/account/delete — soft-delete the signed-in account (or leave a shared
// household). Either way the session is ended; deleteMyAccount() decides which.
export async function POST() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const result = await deleteMyAccount();
    const res = NextResponse.json({ ok: true, ...result });
    res.cookies.set(AUTH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    return apiError(err);
  }
}
