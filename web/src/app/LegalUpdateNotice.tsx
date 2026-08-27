import Link from "next/link";
import { getContext } from "@/lib/household";
import { getConsents, OFFERED_PURPOSES, type ConsentMap } from "@/lib/consent";
import { hasAcceptedCurrent } from "@/lib/agreements";

// App-wide bar shown when the privacy notice or the terms have been materially
// revised since this account last answered.
//
// Both documents have carried a version from the day they shipped, and both
// versions were compared against stored rows — but nothing ever told the user.
// A notice revised to name two recipients it had never named (Telegram, the
// OpenTimestamps calendars) and to correct where the database actually lives is
// not given by being deployed. It is given by being put in front of the person
// it describes. That is what this bar is for.
//
// Deliberately a BAR and not a modal that blocks the app. A wall between a
// household and its own money records, thrown up because we edited a document,
// is a worse outcome than a day's delay in re-acknowledgement — and a blocking
// dialog is answered by whichever button dismisses it fastest, which is the
// opposite of reading. It sits on every page until it is dealt with.
export default async function LegalUpdateNotice() {
  const ctx = await getContext().catch(() => null);
  if (!ctx) return null;
  // One thing at a time: an account already counting down to deletion has a
  // more urgent bar of its own, and two stacked amber bars is neither read.
  if (ctx.pendingDeletion) return null;

  const [termsCurrent, consents] = await Promise.all([
    hasAcceptedCurrent(ctx.user.id).catch(() => true),
    // Typed fallback, not a bare {}: an unreachable database must read as
    // "nothing stale" rather than widening the map to something unindexable.
    getConsents(ctx.user.id).catch((): ConsentMap => ({})),
  ]);
  const consentStale = OFFERED_PURPOSES.some((p) => consents[p.key]?.isStale);
  if (termsCurrent && !consentStale) return null;

  return (
    <Link
      href="/legal-update"
      className="block bg-zinc-900 px-4 py-2 text-center text-xs font-medium text-amber-200 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700"
    >
      📄 We have updated the privacy notice and terms — tap to see what changed.
    </Link>
  );
}
