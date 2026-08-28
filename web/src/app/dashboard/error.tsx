"use client";

// Where a render-time failure on the dashboard actually lands.
//
// This route used to wrap its whole <main> in a try/catch, which looked like it
// handled "something went wrong while drawing the dashboard" and could not.
// React does not run a component when its JSX is constructed — the JSX is a
// description, rendered after the page function has already returned — so the
// catch had gone out of scope by the time anything could throw inside it.
//
// An error boundary is the mechanism that does catch it, and this is one. It is
// scoped to /dashboard rather than the app root on purpose: the header, the tab
// bar and the rest of the chrome keep working, so a broken dashboard is one
// broken screen and not a broken app you cannot navigate out of.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto min-h-full max-w-2xl px-6 py-16">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-8 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <h1 className="text-lg font-semibold">The dashboard could not be drawn</h1>
        <p className="mt-2 text-sm leading-relaxed">
          Your records are safe — this is a display problem, not a data one. Nothing has been
          changed or lost.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="hm-tap min-h-11 rounded-full bg-amber-500 px-5 text-sm font-semibold text-white hover:bg-amber-600"
          >
            Try again
          </button>
          <a
            href="/record"
            className="hm-tap flex min-h-11 items-center rounded-full border border-amber-300 px-5 text-sm font-semibold hover:bg-amber-100/60 dark:border-amber-800"
          >
            Record a spend instead
          </a>
        </div>
        {/* The digest is what ties this screen to a line in the server log. It
            is not decoration: without it a report is "the dashboard broke", and
            with it the exact render is findable. */}
        {error.digest && (
          <p className="mt-4 text-xs text-amber-800/70 dark:text-amber-300/60">
            Reference: <code>{error.digest}</code>
          </p>
        )}
      </div>
    </main>
  );
}
