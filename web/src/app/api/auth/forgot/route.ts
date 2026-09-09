import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { allowResetRequest, requestPasswordReset, PasswordResetError } from "@/lib/passwordReset";

export const runtime = "nodejs";

// POST /api/auth/forgot — { email } → always { ok: true }.
//
// Always, on purpose. Whether the address has an account is exactly the fact
// this route must not leak, so a known and an unknown address get the same
// body, the same status and — as near as makes no difference — the same time.
// The only honest failures are ours: a malformed request, too many requests,
// or PocketBase being unreachable, none of which say anything about the
// address.
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || !email.includes("@")) {
    return NextResponse.json({ error: "Enter the email address you signed up with." }, { status: 400 });
  }

  // Limited per address AND per caller, so one address cannot be flooded from
  // many places and one place cannot flood many addresses.
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown";
  const byEmail = allowResetRequest(`email:${email}`);
  const byIp = allowResetRequest(`ip:${ip}`);
  if (!byEmail.ok || !byIp.ok) {
    const retry = Math.max(byEmail.retryAfterSec, byIp.retryAfterSec);
    return NextResponse.json(
      { error: "Too many reset requests. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(retry) } },
    );
  }

  try {
    await requestPasswordReset(email);
  } catch (err) {
    if (err instanceof PasswordResetError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Could not send a reset link right now." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
