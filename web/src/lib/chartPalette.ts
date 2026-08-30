// One place where a chart colour is decided.
//
// WHY THIS EXISTS AT ALL. The same four hex values were declared independently
// in SankeyFlow, BudgetBars, Treemap, TreeGraph and NetworkGraph. Five copies of
// "#248A54" is not a style problem, it is a correctness one: the day somebody
// adjusts "on track" green in one chart, the six views stop agreeing about what
// green means, and a reader who learned the colour on the dashboard reads the
// treemap wrong. Colours here are SEMANTIC — they encode a status or an entity
// kind, never a rank or a magnitude — so they have to be defined once.
//
// WHY THERE IS MORE THAN ONE SCHEME, and it is not decoration. The default pair
// for the most important distinction in the product — money SPENT (#C94F4F) and
// money KEPT (#248A54) — is red against green. That is the single worst pairing
// available: red-green colour deficiency affects roughly 1 in 12 men, and under
// deuteranopia those two collapse toward the same muddy tone. A household using
// HoneyMoney to see where their money went could not, for the whole first year,
// tell the two apart. `cvd` fixes that; `contrast` exists because a projector in
// a competition hall eats subtle greens and reds alive.
//
// HOW IT IS APPLIED. Each scheme is a set of CSS custom properties (see
// globals.css). Components reference `var(--hm-c-*)` in SVG presentation
// attributes, which are CSS properties and therefore resolve variables. Nothing
// re-renders when the scheme changes — the browser recomputes the values — so
// this cannot cause a hydration mismatch and costs nothing at runtime.

/** The semantic roles. The NAME is the contract; the hex is an implementation. */
export const CHART_VARS = {
  /** Money arriving from outside the household. */
  income: "var(--hm-c-income)",
  /** A bucket or wallet — somewhere money sits on its way through. */
  bucket: "var(--hm-c-bucket)",
  /** Money leaving: a vendor, a spend, a bucket past its cap. */
  spend: "var(--hm-c-spend)",
  /** Money kept: savings, a goal, a bucket on track. */
  saved: "var(--hm-c-saved)",
  /** On course to breach, but not there yet. */
  atRisk: "var(--hm-c-at-risk)",
  /** No plan attached — unfunded, unknown, not an opinion about it. */
  neutral: "var(--hm-c-neutral)",
  /** A commitment already promised: loan, insurance, school fees. */
  obligation: "var(--hm-c-obligation)",
  /** A person in the household. */
  member: "var(--hm-c-member)",
  // NOT `as const`. With it, every value gets its own literal type, so the
  // moment one variable is inferred from `CHART_VARS.spend` it can never hold
  // `CHART_VARS.saved` -- and these are colours, assigned to each other
  // constantly. They are strings; the KEYS are the contract, not the values.
};

export type ChartScheme = "honey" | "cvd" | "contrast";

export interface SchemeMeta {
  id: ChartScheme;
  /** Shown in the picker. */
  label: string;
  /** Why someone would pick it — the picker is useless without this. */
  hint: string;
}

export const CHART_SCHEMES: SchemeMeta[] = [
  {
    id: "honey",
    label: "Honey",
    hint: "The house palette. Warm, and what every screenshot and slide uses.",
  },
  {
    id: "cvd",
    label: "Colour-blind safe",
    hint:
      "Spend and saved stop being red against green — the pairing about 1 in 12 men cannot separate. " +
      "Built on the Okabe–Ito set, which is designed to stay distinct for every common type.",
  },
  {
    id: "contrast",
    label: "High contrast",
    hint: "Darker and heavier, for a projector or a bright room where the soft tones wash out.",
  },
];

export const DEFAULT_SCHEME: ChartScheme = "honey";

/** The attribute globals.css keys the schemes off. Set on <html>. */
export const SCHEME_ATTR = "data-chart-scheme";
export const SCHEME_STORAGE_KEY = "hm.chart.scheme.v1";

export function isChartScheme(v: unknown): v is ChartScheme {
  return v === "honey" || v === "cvd" || v === "contrast";
}
