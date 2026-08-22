// The chart registry — one place a chart's name and explanation are defined.
//
// Task 11 of the 2026-08-22 brief. Before this, the Gallery held the strongest
// writing in the app ("Sankey — where does every ringgit go?") and held it
// ALONE, while /graph kept a parallel `MODES` array with its own `label` and
// `icon`, and a `CAPTION` map beside it.
//
// The drift was not the one the brief predicted. /graph did NOT ship untranslated
// labels — it rendered `mode.<id>` keys, and the `label` field sitting next to
// them was dead English never read by anything. The real damage was in the
// translations those keys held, which nobody had reason to compare side by side:
//
//   • Chinese and Traditional Chinese named the TREEMAP "树状图" / "樹狀圖" —
//     literally "tree diagram", which is the name of a DIFFERENT chart in the
//     same switcher. A Chinese user picking a chart got the wrong one.
//   • Tamil had the identical collision: மரவரைபடம் (tree-diagram) for treemap
//     against மரம் (tree) for tree.
//   • "Organic" had been translated by the word rather than the meaning, landing
//     on the FOOD sense in three languages — 有机布局, 有機圖, இயற்கை all read
//     "organic produce", not "force-directed graph".
//
// Those are fixed. This is what a registry is FOR: the names only look wrong once
// something forces them into one list.
//
// A chart's name now exists in exactly one place. Every surface reads from here.
//
// WHAT IS DELIBERATELY NOT HERE: how to draw anything. This is names, order and
// prose. The renderers stay where they are — a registry that also owned layout
// would have to be imported by the server pages that only need a label, and
// would drag every chart library into every bundle that mentions one.

/** Stable ids. These are URL values (`/graph?mode=…`) — renaming one breaks links. */
export type ChartId = "sankey" | "treemap" | "tree" | "organic" | "bars" | "flow";

export interface ChartMeta {
  id: ChartId;
  /** Shown beside the name in switchers. Never the only distinguisher. */
  icon: string;
  /**
   * Short name for a switcher or tab. Points at the EXISTING `mode.<id>` keys
   * rather than a new set: those are already what /graph renders and are already
   * translated six ways. A second set of name keys would be the very drift this
   * registry exists to remove.
   */
  nameKey: string;
  /** One line, for a chart header. `g.caption.<id>` — already in all six locales. */
  oneLineKey: string;
  /** The longer "when would I use this?". `gallery.<id>.b` — already translated. */
  whenToUseKey: string;
  /** The Gallery's headline, which is the name plus the question it answers. */
  headlineKey: string;
  /** Screenshot under /public/gallery, for the static gallery. */
  shot: string;
}

// Order is the brief's Task 7.4 priority, mapped onto the ids that exist:
// Sankey · Progress Bars · Tree Diagram · Treemap · Node-Link · (Horizontal Bar,
// Summary Metrics — see RECONCILIATION below). `flow` is last because 7.4 does
// not list it at all.
export const CHARTS: Record<ChartId, ChartMeta> = {
  sankey: {
    id: "sankey",
    icon: "🌊",
    nameKey: "mode.sankey",
    oneLineKey: "g.caption.sankey",
    whenToUseKey: "gallery.sankey.b",
    headlineKey: "gallery.sankey.t",
    shot: "g-family-sankey.png",
  },
  bars: {
    id: "bars",
    icon: "📊",
    nameKey: "mode.bars",
    oneLineKey: "g.caption.bars",
    whenToUseKey: "gallery.bars.b",
    headlineKey: "gallery.bars.t",
    shot: "g-family-bars.png",
  },
  tree: {
    id: "tree",
    icon: "🌳",
    nameKey: "mode.tree",
    oneLineKey: "g.caption.tree",
    whenToUseKey: "gallery.tree.b",
    headlineKey: "gallery.tree.t",
    shot: "g-family-tree.png",
  },
  treemap: {
    id: "treemap",
    icon: "🟦",
    nameKey: "mode.treemap",
    oneLineKey: "g.caption.treemap",
    whenToUseKey: "gallery.treemap.b",
    headlineKey: "gallery.treemap.t",
    shot: "g-family-treemap.png",
  },
  organic: {
    id: "organic",
    icon: "🕸️",
    nameKey: "mode.organic",
    oneLineKey: "g.caption.organic",
    whenToUseKey: "gallery.organic.b",
    headlineKey: "gallery.organic.t",
    shot: "g-family-organic.png",
  },
  flow: {
    id: "flow",
    icon: "⇄",
    nameKey: "mode.flow",
    oneLineKey: "g.caption.flow",
    whenToUseKey: "gallery.flow.b",
    headlineKey: "gallery.flow.t",
    shot: "g-family-flow.png",
  },
};

/** Default display order. Sankey first — it is the default view everywhere. */
export const CHART_ORDER: ChartId[] = ["sankey", "bars", "tree", "treemap", "organic", "flow"];

export const CHART_LIST: ChartMeta[] = CHART_ORDER.map((id) => CHARTS[id]);

export function isChartId(v: unknown): v is ChartId {
  return typeof v === "string" && v in CHARTS;
}

/** The default when a URL carries no mode, or an unknown one. */
export const DEFAULT_CHART: ChartId = "sankey";

export function chartFromParam(v: unknown): ChartId {
  return isChartId(v) ? v : DEFAULT_CHART;
}

// ── RECONCILIATION with the brief's Task 7.4 list ───────────────────────────
//
// The brief asks for the 7.4 names to be reconciled against the Gallery, for the
// Gallery's wording to win, and for any mismatch to be REPORTED rather than
// resolved silently. Reported here, since this is the file that would otherwise
// quietly absorb the difference:
//
//   7.4 name              → registry id   note
//   ─────────────────────────────────────────────────────────────────────────
//   Sankey                → sankey        agrees
//   Progress Bars         → bars          the Gallery calls it "Budget", and the
//                                         component is BudgetBars. Gallery wins.
//                                         It is budget-vs-actual on a shared RM
//                                         scale, which "Progress Bars" does not
//                                         convey — it is not a progress meter.
//   Tree Diagram          → tree          agrees ("Tree")
//   Treemap               → treemap       agrees
//   Node-Link Diagram     → organic       the Gallery calls it "Organic". Same
//                                         chart. Gallery wins, but see the
//                                         translation note below — this is the
//                                         weakest name in the set.
//   Horizontal Bar Chart  → (none)        NO GALLERY ENTRY AND NO RENDERER.
//                                         7.4 lists it separately from Progress
//                                         Bars, so it is a seventh chart that
//                                         does not exist yet, not a synonym.
//   Summary Metrics       → (none)        NO GALLERY ENTRY AND NO RENDERER.
//                                         Arguably not a chart at all — a stat
//                                         row. Task 7 must decide whether it
//                                         belongs in this registry or is simply
//                                         part of the Dashboard's furniture.
//   (absent from 7.4)     ← flow          THE GALLERY HAS A SEVENTH THE BRIEF
//                                         DOES NOT LIST: "Flow — the classic
//                                         branch view". It ships today and is
//                                         reachable at /graph?mode=flow.
//
// So the counts differ in both directions: 7.4 asks for two charts that have no
// implementation, and omits one that does. The priority ORDER in 7.4 stands
// regardless, and CHART_ORDER above follows it.
//
// ── TRANSLATION NOTE, per the brief's instruction to flag rather than ship a
// literal translation ──────────────────────────────────────────────────────
//
//   • "Sankey" is a surname (Matthew Sankey, 1898). It does not translate and
//     should not be translated — every language keeps it, transliterating only
//     where the script requires it.
//   • "Organic" is the weak one. In English it is already jargon borrowed from
//     force-directed layout, and it tells a household nothing about their money;
//     translated literally into BM/Chinese/Tamil it lands closer to "organic
//     food" than "the raw graph". Its ONE-LINE description carries the meaning
//     in every language, which is why the registry insists a name is never shown
//     without one. A better name is worth finding — "Network" / "Rangkaian" /
//     "网络图" reads naturally in all six and says what it is.
//   • "Treemap" is an established chart name and survives as a loanword; the
//     Chinese 矩形树图 is the standard term and is used.
