"use client";

import { useEffect, useState } from "react";
import { CHART_LIST, CHARTS, chartFromParam, isChartId, type ChartId } from "@/lib/charts";
import { t as translate, type Locale } from "@/lib/i18n";

// The six graph views, named and explained from the registry.
//
// ONE component, used by /gallery and by the demo. The brief is explicit that the
// demo must not get a copy — "never a demo-specific copy, that recreates the
// drift this task exists to fix" — so the demo mounts this and passes a different
// heading, rather than owning a second list of six charts that would be correct
// on the day it was written and wrong a release later.
//
// Deep-linkable per chart, because a judge or a teammate needs to be able to send
// "look at this one" rather than "open the demo, tap More, tap Graph, tap the
// fourth tile". The selected chart lives in the URL hash: it survives a reload,
// it costs no navigation, and — unlike a query string — it does not need a server
// round trip, which matters because this page has to work from the static
// snapshot with the origin machine switched off.
//
// The figures are screenshots rather than live renderers, which is what the
// Gallery has always shown and what survives with no database behind it. Live
// rendering over the demo persona's own ledger is the better version and it waits
// on Task 7.5's seed data — see NEXT.md; the registry and this component are
// where it will drop in, because the names and explanations already come from
// one place.

export default function GraphShowcase({
  lang = "en",
  headingKey = "gallery.s1.title",
  bodyKey = "gallery.s1.body",
}: {
  lang?: Locale;
  headingKey?: string;
  bodyKey?: string;
}) {
  const tr = (k: string) => translate(lang, k);
  const [active, setActive] = useState<ChartId>(() => CHART_LIST[0].id);

  // Read the hash after mount, not during render: the server has no location,
  // and reading it in a useState initialiser produces a hydration mismatch that
  // React papers over by silently discarding the client value — so the deep link
  // would appear to work and then snap back to the default.
  useEffect(() => {
    const fromHash = () => {
      const raw = window.location.hash.replace(/^#chart=/, "");
      if (isChartId(raw)) setActive(raw);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  function select(id: ChartId) {
    setActive(id);
    // replaceState, not a hash assignment: assigning to location.hash pushes a
    // history entry, so Back would walk the user through every chart they looked
    // at instead of leaving the page.
    window.history.replaceState(null, "", `#chart=${id}`);
  }

  const meta = CHARTS[chartFromParam(active)];

  return (
    <section className="mt-8 min-w-0">
      <h2 className="text-base font-semibold">{tr(headingKey)}</h2>
      <p className="mt-1 text-sm text-zinc-500">{tr(bodyKey)}</p>

      {/* Scrolls rather than wraps at 375px: six wrapped chips push the figure
          below the fold on a phone, and the figure is the point of the page.
          `min-w-0` is load-bearing and not decoration. This row is a flex ITEM of
          the page's column layout, where `min-width` defaults to `auto` — the
          min-content width of six `shrink-0` chips, 583px. Without it the row
          refuses to be narrower than its contents, drags the whole document out
          to 512px at a 375px viewport, and the page scrolls sideways. The
          horizontal scroller alone does not prevent that; the row has to be
          allowed to be smaller than what is inside it first. */}
      <div className="mt-4 flex min-w-0 gap-2 overflow-x-auto pb-1 sm:flex-wrap">
        {CHART_LIST.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => select(c.id)}
            aria-pressed={active === c.id}
            title={tr(c.oneLineKey)}
            className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition ${
              active === c.id
                ? "border-amber-500 bg-amber-500 text-white"
                : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            <span aria-hidden>{c.icon}</span>
            {tr(c.nameKey)}
          </button>
        ))}
      </div>

      <figure className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {/* Plain <img>: next/image's optimizer is a server route, and this has to
            render identically from the static snapshot with no server at all.
            `key` forces a swap rather than letting the browser hold the previous
            decoded frame while the new one arrives. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={meta.id}
          src={`/gallery/${meta.shot}`}
          alt={tr(meta.headlineKey)}
          loading="lazy"
          decoding="async"
          className="w-full border-b border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
        />
        <figcaption className="p-4">
          <h3 className="text-sm font-semibold">{tr(meta.headlineKey)}</h3>
          {/* The explanation travels WITH the chart, not only in the Gallery.
              The brief singles out the Sankey: it is the default view and the
              least familiar diagram type to a general audience, and a user
              meeting it cold bounces off the app's strongest visualisation. */}
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{tr(meta.oneLineKey)}</p>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            {tr("chart.whenToUse")}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">{tr(meta.whenToUseKey)}</p>
        </figcaption>
      </figure>
    </section>
  );
}
