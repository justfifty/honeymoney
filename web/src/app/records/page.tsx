import Link from "next/link";
import { isDatabaseConfigured, config } from "@/lib/config";
import { normalizeCurrency, fmtMoney } from "@/lib/format";
import {
  getSpendRecords,
  groupByPeriod,
  summarize,
  rangeBounds,
  type Period,
} from "@/lib/records";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import CurrencySwitcher from "../graph/CurrencySwitcher";

export const dynamic = "force-dynamic";

type Tr = (k: string, vars?: Record<string, string | number>) => string;

const PERIODS: { key: Period; labelKey: string; icon: string; nounKey: string }[] = [
  { key: "day", labelKey: "rec.period.day", icon: "📆", nounKey: "rec.noun.days" },
  { key: "week", labelKey: "rec.period.week", icon: "🗓️", nounKey: "rec.noun.weeks" },
  { key: "month", labelKey: "rec.period.month", icon: "📅", nounKey: "rec.noun.months" },
];

const RANGES: { key: string; labelKey: string }[] = [
  { key: "30d", labelKey: "rec.range.30d" },
  { key: "90d", labelKey: "rec.range.90d" },
  { key: "365d", labelKey: "rec.range.365d" },
  { key: "all", labelKey: "rec.range.all" },
];

function Notice({ tr, reason }: { tr: Tr; reason: string }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-8 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <h2 className="text-lg font-semibold">{tr("rec.notice.title")}</h2>
        <p className="mt-2 text-sm">{reason}</p>
        <p className="mt-4 text-xs opacity-80">
          {tr("rec.notice.hintBefore")} <code>npm run pb:start</code>{tr("rec.notice.hintAfter")}
        </p>
      </div>
    </main>
  );
}

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string; period?: string; range?: string; ccy?: string }>;
}) {
  const locale = await getLocale();
  const tr: Tr = (k, vars) => t(locale, k, vars);

  if (!isDatabaseConfigured()) {
    return <Notice tr={tr} reason={tr("rec.notice.notConfigured")} />;
  }

  const params = await searchParams;
  const tenantId = params.tenantId || config.demoTenantId;
  if (!tenantId) {
    return <Notice tr={tr} reason={tr("rec.notice.noTenant")} />;
  }

  const period: Period = PERIODS.some((p) => p.key === params.period)
    ? (params.period as Period)
    : "day";
  const range = RANGES.some((r) => r.key === params.range) ? params.range! : "90d";
  const ccy = normalizeCurrency(params.ccy);
  const money = (n: number) => fmtMoney(n, ccy);

  const q = (over: Partial<{ period: string; range: string }>) => {
    const sp = new URLSearchParams({ tenantId, period, range, ccy, ...over });
    return `/records?${sp.toString()}`;
  };

  try {
    const { from, to } = rangeBounds(range);
    const records = await getSpendRecords(tenantId, from, to);
    const groups = groupByPeriod(records, period);
    const s = summarize(groups);
    const maxTotal = Math.max(1, ...groups.map((g) => g.total));
    const activePeriod = PERIODS.find((p) => p.key === period)!;
    const activeRange = RANGES.find((r) => r.key === range)!;

    return (
      <main className="mx-auto min-h-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">🧾 {tr("rec.title")}</h1>
            <p className="text-sm text-zinc-500">
              {tr("rec.subtitle")} · {tr(activeRange.labelKey).toLowerCase()}
            </p>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <CurrencySwitcher current={ccy} />
            <Link href="/graph" className="text-zinc-500 hover:underline">🕸️ {tr("nav.graph")}</Link>
            <Link href="/dashboard" className="text-zinc-500 hover:underline">📊 {tr("nav.dashboard")}</Link>
            <Link href="/" className="text-zinc-500 hover:underline">← {tr("nav.home")}</Link>
          </nav>
        </header>

        {/* controls: period + range */}
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap gap-1.5">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={q({ period: p.key })}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p.key
                    ? "border-amber-500 bg-amber-500 text-white"
                    : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                }`}
              >
                {p.icon} {tr(p.labelKey)}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RANGES.map((r) => (
              <Link
                key={r.key}
                href={q({ range: r.key })}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  range === r.key
                    ? "border-zinc-800 bg-zinc-800 text-white dark:border-zinc-200 dark:bg-zinc-200 dark:text-zinc-900"
                    : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                }`}
              >
                {tr(r.labelKey)}
              </Link>
            ))}
          </div>
        </div>

        {/* summary */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={tr("rec.stat.totalSpent")} value={money(s.total)} tone="spend" />
          <Stat label={tr("rec.stat.transactions")} value={String(s.count)} />
          <Stat label={tr("rec.stat.withSpend", { noun: tr(activePeriod.nounKey) })} value={String(s.periods)} />
          <Stat
            label={tr("rec.stat.busiest", { period: tr(activePeriod.labelKey).toLowerCase() })}
            value={s.busiest ? money(s.busiest.total) : "—"}
            sub={s.busiest?.label}
          />
        </section>

        {ccy !== "MYR" && (
          <p className="mt-2 text-xs text-zinc-400">{tr("rec.rateNote")}</p>
        )}

        {/* schedule */}
        <section className="mt-6">
          {groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-700">
              <p className="text-3xl">🗓️</p>
              <p className="mt-2 text-sm font-medium">{tr("rec.emptyTitle")}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {tr("rec.emptyHint")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map((g, i) => {
                const pct = Math.round((g.total / maxTotal) * 100);
                return (
                  <details
                    key={g.key}
                    open={i === 0}
                    className="group overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                      <span className="text-xs text-zinc-400 transition-transform group-open:rotate-90">▶</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium">{g.label}</span>
                          <span className="whitespace-nowrap font-semibold">{money(g.total)}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                            <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="whitespace-nowrap text-xs text-zinc-400">
                            {g.count} {g.count === 1 ? tr("rec.txn") : tr("rec.txns")}
                          </span>
                        </div>
                      </div>
                    </summary>
                    <div className="border-t border-zinc-100 dark:border-zinc-800">
                      {g.records.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between border-b border-zinc-50 px-4 py-2.5 text-sm last:border-0 dark:border-zinc-800/60"
                        >
                          <div className="min-w-0">
                            <span className="font-medium">{t.vendor ?? tr("rec.unknownVendor")}</span>
                            <span className="ml-2 text-xs text-zinc-400">{stamp(t.occurred_at)}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {t.source && (
                              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
                                {t.source}
                              </span>
                            )}
                            <span className="font-medium">{money(t.amount)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </section>

        <p className="mt-8 max-w-2xl text-xs text-zinc-500">
          {tr("rec.footer")}
        </p>
      </main>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return <Notice tr={tr} reason={tr("rec.notice.loadError", { message })} />;
  }
}

function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-MY", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "spend";
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-3 dark:bg-zinc-900 ${
        tone === "spend" ? "border-rose-300 dark:border-rose-900" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-zinc-400">{sub}</div>}
    </div>
  );
}
