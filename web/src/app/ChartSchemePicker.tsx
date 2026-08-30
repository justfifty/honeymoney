"use client";

import { useSyncExternalStore } from "react";
import {
  CHART_SCHEMES,
  DEFAULT_SCHEME,
  SCHEME_ATTR,
  SCHEME_STORAGE_KEY,
  isChartScheme,
  type ChartScheme,
} from "@/lib/chartPalette";

// Which palette the app draws data in.
//
// IT LIVES IN app/ RATHER THAN app/graph/ BECAUSE IT NO LONGER GOVERNS ONE
// SCREEN. It began as a control over the six graph views, and for as long as
// the scheme was only re-applied by this component's own effect that is all it
// could govern — open the dashboard directly and the choice was simply not
// there. BootPrefs applies it before the first paint on every route now, so a
// reader who picks "colour-blind safe" gets it on the dashboard's bucket bars
// and status chips, the goal meters and the H-Score ring as well. A control
// with app-wide reach that is reachable from exactly one page is a setting
// people cannot find; this one is mounted on /dashboard and /graph, and it is
// the same component in both, so the two can never drift.
//
// It is not a theme picker. The three options do not change what a colour
// MEANS — spend is still one hue, saved another, and every mark keeps its text
// label — they change whether the reader can tell those two apart. The default
// encodes them as red against green, which is the pairing red-green colour
// deficiency erases; see lib/chartPalette.ts.

// ── The store ───────────────────────────────────────────────────────────────
//
// The scheme lives on <html> as a data attribute, which makes the DOM the
// source of truth rather than any React state: BootPrefs writes it before
// hydration, CSS reads it, and every chart on the page follows in the same
// frame without React re-rendering anything.
//
// So this subscribes to it instead of mirroring it. The previous version read
// localStorage in a useEffect and called setState — which runs a render, then
// a second one, after the paint it was trying to correct, and tripped
// react-hooks/set-state-in-effect for exactly that reason. useSyncExternalStore
// reads the DOM during render on the client and getServerSnapshot on the
// server, so there is one render and no effect at all.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): ChartScheme {
  const v = document.documentElement.getAttribute(SCHEME_ATTR);
  return isChartScheme(v) ? v : DEFAULT_SCHEME;
}

// The server has no document and no localStorage, so it renders the default and
// the client corrects it on hydration. That is safe here precisely because the
// COLOURS are not React's to render: they come from CSS variables the attribute
// selects, so the only thing that can differ is which pill looks pressed.
function getServerSnapshot(): ChartScheme {
  return DEFAULT_SCHEME;
}

function choose(next: ChartScheme) {
  document.documentElement.setAttribute(SCHEME_ATTR, next);
  // Always written, never deleted — including "honey", which matches no
  // override rule in globals.css and so lands on the :root defaults.
  try {
    localStorage.setItem(SCHEME_STORAGE_KEY, next);
  } catch {
    /* private mode, or site data blocked — the choice still applies for this
       page view, it just will not survive a reload. Losing a colour preference
       must never be able to throw in a click handler. */
  }
  for (const l of listeners) l();
}

export default function ChartSchemePicker({ label }: { label: string }) {
  const scheme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

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
              {/* The name is hidden on a narrow screen, not removed: three
                  labelled pills plus "Hide balances" wrap to three lines on a
                  390px dashboard and push the first real figure below the fold.
                  The swatch pair carries the choice visually, and the name is
                  still in the accessible name via aria-describedby below, so a
                  screen reader and a tooltip both keep the full sentence. */}
              <span className="hidden sm:inline">{s.label}</span>
              <span id={`scheme-hint-${s.id}`} className="sr-only">
                {s.label} — {s.hint}
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
