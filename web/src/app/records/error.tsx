"use client";

// Render-time failures on the records list. Same reasoning as
// dashboard/error.tsx: the try/catch this page used to wrap its markup in could
// only ever catch the FETCH, because React renders the JSX after the function
// that built it has returned.
export default function RecordsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto min-h-full max-w-2xl px-6 py-16">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-8 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <h1 className="text-lg font-semibold">This list could not be drawn</h1>
        <p className="mt-2 text-sm leading-relaxed">
          Your records are safe — nothing has been changed or lost. This is the page failing to
          display them.
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
            href="/dashboard"
            className="hm-tap flex min-h-11 items-center rounded-full border border-amber-300 px-5 text-sm font-semibold hover:bg-amber-100/60 dark:border-amber-800"
          >
            Back to the dashboard
          </a>
        </div>
        {error.digest && (
          <p className="mt-4 text-xs text-amber-800/70 dark:text-amber-300/60">
            Reference: <code>{error.digest}</code>
          </p>
        )}
      </div>
    </main>
  );
}
