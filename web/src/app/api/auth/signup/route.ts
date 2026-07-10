import { NextResponse } from "next/server";
import { signupUser, loginUser, AUTH_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { email?: string; password?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const email = body.email?.trim();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  try {
    await signupUser(email, password, body.name ?? "");
    const { token, user } = await loginUser(email, password);
    const res = NextResponse.json({ ok: true, role: user.role });
    res.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (err) {
    let message = err instanceof Error ? err.message : "Sign-up failed";
    if (/validation_not_unique|already exists|unique/i.test(message)) {
      message = "That email is already registered — try logging in.";
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
