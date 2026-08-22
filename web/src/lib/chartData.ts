// Making a chart survive any number of items.
//
// Task 7: "No chart may break, blank out or disappear at any item count — which
// is NOT the same as rendering every item."
//
// That distinction is the whole of this module. Measured with check:charts on
// 2026-08-23, the five renderers did not break at 200 items — they drew all 200:
// 230KB of markup for the tree, 173KB for the treemap, 113KB for the network.
// Nothing threw, nothing looked broken in a test, and the result is unreadable
// on any screen and expensive on the mobile connection this app is built for.
//
// Three regimes, and only the middle one was ever really handled:
//
//   zero        a real empty state with a route to Record — not a blank panel
//               and not a zero-height SVG. Three of the five drew axes and
//               nothing else, which reads to a new user as "this is broken"
//               rather than "you haven't logged anything yet".
//   one or two  must render, with sensible minimum geometry.
//   many        aggregate to top N by value plus ONE inspectable "Other".

/** A row that has been folded into the aggregate, kept so "Other" can be opened. */
export interface OtherGroup<T> {
  /** How many rows this stands for. */
  count: number;
  /** Their combined value. */
  value: number;
  /** The rows themselves — "inspectable" is the requirement, not "discarded". */
  items: T[];
}

export interface Aggregated<T> {
  shown: T[];
  other: OtherGroup<T> | null;
}

/**
 * Keep the biggest N, fold the rest into one group.
 *
 * Sorted by VALUE rather than by name: the reason to cap a chart is that small
 * items are unreadable, and the ones worth keeping are the ones carrying money.
 * An alphabetical cap would hide the household's largest expense because it
 * begins with W.
 *
 * The folded rows are kept, not dropped. The brief asks for a single
 * *inspectable* Other, and a total with nothing behind it is exactly the kind of
 * number a household cannot reconcile — the same failure as goal progress before
 * Task 9 split it in two.
 *
 * Folding only happens at n+2 or more. Collapsing a single leftover row into
 * "Other (1)" costs the user its name and saves them nothing.
 */
export function topNWithOther<T>(
  items: T[],
  n: number,
  valueOf: (item: T) => number,
): Aggregated<T> {
  if (items.length <= n + 1) return { shown: items, other: null };

  const sorted = [...items].sort((a, b) => valueOf(b) - valueOf(a));
  const shown = sorted.slice(0, n);
  const rest = sorted.slice(n);

  return {
    shown,
    other: {
      count: rest.length,
      value: rest.reduce((s, r) => s + valueOf(r), 0),
      items: rest,
    },
  };
}

/**
 * How many items each chart can carry before it stops being readable.
 *
 * Tuned per chart type because their densities differ by an order of magnitude,
 * not by taste: a horizontal bar needs a label-height row each and runs out of
 * vertical space; a treemap can show a small cell legibly; a force-directed
 * network turns into a hairball long before it runs out of pixels — which is the
 * real reason it is the weakest of the three hierarchy views.
 *
 * `narrow` is the 375px phone figure. A Sankey with twelve bands at 375px is
 * twelve unreadable slivers, and the brief singles that width out as the one to
 * design for.
 */
export const CHART_LIMITS: Record<string, { wide: number; narrow: number }> = {
  sankey: { wide: 12, narrow: 6 },
  treemap: { wide: 24, narrow: 12 },
  bars: { wide: 16, narrow: 10 },
  tree: { wide: 20, narrow: 8 },
  organic: { wide: 40, narrow: 18 },
  flow: { wide: 14, narrow: 7 },
};

/** The limit for a chart at a given width. */
export function limitFor(chart: string, width: number): number {
  const l = CHART_LIMITS[chart] ?? { wide: 20, narrow: 10 };
  return width < 640 ? l.narrow : l.wide;
}

/**
 * The label for the aggregate row. A count, always — "Other" alone tells the
 * user nothing about whether it is hiding two rows or two hundred.
 */
export function otherLabel(count: number): string {
  return `Other (${count})`;
}
