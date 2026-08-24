import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { requireContext } from "@/lib/household";
import { apiError } from "@/lib/apiError";
import {
  getConsents,
  recordConsent,
  isPurpose,
  specFor,
  NOTICE_VERSION,
  PURPOSES,
} from "@/lib/consent";

export const runtime = "nodejs";

// GET  /api/account/consent — what this account has agreed to, per purpose.
// POST /api/account/consent — change one answer. { purpose, granted }
//
// Withdrawal is the same endpoint as granting, on purpose. A separate "revoke"
// route tends to grow separate rules, and the one rule that must never differ
// between the two directions is how fast it takes effect. Here it cannot
// differ: both append a row, and every reader takes the newest row.
//
// There is no bulk "save all preferences" body. One purpose per request means a
// half-failed write leaves three correct answers and one unchanged, instead of
// four ambiguous ones.

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requireContext();
    const consents = await getConsents(ctx.user.id);
    return NextResponse.json({
      ok: true,
      noticeVersion: NOTICE_VERSION,
      // The catalogue ships with the state so the settings UI cannot drift out
      // of sync with lib/consent.ts by hard-coding its own list of purposes.
      purposes: PURPOSES.map((p) => ({
        key: p.key,
        required: p.required,
        directMarketing: p.directMarketing,
        granted: consents[p.key]?.granted ?? false,
        answeredAt: consents[p.key]?.at ?? null,
        isStale: consents[p.key]?.isStale ?? false,
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

    let body: { purpose?: string; granted?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!isPurpose(body.purpose)) {
      return NextResponse.json({ error: "Unknown purpose" }, { status: 400 });
    }
    const spec = specFor(body.purpose)!;
    const granted = body.granted === true;

    // A required purpose cannot be switched off here, and the honest answer is
    // not "403 denied" — it is that switching it off means closing the account,
    // which is a different, heavier action with its own route. Say so, and
    // point at it, rather than letting someone believe they have opted out of
    // processing while their records are still being processed.
    if (spec.required && !granted) {
      return NextResponse.json(
        {
          error:
            "This is what the app does with your own records, so it cannot be switched off separately. To stop it entirely, close the account.",
          closeAccountAt: "/api/account/delete",
        },
        { status: 409 },
      );
    }

    await recordConsent({
      userId: ctx.user.id,
      tenantId: ctx.tenant.id,
      purpose: body.purpose,
      granted,
      // A withdrawal is labelled as one in the ledger. It is the event most
      // likely to be asked about later, and "source: settings" for both
      // directions would make it findable only by comparing adjacent rows.
      source: granted ? "settings" : "withdrawal",
    });

    return NextResponse.json({ ok: true, purpose: body.purpose, granted });
  } catch (err) {
    return apiError(err);
  }
}
