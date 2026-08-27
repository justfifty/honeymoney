import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { requireContext, listMembers } from "@/lib/household";
import { apiError } from "@/lib/apiError";
import {
  SHARE_SPECS,
  SHARING_POLICY_VERSION,
  isShareType,
  specForShare,
} from "@/lib/sharing";
import { getShares, recordShare, revokeAllShares, logShareEvent } from "@/lib/sharingStore";

export const runtime = "nodejs";

// GET  /api/account/sharing — what I share with my household, and with whom.
// POST /api/account/sharing — change one switch, or revoke everything.
//
// THE SUBJECT IS ALWAYS THE CALLER. There is no `memberId` parameter on either
// verb, and that absence is the security model rather than an oversight: with
// no field naming whose sharing is being changed, there is no request an owner
// — or anyone who has got hold of an owner's session — can construct that
// alters what somebody else shares. Household roles govern the household's
// records; they do not govern a person's own disclosure.
//
// The mirror of that rule: nothing here can turn a share ON for someone else
// either. The only account that can widen your disclosure is yours.

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requireContext();
    const [shares, members] = await Promise.all([
      getShares(ctx.memberId),
      listMembers(ctx.tenant.id),
    ]);

    // Who "the household" actually means, so the screen can name them instead
    // of saying "shared with your household" and leaving the reader to guess
    // how many people that is. A share you cannot picture is a share you cannot
    // meaningfully consent to.
    const others = members
      .filter((m) => m.id !== ctx.memberId)
      .map((m) => ({ id: m.id, name: m.display_name || "Member", role: m.access_role }));

    return NextResponse.json({
      ok: true,
      policyVersion: SHARING_POLICY_VERSION,
      memberId: ctx.memberId,
      household: { id: ctx.tenant.id, name: ctx.tenant.name, others },
      types: SHARE_SPECS.map((spec) => ({
        key: spec.key,
        label: spec.label,
        onMeans: spec.onMeans,
        offMeans: spec.offMeans,
        detail: spec.detail,
        default: spec.default,
        shared: shares[spec.key].shared,
        answeredAt: shares[spec.key].at,
        isStale: shares[spec.key].isStale,
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requireContext();

    let body: { type?: string; shared?: boolean; revokeAll?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (body.revokeAll === true) {
      await revokeAllShares({
        tenantId: ctx.tenant.id,
        memberId: ctx.memberId,
        userId: ctx.user.id,
        actorLabel: ctx.user.name || ctx.user.email,
      });
      return NextResponse.json({
        ok: true,
        revokedAll: true,
        // Said back to the caller, not only shown in the UI that made the call.
        // A client that revokes and then renders its own reassuring sentence can
        // drift from what the server did; this is the server's own account of it.
        effect:
          "Every sharing switch is now off, and that applies to your history as well as to anything new. Your household can no longer see your transactions, categories, documents, goals, score or insights.",
      });
    }

    if (!isShareType(body.type)) {
      return NextResponse.json({ error: "Unknown data type" }, { status: 400 });
    }
    const spec = specForShare(body.type)!;
    const shared = body.shared === true;

    await recordShare({
      tenantId: ctx.tenant.id,
      memberId: ctx.memberId,
      userId: ctx.user.id,
      type: body.type,
      shared,
      source: "settings",
    });

    await logShareEvent({
      tenantId: ctx.tenant.id,
      subjectMemberId: ctx.memberId,
      actorMemberId: ctx.memberId,
      actorLabel: ctx.user.name || ctx.user.email,
      kind: shared ? "share_granted" : "share_revoked",
      type: body.type,
      detail: shared
        ? `Started sharing ${spec.label.toLowerCase()} with the household.`
        : `Stopped sharing ${spec.label.toLowerCase()}, including past records.`,
    });

    return NextResponse.json({
      ok: true,
      type: body.type,
      shared,
      effect: shared ? spec.onMeans : spec.offMeans,
      // Repeated on every revoke rather than shown once at onboarding. The rule
      // is counter-intuitive enough that a person deserves to meet it at the
      // moment it applies to them, not to have read it weeks ago.
      retroactive: shared
        ? null
        : "This applies to your existing records too, not only to new ones.",
    });
  } catch (err) {
    return apiError(err);
  }
}
