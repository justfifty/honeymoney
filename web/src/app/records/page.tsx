import Link from "next/link";
import { isDatabaseConfigured } from "@/lib/config";
import { normalizeCurrency, fmtMoney } from "@/lib/format";
import {
  getSpendRecords,
  groupByPeriod,
  summarize,
  rangeBounds,
  type Period,
} from "@/lib/records";
import { can, resolveViewTenant } from "@/lib/household";
import { pbList, pbStr } from "@/lib/pocketbase";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import CurrencySwitcher from "../graph/CurrencySwitcher";
import RecordRow from "./RecordRow";
import RatesNote from "../RatesNote";
import LocalOverlay from "../LocalOverlay";

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

/**
 * Wraps whatever the page renders with the local overlay.
 *
 * Outside the try/catch on purpose: the records page builds its entire <main>
 * inside one, and the unsynced-records notice must show even when the body
 * below it is the database-unavailable message — that is precisely the moment
 * somebody has records on their phone and no server to compare them against.
 */
function WithLocal({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6">
        <LocalOverlay where="this list" />
      </div>
      {children}
    </>
  );
}

export default async function RecordsPage(props: {
  searchParams: Promise<{ period?: string; range?: string; ccy?: string; voided?: string }>;
}) {
  return (
    <WithLocal>
      <RecordsBody {...props} />
    </WithLocal>
  );
}

async function RecordsBody({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; range?: string; ccy?: string; voided?: string }>;
}) {
  const locale = await getLocale();
  const tr: Tr = (k, vars) => t(locale, k, vars);

  if (!isDatabaseConfigured()) {
    return <Notice tr={tr} reason={tr("rec.notice.notConfigured")} />;
  }

  const params = await searchParams;
  // Signed in → your household. Signed out → the public demo, read-only.
  const { tenantId, ctx, isDemo } = await resolveViewTenant();
  if (!tenantId) {
    return <Notice tr={tr} reason={tr("rec.notice.noTenant")} />;
  }
  const canEdit = Boolean(ctx) && can(ctx!.accessRole, "edit_any_record");
  const canVoid = Boolean(ctx) && can(ctx!.accessRole, "void_record");

  const period: Period = PERIODS.some((p) => p.key === params.period)
    ? (params.period as Period)
    : "day";
  const range = RANGES.some((r) => r.key === params.range) ? params.range! : "90d";
  const ccy = normalizeCurrency(params.ccy);
  const showVoided = params.voided === "1";
  const money = (n: number) => fmtMoney(n, ccy);

  const q = (over: Partial<{ period: string; range: string; voided: string }>) => {
    const sp = new URLSearchParams({ period, range, ccy, ...(showVoided ? { voided: "1" } : {}), ...over });
    return `/records?${sp.toString()}`;
  };

  try {
    const { from, to } = rangeBounds(range);
    const [records, bucketNodes] = await Promise.all([
      getSpendRecords(tenantId, from, to, {
        includeVoided: showVoided,
        viewerMemberId: ctx?.memberId,
        redact: !isDemo,
      }),
      pbList<{ id: string; label: string }>("nodes", {
        filter: `tenant = ${pbStr(tenantId)} && kind = 'bucket'`,
        sort: "created",
      }),
    ]);
    const buckets = bucketNodes.map((b) => ({ id: b.id, label: b.label }));
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
          {/* Graph and Dashboard used to sit here and were removed: both are now
              permanent tabs in the header and the bottom bar, so repeating them
              in a page header is a second copy of a control that is already on
              screen. Home stays — it is the one destination the tab bar does not
              carry — and so does the currency switcher, which is page state
              rather than navigation. */}
          <nav className="flex items-center gap-3 text-sm">
            <CurrencySwitcher current={ccy} />
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

          {/* Removed records are never gone — this just brings them back into
              view, struck through, so you can see (and undo) what was deleted. */}
          <Link
            href={q({ voided: showVoided ? "" : "1" })}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              showVoided
                ? "border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
                : "border-zinc-300 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            🗑️ {tr("rec.void.show")}
          </Link>

          {ctx && (
            <Link href="/ledger" className="text-xs text-zinc-500 hover:underline">
              🔗 {tr("nav.ledger")}
            </Link>
          )}
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
                      {g.records.map((rec) => (
                        <RecordRow
                          key={rec.id}
                          record={rec}
                          buckets={buckets}
                          canEdit={canEdit}
                          canVoid={canVoid}
                          ccy={ccy}
                          lang={locale}
                        />
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </section>

        <RatesNote ccy={ccy} />

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
