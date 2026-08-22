"use client";

// The public demo. No login, no shared credentials, no backend.
//
// The entire dataset is generated in this browser tab on first render and lives
// in React state. That is what makes an unauthenticated public demo safe: there
// is no server-side state for a visitor to corrupt for the next visitor, and no
// account for anyone to guess into. Edits are real — add a spend, delete a row,
// watch the score move — but they are session-local and gone on reload, which
// is stated on screen rather than discovered.
//
// It also means the demo works with the network unplugged, which is the
// difference between a pitch that survives a bad conference wifi and one that
// doesn't.

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { t as translate, type Locale } from "@/lib/i18n";
import {
  buildAllPersonas,
  scoreFor,
  PERSONA_ORDER,
  type DemoTxn,
  type PersonaKey,
} from "@/lib/demoData";
import { describeMovement, savingsGapToNextBand } from "@/lib/hscore";
import HScoreView from "../hscore/HScoreView";
import DashboardView from "./DashboardView";
import RecordView from "./RecordView";
import GraphShowcase from "../GraphShowcase";

type Tab = "record" | "dashboard" | "hscore" | "more";

const TABS: { key: Tab; icon: string }[] = [
  { key: "record", icon: "✍️" },
  { key: "dashboard", icon: "📊" },
  { key: "hscore", icon: "💛" },
  { key: "more", icon: "⋯" },
];

/** Edits are keyed per persona so switching households doesn't lose your work. */
type Edits = Partial<Record<PersonaKey, { added: DemoTxn[]; removed: Set<string> }>>;

export default function DemoApp({ lang }: { lang: Locale }) {
  const tr = useCallback(
    (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars),
    [lang],
  );

  // Built once per mount. `asOf` is frozen at mount so the ledger can't shift
  // under the user mid-session if the tab is left open across midnight.
  const [asOf] = useState(() => new Date());
  const personas = useMemo(() => buildAllPersonas(asOf), [asOf]);

  const [active, setActive] = useState<PersonaKey>("couple");
  const [tab, setTab] = useState<Tab>("hscore");
  const [edits, setEdits] = useState<Edits>({});

  const persona = personas[active];
  const edit = edits[active];

  const ledger = useMemo(() => {
    const base = edit?.removed ? persona.ledger.filter((t) => !edit.removed.has(t.id)) : persona.ledger;
    const all = edit?.added?.length ? [...edit.added, ...base] : base;
    return [...all].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [persona.ledger, edit]);

  const live = useMemo(() => ({ ...persona, ledger }), [persona, ledger]);

  const { hscore, inputs } = useMemo(() => scoreFor(live, asOf), [live, asOf]);

  // The "previous" for the movement sentence is this household a month ago, read
  // off the same ledger — derived, not invented, so the statement is auditable.
  const movement = useMemo(() => {
    const monthAgo = new Date(asOf.getFullYear(), asOf.getMonth() - 1, asOf.getDate());
    return describeMovement(hscore, scoreFor(live, monthAgo).hscore);
  }, [hscore, live, asOf]);

  const savingsGap = useMemo(() => savingsGapToNextBand(inputs, hscore.score), [inputs, hscore.score]);

  const streakMonths = useMemo(() => {
    const seen = new Set(ledger.map((t) => new Date(t.date).toISOString().slice(0, 7)));
    let n = 0;
    for (let i = 0; i < 24; i++) {
      const d = new Date(asOf.getFullYear(), asOf.getMonth() - i, 1);
      if (!seen.has(d.toISOString().slice(0, 7))) break;
      n++;
    }
    return n;
  }, [ledger, asOf]);

  const addTxn = useCallback(
    (t: DemoTxn) =>
      setEdits((e) => {
        const cur = e[active] ?? { added: [], removed: new Set<string>() };
        return { ...e, [active]: { ...cur, added: [t, ...cur.added] } };
      }),
    [active],
  );

  const removeTxn = useCallback(
    (id: string) =>
      setEdits((e) => {
        const cur = e[active] ?? { added: [], removed: new Set<string>() };
        const removed = new Set(cur.removed);
        removed.add(id);
        return { ...e, [active]: { added: cur.added.filter((t) => t.id !== id), removed } };
      }),
    [active],
  );

  const resetPersona = useCallback(() => setEdits((e) => ({ ...e, [active]: undefined })), [active]);
  const dirty = Boolean(edit && (edit.added.length || edit.removed.size));

  // `w-full` below is a fix, not a style nit. `mx-auto` on a flex item in a
  // COLUMN parent suppresses cross-axis stretch, so this column was sized to
  // fit-content — which takes the max of its min-content width, and any
  // horizontally-scrolling child drives that up. max-w-lg then capped the
  // blow-out at exactly 512px, which is why a 375px phone scrolled sideways by
  // 137px regardless of what was actually too wide. `w-full` gives it a definite
  // width to resolve against, and max-w-lg goes back to being a cap rather than
  // a target. min-w-0 alone does NOT fix it — the size was never coming from the
  // automatic minimum.
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full min-w-0 max-w-lg flex-col px-4 pb-24 pt-4">
      {/* ── persona switcher ─────────────────────────────────────────────── */}
      <header>
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="font-display text-xl font-semibold tracking-tight">{tr("demo.title")}</h1>
          <Link href="/" className="text-xs text-amber-600 hover:underline">
            {tr("demo.exit")}
          </Link>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{tr("demo.subtitle")}</p>

        <div className="mt-3">
          <div className="grid grid-cols-2 gap-2">
            {PERSONA_ORDER.map((key) => {
              const p = personas[key];
              const on = key === active;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActive(key)}
                  aria-pressed={on}
                  className={`rounded-2xl border px-3 py-2 text-left transition ${
                    on
                      ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
                      : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <span aria-hidden>{p.emoji}</span>
                    {tr(p.nameKey)}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-zinc-500">
                    {tr(`hscore.band.${p.targetBand}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <p className="mt-2 text-xs text-zinc-500">{tr(persona.blurbKey)}</p>

        {dirty && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-zinc-100 px-3 py-2 text-xs dark:bg-zinc-800">
            <span className="text-zinc-500">{tr("demo.edited")}</span>
            <button type="button" onClick={resetPersona} className="font-medium text-amber-600 hover:underline">
              {tr("demo.reset")}
            </button>
          </div>
        )}
      </header>

      {/* `min-w-0` is load-bearing. This <main> is a flex item of the column
          layout above, so its min-width defaults to `auto` — the min-content
          width of whatever is inside it. Any horizontally-scrolling child (the
          chart switcher, a wide table) then cannot be narrower than its own
          contents, and drags the whole document sideways instead of scrolling
          within itself. The Dashboard tab was already doing this at 375px
          before the Graph Showcase existed; the showcase only made it obvious.
          min-w-0 on the child does nothing while the flex ITEM refuses to
          shrink — it has to go here. */}
      <main className="mt-5 min-w-0 flex-1">
        {tab === "record" && (
          <RecordView persona={live} onAdd={addTxn} tr={tr} />
        )}
        {tab === "dashboard" && (
          <DashboardView persona={live} ledger={ledger} onDelete={removeTxn} tr={tr} />
        )}
        {tab === "hscore" && (
          <HScoreView
            hscore={hscore}
            movement={movement}
            savingsGap={savingsGap}
            inputs={inputs}
            streakMonths={streakMonths}
            tr={tr}
          />
        )}
        {tab === "more" && <More tr={tr} lang={lang} />}
      </main>

      {/* ── bottom tabs. No horizontal swipe: it collides with chart pan and
             with swipe-to-delete on the ledger rows. ──────────────────────── */}
      <nav
        aria-label={tr("demo.tabs")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
      >
        <div className="mx-auto flex max-w-lg">
          {TABS.map((t) => {
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={on ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
                  on ? "text-amber-600 dark:text-amber-400" : "text-zinc-400"
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {t.icon}
                </span>
                {tr(`demo.tab.${t.key}`)}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function More({
  tr,
  lang,
}: {
  tr: (k: string, v?: Record<string, string | number>) => string;
  lang: Locale;
}) {
  const items: { key: string; href?: string }[] = [
    { key: "guide", href: "/guide" },
    { key: "gallery", href: "/gallery" },
    { key: "graph", href: "/graph" },
    { key: "signup", href: "/signup" },
  ];
  return (
    <div className="pb-4">
      <h2 className="font-display text-lg font-semibold">{tr("demo.more.title")}</h2>
      <p className="mt-1 text-sm text-zinc-500">{tr("demo.more.body")}</p>
      <ul className="mt-4 space-y-2">
        {items.map((i) => (
          <li key={i.key}>
            <Link
              href={i.href ?? "#"}
              className="flex items-center justify-between rounded-2xl border border-zinc-200 px-4 py-3 text-sm hover:border-amber-400 hover:bg-amber-50/50 dark:border-zinc-800 dark:hover:border-amber-600 dark:hover:bg-amber-950/20"
            >
              {tr(`demo.more.${i.key}`)}
              <span aria-hidden className="text-zinc-400">›</span>
            </Link>
          </li>
        ))}
      </ul>
      {/* The Graph Showcase the demo was missing entirely. Same component the
          Gallery uses, same registry — a visitor can see all six views and read
          what each is for without an account, and link to one directly. */}
      <GraphShowcase lang={lang} headingKey="demo.graph.title" bodyKey="demo.graph.body" />

      <p className="mt-6 text-xs leading-relaxed text-zinc-400">{tr("demo.more.privacy")}</p>
    </div>
  );
}
