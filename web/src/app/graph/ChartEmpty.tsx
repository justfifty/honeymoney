"use client";

import Link from "next/link";

// What a chart shows when there is nothing to show.
//
// Task 7: "zero → a real empty state with a route to Record, not a blank panel
// or a zero-height SVG." Measured on 2026-08-23, three of the five renderers
// drew their axes and nothing else at zero items — between 145 and 507 bytes of
// SVG. Nothing threw and nothing looked broken to a test, but to a new user an
// empty chart frame reads as "this app is broken", not "you haven't logged
// anything yet". The difference between those two readings is whether they open
// it again tomorrow.
//
// The route to Record is the point. An empty state that only apologises leaves
// the user exactly where they were; one that names the next action is the
// shortest path out of the emptiness that caused it.

export default function ChartEmpty({
  title,
  body,
  cta,
  href = "/record",
}: {
  title: string;
  body: string;
  cta: string;
  href?: string;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span aria-hidden className="text-3xl">
        📊
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-zinc-500">{body}</p>
      <Link
        href={href}
        className="mt-2 inline-flex min-h-11 items-center rounded-full bg-amber-600 px-5 text-sm font-semibold text-white transition hover:bg-amber-700"
      >
        {cta}
      </Link>
    </div>
  );
}
