"use client";

// Browsing the product directory, reachable from More rather than from a score.
//
// WHY THIS EXISTS AT ALL. The app already told people it did: Honey's own
// decline for a product question reads "There's a directory of licensed
// Malaysian providers under More › Directory" (`ask.decline.routed`), and no
// such entry existed. The catalogue was reachable only by tapping a goal on the
// H-Score screen, so the one sentence that routed a regulated question
// somewhere useful routed it nowhere.
//
// WHY THIS DOES NOT BREAK THE COMPLIANCE POSITION. The rule in
// hscore/HScoreView.tsx is that the directory must not sit downstream of a
// SCORE — "here is a product" has to follow "here is what you're trying to
// fix", not "here is how you rate". Browsing from More is downstream of
// neither: this component never sees a score, a band or a household, and
// `getListings(category, sort)` still refuses to accept one. Sorting stays
// alphabetical/by-provider. There is deliberately no search box: a relevance
// ranking IS a recommendation, and a recommendation is the licensed act.

import { useCallback, useEffect, useState } from "react";
import { t as translate, type Locale } from "@/lib/i18n";
import { CATEGORIES, DISCLAIMER_KEY, REGISTRY_LINKS, getListings } from "@/lib/directory";
import DirectoryView from "../hscore/DirectoryView";

export default function DirectoryBrowser({ lang }: { lang: Locale }) {
  const tr = useCallback(
    (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars),
    [lang],
  );
  const [category, setCategory] = useState<string | null>(null);

  // ?cat=deposits opens a category directly, the same addressing /graph and
  // /demo use. Set in an effect, not in the initialiser: this page is rendered
  // on the server and reading location during the first client render would
  // hydrate into a mismatch.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("cat");
    if (c && CATEGORIES.some((x) => x.key === c)) setCategory(c);
  }, []);

  if (category) return <DirectoryView category={category} onBack={() => setCategory(null)} tr={tr} />;

  return (
    <div className="pb-4">
      <p className="text-sm leading-relaxed text-zinc-500">{tr("dir.browse.intro")}</p>

      <ul className="mt-5 space-y-2">
        {CATEGORIES.map((c) => {
          // Counted here rather than hard-coded so an empty category reads as
          // empty instead of promising a page with nothing on it.
          const n = getListings(c.key).length;
          return (
            <li key={c.key}>
              <button
                type="button"
                onClick={() => setCategory(c.key)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-zinc-200 px-4 py-3 text-left text-sm transition hover:border-amber-400 hover:bg-amber-50/50 dark:border-zinc-800 dark:hover:border-amber-600 dark:hover:bg-amber-950/20"
              >
                <span className="font-medium">{tr(c.labelKey)}</span>
                <span className="shrink-0 text-xs tabular-nums text-zinc-400">{n}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* The registers a user can check us against. Linked, not summarised:
          the point is that the verification does not go through us. */}
      <ul className="mt-6 space-y-1 text-xs">
        {REGISTRY_LINKS.map((r) => (
          <li key={r.url}>
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-600 hover:underline"
            >
              {tr(r.labelKey)} ↗
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-[11px] leading-relaxed text-zinc-500">{tr(DISCLAIMER_KEY)}</p>
    </div>
  );
}
