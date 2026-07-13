import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { requirePermission, setMemberRole, type AccessRole } from "@/lib/household";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";

const ROLES: AccessRole[] = ["owner", "adult", "child", "viewer"];

// PATCH /api/household/member — change what someone in the household can do.
// { memberId, role }
export async function PATCH(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requirePermission("manage_members");

    let body: { memberId?: string; role?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body.memberId || !ROLES.includes(body.role as AccessRole)) {
      return NextResponse.json(
        { error: `memberId and a role of ${ROLES.join(" | ")} are required` },
        { status: 400 },
      );
    }

    await setMemberRole(ctx.tenant.id, body.memberId, body.role as AccessRole);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
