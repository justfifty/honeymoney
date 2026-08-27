import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { requireContext, leaveHousehold } from "@/lib/household";
import { apiError } from "@/lib/apiError";
import { revokeAllShares, logShareEvent } from "@/lib/sharingStore";

export const runtime = "nodejs";

// POST /api/household/leave — take myself out of this household, now.
//
// NO CONFIRMATION TOKEN, NO OWNER APPROVAL, NO COOLING-OFF PERIOD. Every one of
// those is a good idea for a destructive action and a bad idea for this one.
// The person most likely to use this is someone who needs out of a shared
// financial view quickly and without a negotiation, and each safeguard we could
// add here is another step during which they can be interrupted, seen, or
// talked out of it. The action is not destructive — no records are deleted, and
// they can be invited back — so the usual reasoning does not apply.
//
// The confirmation lives in the UI, one tap before this call, and says what will
// happen. That is the right place for it: reversible-but-serious.
//
// Order of operations is load-bearing and is enforced here rather than left to
// the client: revoke every share FIRST, drop the membership SECOND. If the
// second step fails, the person is still in the household but sharing nothing,
// which is the safe half of the outcome. The reverse order would leave a person
// out of the household with their history still marked shared.
export async function POST() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requireContext();
    const label = ctx.user.name || ctx.user.email;

    await revokeAllShares({
      tenantId: ctx.tenant.id,
      memberId: ctx.memberId,
      userId: ctx.user.id,
      actorLabel: label,
    });

    const result = await leaveHousehold(ctx.user, ctx.tenant.id);

    await logShareEvent({
      tenantId: ctx.tenant.id,
      subjectMemberId: ctx.memberId,
      actorMemberId: ctx.memberId,
      actorLabel: label,
      kind: "member_left",
      detail: "Left the household.",
    });

    return NextResponse.json({
      ok: true,
      wasLast: result.wasLast,
      newTenantId: result.newTenantId,
      // What actually happened, in the words the user needs — including the
      // part that is NOT in their favour. A response that only listed the
      // reassuring half would be the app lying by omission at the exact moment
      // someone is relying on it.
      effect: [
        "You are out of that household. Nobody there can see anything of yours from now on.",
        "Records you entered stay in that household's history, because they are part of its accounts and removing them would rewrite months of totals for the people still in it. What is gone is the link to you: your sharing is revoked and your name is off the member list.",
        result.newTenantId
          ? "You now have a household of your own, with nobody else in it."
          : "You are still in your other household.",
      ],
    });
  } catch (err) {
    return apiError(err);
  }
}
