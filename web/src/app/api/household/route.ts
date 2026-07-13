import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { listHouseholdsFor, listInvites, listMembers, requireContext, can } from "@/lib/household";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/household — who is in my household, what can I do, what's pending.
export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requireContext();
    const [members, households] = await Promise.all([
      listMembers(ctx.tenant.id),
      listHouseholdsFor(ctx.user.id),
    ]);
    // Only someone who can manage members has any business seeing live invite
    // codes — an unredeemed code is a key to the household.
    const invites = can(ctx.accessRole, "invite") ? await listInvites(ctx.tenant.id) : [];

    return NextResponse.json({
      tenant: ctx.tenant,
      me: { memberId: ctx.memberId, accessRole: ctx.accessRole, email: ctx.user.email },
      members: members.map((m) => ({
        id: m.id,
        displayName: m.display_name,
        role: m.role,
        accessRole: m.access_role,
        email: m.expand?.user?.email ?? "",
        isAccount: Boolean(m.user),
        isMe: m.id === ctx.memberId,
      })),
      invites: invites.map((i) => ({
        id: i.id,
        code: i.code,
        accessRole: i.access_role,
        displayName: i.display_name,
        email: i.email,
        expiresAt: i.expires_at,
      })),
      households,
    });
  } catch (err) {
    return apiError(err);
  }
}
