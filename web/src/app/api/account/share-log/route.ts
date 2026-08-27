import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { requireContext, listMembers } from "@/lib/household";
import { apiError } from "@/lib/apiError";
import { listShareEvents } from "@/lib/sharingStore";
import { specForShare, isShareType } from "@/lib/sharing";

export const runtime = "nodejs";

// GET /api/account/share-log — who read what of mine, and what I changed.
//
// The scope is deliberately narrow: events about MY data, plus household
// joins and departures. A household-wide feed would be a worse product and a
// worse privacy position — it would let one member watch another checking their
// own privacy settings, which turns the transparency feature into the
// surveillance feature it was built to answer.
export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requireContext();
    const limit = Math.min(200, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 100));

    const [events, members] = await Promise.all([
      listShareEvents(ctx.tenant.id, ctx.memberId, limit),
      listMembers(ctx.tenant.id),
    ]);

    // Resolve member ids to names here rather than storing a name on every row.
    // A stored name goes stale when somebody changes theirs, and an access log
    // showing a name the household no longer uses is a log people distrust.
    const nameOf = new Map(members.map((m) => [m.id, m.display_name || "Member"]));

    return NextResponse.json({
      ok: true,
      events: events.map((e) => ({
        id: e.id,
        at: e.created,
        kind: e.kind,
        type: isShareType(e.data_type) ? e.data_type : null,
        typeLabel: isShareType(e.data_type) ? (specForShare(e.data_type)?.label ?? null) : null,
        // Prefer the live name; fall back to whatever was stamped at the time
        // for an actor who has since left and has no member row any more.
        actor: nameOf.get(e.actor_member) ?? e.actor_label ?? "Someone",
        isMe: e.actor_member === ctx.memberId,
        detail: e.detail,
      })),
      // An empty log is ambiguous — "nobody looked" and "we are not recording"
      // look identical — so the API says which it is instead of leaving the UI
      // to guess.
      recordingSince: "2026-08-27",
    });
  } catch (err) {
    return apiError(err);
  }
}
