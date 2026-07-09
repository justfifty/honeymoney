import { NextResponse } from "next/server";
import { isDatabaseConfigured, config } from "@/lib/config";
import { pbCreate, pbDelete, pbFirst, pbStr } from "@/lib/pocketbase";

export const runtime = "nodejs";

// Members = the household/business roster the graph can be focused by. It grows
// (new baby, new hire) and shrinks (child moves out, staff leaves), so it is
// editable. Deleting a member leaves their past transactions intact — PocketBase
// nulls the relation — so spend history is never lost, just unattributed.

// POST /api/members — { tenantId?, displayName, role? }
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  let body: { tenantId?: string; displayName?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tenantId = body.tenantId || config.demoTenantId;
  const displayName = body.displayName?.trim();
  const role = (body.role || "member").trim();
  if (!tenantId || !displayName) {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  }

  try {
    const member = await pbCreate<{ id: string; display_name: string; role: string }>("members", {
      tenant: tenantId,
      display_name: displayName,
      role,
    });
    return NextResponse.json({ ok: true, member });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/members — { tenantId?, memberId }
export async function DELETE(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  let body: { tenantId?: string; memberId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tenantId = body.tenantId || config.demoTenantId;
  const memberId = body.memberId;
  if (!tenantId || !memberId) {
    return NextResponse.json({ error: "memberId is required" }, { status: 400 });
  }

  try {
    // scope the delete to the tenant so one household can't remove another's people
    const member = await pbFirst<{ id: string }>(
      "members",
      `id = ${pbStr(memberId)} && tenant = ${pbStr(tenantId)}`,
    );
    if (!member) {
      return NextResponse.json({ error: "Member not found for this tenant" }, { status: 404 });
    }
    await pbDelete("members", member.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
