import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { createInvite, requirePermission, revokeInvite, type AccessRole } from "@/lib/household";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";

const ROLES: AccessRole[] = ["owner", "adult", "child", "viewer"];

// POST /api/household/invite — mint a code that lets another account join this
// household. { role?, displayName?, email? }
//
// If `email` is set, only that address can redeem it — worth doing for a
// household, because an invite code is a key to the family's finances.
export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requirePermission("invite");

    let body: { role?: string; displayName?: string; email?: string } = {};
    try {
      body = await request.json();
    } catch {
      /* an empty body is fine — everything is optional */
    }

    const role = ROLES.includes(body.role as AccessRole) ? (body.role as AccessRole) : "adult";
    const invite = await createInvite(ctx.tenant.id, ctx.user.id, {
      role,
      displayName: body.displayName,
      email: body.email,
    });

    return NextResponse.json({
      ok: true,
      invite: {
        id: invite.id,
        code: invite.code,
        accessRole: invite.access_role,
        displayName: invite.display_name,
        email: invite.email,
        expiresAt: invite.expires_at,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}

// DELETE /api/household/invite?id=… — revoke an unredeemed code.
export async function DELETE(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requirePermission("invite");
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await revokeInvite(ctx.tenant.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
