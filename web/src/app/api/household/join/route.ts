import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { getSessionUser } from "@/lib/auth";
import { acceptInvite } from "@/lib/household";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";

// POST /api/household/join — redeem an invite code. { code }
//
// This is the moment two logins become one household: the joining account keeps
// its own email and password, and gains a membership row pointing at the
// inviter's tenant. From the next request on, both accounts resolve to the same
// household and see the same records.
export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in first, then redeem the code." }, { status: 401 });
    }

    let body: { code?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body.code?.trim()) {
      return NextResponse.json({ error: "An invite code is required." }, { status: 400 });
    }

    const tenant = await acceptInvite(user, body.code);
    return NextResponse.json({ ok: true, tenant });
  } catch (err) {
    return apiError(err);
  }
}
