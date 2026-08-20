"use client";

// Dashboard: the year as a shape, then the buckets, then who logged what, then
// the rows themselves.
//
// The contributor split is the part worth pausing on. Every single-user
// budgeting app can draw a spend-by-category donut; almost none can answer "who
// in this household logged this, and what does each of us actually put in?"
// because they are built around one account holder. Two people writing into one
// ledger, each row tagged, is the thing to show off — so it gets its own block
// rather than a filter buried in settings.

import { useMemo, useState } from "react";
import type { DemoPersona, DemoTxn } from "@/lib/demoData";

type Tr = (k: string, vars?: Record<string, string | number>) => string;

const rm0 = (n: number) => `RM${Math.round(n).toLocaleString("en-MY")}`;
const rm2 = (n: number) => `RM${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TIER_COLOR: Record<number, string> = { 1: "#C94F4F", 2: "#248A54", 3: "#3E7BB6" };
const CONTRIB_COLOR = ["#E8A012", "#3E7BB6", "#8B5CF6", "#2E8B57"];

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const SOURCE_ICON: Record<string, string> = { text: "⌨️", voice: "🎤", receipt: "🧾", statement: "📄" };

// ── the year, as a shape ────────────────────────────────────────────────────

function MonthlyTrend({ ledger, tr }: { ledger: DemoTxn[]; tr: Tr }) {
  const months = useMemo(() => {
    const map = new Map<string, { label: string; total: number; biggest: DemoTxn | null }>();
    for (const t of ledger) {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const row = map.get(key) ?? { label: MONTH_ABBR[d.getMonth()], total: 0, biggest: null };
      row.total += t.amount;
      if (!row.biggest || t.amount > row.biggest.amount) row.biggest = t;
      map.set(key, row);
    }
    return [...map.entries()]
      .sort((a, b) => {
        const [ay, am] = a[0].split("-").map(Number);
        const [by, bm] = b[0].split("-").map(Number);
        return ay - by || am - bm;
      })
      .map(([, v]) => v);
  }, [ledger]);

  const max = Math.max(...months.map((m) => m.total), 1);
  const peak = months.reduce(
    (best, m) => (m.total > best.total ? m : best),
    months[0] ?? { label: "", total: 0, biggest: null },
  );
  // Name the actual reason the peak is the peak. An earlier version asserted
  // "that's Raya" for whatever month came out highest, which is wrong the
  // moment a household's road tax lands in a different month than Raya does.
  const because = peak.biggest
    ? tr("demo.dash.trend.because", {
        month: peak.label,
        vendor: peak.biggest.vendor,
        amount: rm0(peak.biggest.amount),
      })
    : "";

  return (
    <section>
      <h3 className="text-sm font-semibold">{tr("demo.dash.trend")}</h3>
      <p className="mt-1 text-xs text-zinc-500">{because}</p>
      <div className="mt-3 flex h-32 items-end gap-1.5" role="img" aria-label={tr("demo.dash.trend")}>
        {months.map((m, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-t ${m === peak ? "bg-amber-500" : "bg-zinc-400 dark:bg-zinc-600"}`}
              style={{ height: `${Math.max(3, (m.total / max) * 100)}%` }}
              title={`${m.label} · ${rm0(m.total)}`}
            />
            <span className="text-[9px] text-zinc-400">{m.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── buckets, by tier ────────────────────────────────────────────────────────

function BucketBreakdown({ persona, ledger, tr }: { persona: DemoPersona; ledger: DemoTxn[]; tr: Tr }) {
  const rows = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const spend = new Map<string, number>();
    for (const t of ledger) {
      const d = new Date(t.date);
      if (d.getFullYear() !== y || d.getMonth() !== m) continue;
      spend.set(t.bucketId, (spend.get(t.bucketId) ?? 0) + t.amount);
    }
    return persona.buckets
      .map((b) => ({ ...b, spent: spend.get(b.id) ?? 0 }))
      .sort((a, b) => a.tier - b.tier || b.spent - a.spent);
  }, [persona.buckets, ledger]);

  const max = Math.max(...rows.map((r) => r.spent), 1);

  return (
    <section className="mt-8">
      <h3 className="text-sm font-semibold">{tr("demo.dash.buckets")}</h3>
      <p className="mt-1 text-xs text-zinc-500">{tr("demo.dash.buckets.hint")}</p>
      <ul className="mt-3 space-y-2.5">
        {rows.map((b) => (
          <li key={b.id}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: TIER_COLOR[b.tier] }}
                  aria-hidden
                />
                <span className={b.private ? "font-medium" : ""}>{b.label}</span>
                {b.private && <span title={tr("demo.dash.private")} aria-label={tr("demo.dash.private")}>🔒</span>}
              </span>
              <span className="shrink-0 tabular-nums text-zinc-500">{rm0(b.spent)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full"
                style={{ width: `${(b.spent / max) * 100}%`, background: TIER_COLOR[b.tier] }}
              />
            </div>
            {b.cap ? (
              <p className="mt-0.5 text-[11px] text-zinc-400">
                {tr("demo.dash.cap", { cap: rm0(b.cap) })}
                {b.spent > b.cap ? ` · ${tr("demo.dash.overCap")}` : ""}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── who logged what — the differentiator ────────────────────────────────────

function ContributorSplit({ persona, ledger, tr }: { persona: DemoPersona; ledger: DemoTxn[]; tr: Tr }) {
  const split = useMemo(() => {
    const now = new Date();
    const totals = new Map<string, { amount: number; count: number }>();
    for (const t of ledger) {
      const d = new Date(t.date);
      if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) continue;
      const key = t.contributorId ?? "__household__";
      const row = totals.get(key) ?? { amount: 0, count: 0 };
      row.amount += t.amount;
      row.count += 1;
      totals.set(key, row);
    }
    return persona.contributors.map((c, i) => ({
      ...c,
      color: CONTRIB_COLOR[i % CONTRIB_COLOR.length],
      ...(totals.get(c.id) ?? { amount: 0, count: 0 }),
    }));
  }, [persona.contributors, ledger]);

  if (persona.contributors.length < 2) return null;

  const total = split.reduce((s, c) => s + c.amount, 0) || 1;

  return (
    <section className="mt-8">
      <h3 className="text-sm font-semibold">{tr("demo.dash.contributors")}</h3>
      <p className="mt-1 text-xs text-zinc-500">{tr("demo.dash.contributors.hint")}</p>

      <div className="mt-3 flex h-3 overflow-hidden rounded-full" role="img" aria-label={tr("demo.dash.contributors")}>
        {split.map((c) => (
          <div key={c.id} style={{ width: `${(c.amount / total) * 100}%`, background: c.color }} title={`${c.name} · ${rm0(c.amount)}`} />
        ))}
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-2">
        {split.map((c) => (
          <li key={c.id} className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: c.color }}
                aria-hidden
              >
                {c.initial}
              </span>
              <span className="text-sm font-medium">{c.name}</span>
            </div>
            <p className="mt-1.5 tabular-nums text-sm">{rm0(c.amount)}</p>
            <p className="text-[11px] text-zinc-400">
              {tr("demo.dash.entriesLogged", { n: c.count, pct: Math.round((c.amount / total) * 100) })}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── the rows, editable ──────────────────────────────────────────────────────

function History({
  persona,
  ledger,
  onDelete,
  tr,
}: {
  persona: DemoPersona;
  ledger: DemoTxn[];
  onDelete: (id: string) => void;
  tr: Tr;
}) {
  const [limit, setLimit] = useState(25);
  const bucketLabel = useMemo(
    () => new Map(persona.buckets.map((b) => [b.id, b.label])),
    [persona.buckets],
  );
  const who = useMemo(() => {
    const m = new Map<string, { name: string; initial: string; color: string }>();
    persona.contributors.forEach((c, i) =>
      m.set(c.id, { name: c.name, initial: c.initial, color: CONTRIB_COLOR[i % CONTRIB_COLOR.length] }),
    );
    return m;
  }, [persona.contributors]);

  const rows = ledger.slice(0, limit);

  return (
    <section className="mt-8">
      <h3 className="text-sm font-semibold">{tr("demo.dash.history")}</h3>
      <p className="mt-1 text-xs text-zinc-500">{tr("demo.dash.history.hint")}</p>
      <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
        {rows.map((t) => {
          const c = t.contributorId ? who.get(t.contributorId) : null;
          return (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <span className="w-9 shrink-0 text-center text-base" aria-hidden>
                {SOURCE_ICON[t.source] ?? "•"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.vendor}</p>
                <p className="truncate text-xs text-zinc-400">
                  {new Date(t.date).toLocaleDateString("en-MY", { day: "numeric", month: "short" })} ·{" "}
                  {bucketLabel.get(t.bucketId) ?? t.bucketId}
                  {t.recurrence === "annual" ? ` · ${tr("demo.dash.annual")}` : ""}
                </p>
              </div>
              {c ? (
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: c.color }}
                  title={tr("demo.dash.loggedBy", { name: c.name })}
                  aria-label={tr("demo.dash.loggedBy", { name: c.name })}
                >
                  {c.initial}
                </span>
              ) : (
                <span className="w-6 shrink-0" />
              )}
              <span className="shrink-0 tabular-nums text-sm">{rm2(t.amount)}</span>
              <button
                type="button"
                onClick={() => onDelete(t.id)}
                aria-label={tr("demo.dash.remove")}
                className="shrink-0 rounded-lg px-1.5 py-1 text-xs text-zinc-300 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      {limit < ledger.length && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + 50)}
          className="mt-3 w-full rounded-xl border border-zinc-200 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          {tr("demo.dash.more", { n: ledger.length - limit })}
        </button>
      )}
    </section>
  );
}

export default function DashboardView({
  persona,
  ledger,
  onDelete,
  tr,
}: {
  persona: DemoPersona;
  ledger: DemoTxn[];
  onDelete: (id: string) => void;
  tr: Tr;
}) {
  return (
    <div className="pb-4">
      <MonthlyTrend ledger={ledger} tr={tr} />
      <BucketBreakdown persona={persona} ledger={ledger} tr={tr} />
      <ContributorSplit persona={persona} ledger={ledger} tr={tr} />
      <History persona={persona} ledger={ledger} onDelete={onDelete} tr={tr} />
    </div>
  );
}
