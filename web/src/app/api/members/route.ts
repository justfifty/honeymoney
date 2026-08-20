import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { pbCreate, pbDelete, pbFirst, pbStr } from "@/lib/pocketbase";
import { requirePermission } from "@/lib/household";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";

// Members = the household roster the graph can be focused by. It grows (a partner
// moves in, a new baby) and shrinks (a child moves out), so it is
// editable. Deleting a member leaves their past transactions intact — PocketBase
// nulls the relation — so spend history is never lost, just unattributed.
//
// Note the distinction from /api/household: a row here is a *name on the graph*
// (someone spending is attributed to). A row with a `user` relation is also an
// *account* that can log in. This route only manages the former; promoting a
// name into a login is what an invite does.

// POST /api/members — { displayName, role? }
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requirePermission("manage_members");

    let body: { displayName?: string; role?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const displayName = body.displayName?.trim();
    const role = (body.role || "member").trim();
    if (!displayName) {
      return NextResponse.json({ error: "displayName is required" }, { status: 400 });
    }

    const member = await pbCreate<{ id: string; display_name: string; role: string }>("members", {
      tenant: ctx.tenant.id,
      display_name: displayName,
      role,
      // A roster entry with no login of its own can still be attributed to, but
      // it can't sign in — so it gets the most limited role.
      access_role: "viewer",
    });
    return NextResponse.json({ ok: true, member });
  } catch (err) {
    return apiError(err);
  }
}

// DELETE /api/members — { memberId }
export async function DELETE(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requirePermission("manage_members");

    let body: { memberId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body.memberId) {
      return NextResponse.json({ error: "memberId is required" }, { status: 400 });
    }

    // Scope the delete to the caller's own household.
    const member = await pbFirst<{ id: string; user: string; access_role: string }>(
      "members",
      `id = ${pbStr(body.memberId)} && tenant = ${pbStr(ctx.tenant.id)}`,
    );
    if (!member) {
      return NextResponse.json({ error: "Member not found in this household" }, { status: 404 });
    }
    if (member.id === ctx.memberId) {
      return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });
    }
    // Removing the last owner would leave the household with nobody able to
    // manage it — no invites, no role changes, ever again.
    if (member.access_role === "owner") {
      return NextResponse.json(
        { error: "Demote this owner to another role before removing them." },
        { status: 400 },
      );
    }

    await pbDelete("members", member.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
