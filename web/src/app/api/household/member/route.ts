import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { requirePermission, setMemberRole, removeMember, type AccessRole } from "@/lib/household";
import { logShareEvent } from "@/lib/sharingStore";
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

// DELETE /api/household/member?memberId=… — take someone out of the household.
//
// Owner-only, and it is the counterpart to /api/household/leave rather than a
// duplicate of it. The two exist separately because they are different acts
// with different authority: leaving is a decision about yourself and needs
// nobody's agreement; removing is a decision about somebody else and needs the
// role that governs the household.
//
// It does NOT delete their records, for the same reason leaving does not: the
// transactions are the household's financial history. An owner who could erase
// a departing member's entries could rewrite the household's accounts, which is
// precisely the power an append-only ledger exists to deny.
export async function DELETE(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requirePermission("manage_members");
    const memberId = new URL(request.url).searchParams.get("memberId") ?? "";
    if (!memberId) {
      return NextResponse.json({ error: "memberId is required" }, { status: 400 });
    }
    if (memberId === ctx.memberId) {
      // Not an error to correct, a different action to point at. An owner
      // removing themselves through this route would skip the last-owner check
      // and the share revocation that leaving does.
      return NextResponse.json(
        { error: "To remove yourself, leave the household instead.", leaveAt: "/api/household/leave" },
        { status: 409 },
      );
    }

    const removed = await removeMember(ctx.tenant.id, memberId);

    await logShareEvent({
      tenantId: ctx.tenant.id,
      subjectMemberId: memberId,
      actorMemberId: ctx.memberId,
      actorLabel: ctx.user.name || ctx.user.email,
      kind: "member_removed",
      detail: `Removed ${removed.display_name || "a member"} from the household.`,
    });

    return NextResponse.json({
      ok: true,
      removed: removed.display_name || "Member",
      effect:
        "They are out of the household and can no longer see anything in it. The records they entered stay in the household's history — removing them would change past totals for everybody.",
    });
  } catch (err) {
    return apiError(err);
  }
}
