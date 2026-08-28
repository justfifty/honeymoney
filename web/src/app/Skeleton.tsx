// Route-transition skeletons.
//
// WHY THESE EXIST. Every signed-in route in this app is `force-dynamic`, so a
// tap on a tab produced NOTHING on screen — no spinner, no dimming, nothing —
// until the server had finished the whole render and the HTML came back over
// the tunnel. On a phone that reads as a dead app, and the usual response is to
// tap again, which starts a second render.
//
// A `loading.tsx` beside a page turns that into an instant paint: Next prefetches
// the loading boundary for a dynamic route as soon as the link is in view, so
// the skeleton is already in the browser when the tap happens and swaps in on
// the same frame. The page then streams in behind it. Nothing about the server
// got faster; the wait simply stopped being a blank one.
//
// These are deliberately dumb grey blocks sized like the real content, not
// spinners. A spinner says "wait"; a skeleton in the shape of the page says
// "this is the page, arriving" — and because the boxes match the real layout,
// the content does not jump when it lands.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-200/80 dark:bg-zinc-800/80 ${className}`} />;
}

function Card({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-900/60 ${className}`}
    />
  );
}

/**
 * A page-shaped placeholder. `width` mirrors the max-width the real <main> uses
 * so the skeleton occupies the same column — a skeleton that is a different
 * width than the page is a layout shift with extra steps.
 */
export default function Skeleton({
  width = "max-w-5xl",
  title = true,
  cards = 3,
  rows = 4,
}: {
  width?: string;
  title?: boolean;
  cards?: number;
  rows?: number;
}) {
  return (
    // aria-busy + role=status so a screen reader announces "loading" once
    // rather than reading out a wall of empty boxes.
    <main
      className={`mx-auto min-h-full w-full min-w-0 ${width} px-4 py-8 sm:px-6 sm:py-12`}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      {title && (
        <div className="mb-6 space-y-2" aria-hidden>
          <Bar className="h-6 w-40" />
          <Bar className="h-3.5 w-64 max-w-full" />
        </div>
      )}
      {cards > 0 && (
        <div className="grid gap-3 sm:grid-cols-3" aria-hidden>
          {Array.from({ length: cards }, (_, i) => (
            <Card key={i} className="h-24" />
          ))}
        </div>
      )}
      {rows > 0 && (
        <div className="mt-6 space-y-2.5" aria-hidden>
          {Array.from({ length: rows }, (_, i) => (
            <Card key={i} className="h-14" />
          ))}
        </div>
      )}
    </main>
  );
}

/** The /graph gallery: one tall canvas under a row of chart tabs. */
export function ChartSkeleton() {
  return (
    <main
      className="mx-auto min-h-full w-full min-w-0 max-w-5xl px-4 py-4 sm:px-6 sm:py-6"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <div className="flex gap-2 overflow-hidden" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <Bar key={i} className="h-8 w-24 shrink-0" />
        ))}
      </div>
      <Card className="mt-4 h-[26rem]" />
      <div className="mt-4 grid gap-3 sm:grid-cols-3" aria-hidden>
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="h-20" />
        ))}
      </div>
    </main>
  );
}
