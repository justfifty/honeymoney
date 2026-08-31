import { t, type Locale } from "@/lib/i18n";

// "We cannot reach your data right now" — the screen a household sees when
// PocketBase is not answering.
//
// ── WHY IT IS NOT THE SETUP NOTICE ─────────────────────────────────────────
//
// It used to be. On 2026-08-31 the shared host that PocketBase lives on went
// down for twenty minutes, and every signed-in page said "Almost there — finish
// setup", which is what this app says to a DEVELOPER who has not put a database
// URL in .env yet. To somebody who has been logging spends for a month it reads
// as "your household is gone, and it is somehow your job to fix it". It sent
// the person who owns this app looking for a settings screen that was never
// broken.
//
// Nothing was unfinished and nothing was lost. So this says that, in the two
// sentences a person actually needs: your records are safe, this is temporary,
// here is what to do (nothing — try again in a minute).
//
// ── THE MARKER, AND WHY THE SERVICE WORKER NEEDS ONE ───────────────────────
//
// `data-hm-degraded` is not decoration. public/sw.js serves navigations
// network-first and caches whatever came back with a 200 — and THIS page is a
// 200, because a React Server Component cannot set a status code. So an outage
// did not merely show the wrong screen, it OVERWROTE the last good copy of the
// dashboard in the cache with an error state. The next time that household
// opened the app on a train with no signal, the offline fallback they got was
// this page instead of yesterday's balances.
//
// The service worker looks for this attribute and declines to cache the
// response. A degraded render is worth showing; it is never worth keeping.
export default function DegradedNotice({
  lang,
  /** What actually failed. Shown small — a household does not need it, but the
   *  person they will send a screenshot to does. */
  detail,
  /** Where they were trying to get to, so the sentence can name it. */
  where,
}: {
  lang: Locale;
  detail?: string;
  where?: string;
}) {
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);

  return (
    <div
      data-hm-degraded="1"
      className="mx-auto max-w-2xl rounded-2xl border border-amber-300 bg-amber-50 p-8 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <h2 className="font-display text-lg font-semibold">{tr("dash.down.title")}</h2>
      <p className="mt-2 text-sm leading-relaxed">
        {where ? tr("dash.down.bodyWhere", { where }) : tr("dash.down.body")}
      </p>
      {/* The reassurance is the whole point of the screen, so it is not a
          footnote. Nothing has been lost, and nothing is theirs to fix. */}
      <p className="mt-3 text-sm font-medium">{tr("dash.down.safe")}</p>

      {/* A plain link to the same URL, because a phone showing a cached error
          needs a way to ask again that is not "find the reload button in a
          browser chrome you have hidden". */}
      <a
        href=""
        className="mt-5 inline-flex min-h-11 items-center rounded-full bg-amber-500 px-5 text-sm font-semibold text-white hover:bg-amber-600"
      >
        {tr("dash.down.retry")}
      </a>

      {detail && (
        <p className="mt-4 break-words text-xs opacity-70">
          <span className="font-medium">{tr("dash.down.detail")}</span> {detail}
        </p>
      )}
    </div>
  );
}
