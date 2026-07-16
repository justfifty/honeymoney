import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { changeMyPassword } from "@/lib/account";
import { AUTH_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";

// POST /api/account/password — change the password after verifying the current
// one. A password change rotates PocketBase's token, so we re-set the cookie
// with the fresh token the change returns (otherwise the user is logged out).
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.currentPassword || !body.newPassword) {
    return NextResponse.json({ error: "Current and new password are required." }, { status: 400 });
  }
  try {
    const { token } = await changeMyPassword(body.currentPassword, body.newPassword);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (err) {
    return apiError(err);
  }
}
