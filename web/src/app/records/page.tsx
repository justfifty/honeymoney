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
import CurrencySwitcher from "../graph/CurrencySwitcher";

export const dynamic = "force-dynamic";

const PERIODS: { key: Period; label: string; icon: string; noun: string }[] = [
  { key: "day", label: "Day", icon: "📆", noun: "Days" },
  { key: "week", label: "Week", icon: "🗓️", noun: "Weeks" },
  { key: "month", label: "Month", icon: "📅", noun: "Months" },
];

const RANGES: { key: string; label: string }[] = [
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "365d", label: "12 months" },
  { key: "all", label: "All time" },
];

function Notice({ reason }: { reason: string }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-8 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <h2 className="text-lg font-semibold">Records unavailable</h2>
        <p className="mt-2 text-sm">{reason}</p>
        <p className="mt-4 text-xs opacity-80">
          Start PocketBase with <code>npm run pb:start</code>, then reload.
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
  if (!isDatabaseConfigured()) {
    return <Notice reason="PocketBase isn't configured, so there are no records to show." />;
  }

  const params = await searchParams;
  const tenantId = params.tenantId || config.demoTenantId;
  if (!tenantId) {
    return <Notice reason="Set DEMO_TENANT_ID in web/.env.local (the demo household is hhrahman1111111)." />;
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
    const periodNoun = PERIODS.find((p) => p.key === period)!.noun;

    return (
      <main className="mx-auto min-h-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">🧾 Spending records</h1>
            <p className="text-sm text-zinc-500">
              Time-schedule audit · {RANGES.find((r) => r.key === range)!.label.toLowerCase()}
            </p>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <CurrencySwitcher current={ccy} />
            <Link href="/graph" className="text-zinc-500 hover:underline">🕸️ Graph</Link>
            <Link href="/dashboard" className="text-zinc-500 hover:underline">📊 Dashboard</Link>
            <Link href="/" className="text-zinc-500 hover:underline">← Home</Link>
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
                {p.icon} {p.label}
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
                {r.label}
              </Link>
            ))}
          </div>
        </div>

        {/* summary */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total spent" value={money(s.total)} tone="spend" />
          <Stat label="Transactions" value={String(s.count)} />
          <Stat label={`${periodNoun} with spend`} value={String(s.periods)} />
          <Stat
            label={`Busiest ${period}`}
            value={s.busiest ? money(s.busiest.total) : "—"}
            sub={s.busiest?.label}
          />
        </section>

        {ccy !== "MYR" && (
          <p className="mt-2 text-xs text-zinc-400">≈ converted from MYR at an indicative rate.</p>
        )}

        {/* schedule */}
        <section className="mt-6">
          {groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-700">
              <p className="text-3xl">🗓️</p>
              <p className="mt-2 text-sm font-medium">No spending in this window.</p>
              <p className="mt-1 text-xs text-zinc-500">
                Try a wider range, or capture a spend from the dashboard or graph.
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
                            {g.count} {g.count === 1 ? "txn" : "txns"}
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
                            <span className="font-medium">{t.vendor ?? "Unknown"}</span>
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
          Every ringgit, on a timeline — group by day, week or month to audit spending velocity.
          This is a read-only view over the same graph the dashboard and Honey reason about.
        </p>
      </main>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return <Notice reason={`Could not load records: ${message}`} />;
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
