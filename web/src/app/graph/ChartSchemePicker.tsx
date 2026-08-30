"use client";

import { useEffect, useState } from "react";
import {
  CHART_SCHEMES,
  DEFAULT_SCHEME,
  SCHEME_STORAGE_KEY,
  isChartScheme,
  type ChartScheme,
} from "@/lib/chartPalette";

// Which palette the six views draw in.
//
// Built on the same pattern as dashboard/PrivacyToggle: persist a choice, set a
// root attribute, and let CSS do the rest. Nothing re-renders and no colour is
// prop-drilled — globals.css redefines the --hm-c-* variables under
// :root[data-chart-scheme], so every chart on the page follows in the same
// frame, including ones this component has never heard of.
//
// It is not a theme picker. The three options do not change what a colour
// MEANS — spend is still one hue, saved another, and every mark keeps its text
// label — they change whether the reader can tell those two apart. The default
// encodes them as red against green, which is the pairing red-green colour
// deficiency erases; see lib/chartPalette.ts.
// Module scope on purpose. Written inside the component, the React Compiler
// reads `document.documentElement.dataset` as a value the component is mutating
// and refuses it. Out here it is plainly what it is: a side effect on the
// document, not on any React state.
function applyScheme(next: ChartScheme) {
  document.documentElement.dataset.chartScheme = next;
}

export default function ChartSchemePicker({ label }: { label: string }) {
  const [scheme, setScheme] = useState<ChartScheme>(DEFAULT_SCHEME);

  useEffect(() => {
    const stored = localStorage.getItem(SCHEME_STORAGE_KEY);
    if (isChartScheme(stored)) {
      setScheme(stored);
      applyScheme(stored);
    }
  }, []);

  function choose(next: ChartScheme) {
    setScheme(next);
    // Always written, never deleted — including "honey", which matches no
    // override rule in globals.css and so lands on the :root defaults.
    applyScheme(next);
    localStorage.setItem(SCHEME_STORAGE_KEY, next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {CHART_SCHEMES.map((s) => {
          const on = scheme === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(s.id)}
              // The hint is the whole reason a person picks one of these, so it
              // is the accessible name rather than decoration on hover.
              title={s.hint}
              aria-describedby={`scheme-hint-${s.id}`}
              className={
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors " +
                (on
                  ? "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200"
                  : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300")
              }
            >
              {/* Two swatches, and specifically the two that matter: spend and
                  saved. A palette picker whose preview does not show the pair
                  the reader is trying to tell apart is asking them to guess. */}
              <span aria-hidden className="flex">
                <span
                  className="h-3 w-3 rounded-l-full"
                  style={{ background: SWATCH[s.id].spend }}
                />
                <span
                  className="h-3 w-3 rounded-r-full"
                  style={{ background: SWATCH[s.id].saved }}
                />
              </span>
              {s.label}
              <span id={`scheme-hint-${s.id}`} className="sr-only">
                {s.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Literal hexes, deliberately: a swatch must show the colour of the scheme it
// OFFERS, not the one currently applied, so it cannot use var(--hm-c-*).
const SWATCH: Record<ChartScheme, { spend: string; saved: string }> = {
  honey: { spend: "#c94f4f", saved: "#248a54" },
  cvd: { spend: "#d55e00", saved: "#009e73" },
  contrast: { spend: "#9b1c1c", saved: "#0b5c37" },
};
