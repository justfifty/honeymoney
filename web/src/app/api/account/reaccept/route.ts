import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { requireContext } from "@/lib/household";
import { apiError } from "@/lib/apiError";
import { getConsents, recordConsent, NOTICE_VERSION, OFFERED_PURPOSES } from "@/lib/consent";
import { recordAcceptance, TERMS_VERSION, hasAcceptedCurrent } from "@/lib/agreements";

export const runtime = "nodejs";

// POST /api/account/reaccept — the user has read the updated documents.
//
// This closes a gap that had been open since the versions were introduced.
// NOTICE_VERSION and TERMS_VERSION both existed, both were compared against
// stored rows, and `hasAcceptedCurrent` was written, documented and then called
// by nothing. So when a document changed, the only consequence anywhere in the
// product was six words of grey text on the settings screen. Under the PDPA a
// materially revised notice — a new class of recipient, a corrected transfer
// destination — has to be GIVEN again, and giving it means the person is shown
// it, not that a constant changed in a file they will never open.
//
// THE RULE THIS ENDPOINT MUST NEVER BREAK: re-affirming carries the previous
// answer forward. It does not turn anything on. Someone who had AI switched off
// under the old notice has AI switched off under the new one, and the row we
// write says "no" again under the new version. An endpoint that quietly set
// optional purposes to true while the user was reading about transparency would
// be the single worst thing in this repository, so the value written is read
// from the ledger rather than taken from the request — the request body cannot
// influence it, because it is not read.
export async function POST() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requireContext();

    // Terms: one row per acceptance, and only if they are actually behind.
    // Re-accepting the same version on every page load would bury the real
    // acceptances in noise.
    const termsWasStale = !(await hasAcceptedCurrent(ctx.user.id));
    if (termsWasStale) {
      await recordAcceptance({ userId: ctx.user.id, source: "reaccept" });
    }

    // Consent: re-state each offered purpose at its EXISTING value under the
    // new notice version. A purpose never answered stays unanswered — writing
    // a row for it here would manufacture a decision the user never made.
    const consents = await getConsents(ctx.user.id);
    const reaffirmed: string[] = [];
    for (const spec of OFFERED_PURPOSES) {
      const cur = consents[spec.key];
      if (spec.required) {
        // Required purposes are a term of having an account, so they are
        // re-affirmed even if no row exists — that is what accepting is.
        if (!cur || cur.isStale) {
          await recordConsent({
            userId: ctx.user.id,
            tenantId: ctx.tenant.id,
            purpose: spec.key,
            granted: true,
            source: "settings",
          });
          reaffirmed.push(spec.key);
        }
        continue;
      }
      if (!cur || !cur.isStale) continue;
      await recordConsent({
        userId: ctx.user.id,
        tenantId: ctx.tenant.id,
        purpose: spec.key,
        granted: cur.granted, // carried forward, never raised
        source: cur.granted ? "settings" : "withdrawal",
      });
      reaffirmed.push(spec.key);
    }

    return NextResponse.json({
      ok: true,
      noticeVersion: NOTICE_VERSION,
      termsVersion: TERMS_VERSION,
      termsAccepted: termsWasStale,
      reaffirmed,
    });
  } catch (err) {
    return apiError(err);
  }
}
