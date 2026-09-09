import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { confirmPasswordReset, PasswordResetError } from "@/lib/passwordReset";

export const runtime = "nodejs";

// POST /api/auth/reset — { token, password } → { ok: true }.
//
// The token is the credential. It came from the email PocketBase sent, it is
// good for one use inside its window, and PocketBase is the one that judges
// it. This route adds only the same password floor the sign-up form applies,
// so a person is not told "done" by the app and "no" by the database.
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  let body: { token?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const token = (body.token ?? "").trim();
  const password = body.password ?? "";
  if (!token) {
    return NextResponse.json(
      { error: "This reset link is missing its token. Open the link from the email again." },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  try {
    await confirmPasswordReset(token, password);
  } catch (err) {
    if (err instanceof PasswordResetError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Could not reset the password right now." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
