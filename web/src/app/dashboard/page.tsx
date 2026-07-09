import Link from "next/link";
import { isDatabaseConfigured, config } from "@/lib/config";
import { getBucketProjection, getRecentSpend, getHoneyInsight } from "@/lib/projection";
import { rm, shortDate, STATUS_STYLE } from "@/lib/format";
import AddTransaction from "./AddTransaction";

export const dynamic = "force-dynamic";

function SetupNotice({ reason }: { reason: string }) {
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-amber-300 bg-amber-50 p-8 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <h2 className="text-lg font-semibold">Almost there — finish setup</h2>
      <p className="mt-2 text-sm">{reason}</p>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
        <li>Download PocketBase: <code>npm run pb:download</code> (from <code>web/</code>).</li>
        <li>Start it: <code>npm run pb:start</code> — schema + demo data load automatically.</li>
        <li>Copy <code>.env.example</code> → <code>web/.env.local</code> (defaults already match).</li>
        <li>Restart <code>npm run dev</code>.</li>
      </ol>
      <p className="mt-4 text-xs opacity-80">See PLAN.md §8–9 for the full walkthrough.</p>
    </div>
  );
}

export default async function Dashboard() {
  if (!isDatabaseConfigured()) {
    return (
      <main className="min-h-full px-6 py-16">
        <SetupNotice reason="PocketBase isn't configured yet, so there's no household graph to show." />
      </main>
    );
  }
  if (!config.demoTenantId) {
    return (
      <main className="min-h-full px-6 py-16">
        <SetupNotice reason="Set DEMO_TENANT_ID in web/.env.local (the demo household is hhrahman1111111)." />
      </main>
    );
  }

  try {
    const tenantId = config.demoTenantId;
    const [projection, recent] = await Promise.all([
      getBucketProjection(tenantId),
      getRecentSpend(tenantId, 8),
    ]);
    const insight = await getHoneyInsight(projection);

    const totalAllocated = projection.reduce((s, b) => s + b.allocated, 0);
    const totalProjected = projection.reduce((s, b) => s + b.projected_spend, 0);

    return (
      <main className="mx-auto min-h-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">🍯 HoneyMoney</h1>
            <p className="text-sm text-zinc-500">The Rahman Household · this month</p>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link href="/graph" className="text-amber-600 hover:underline">🕸️ Graph</Link>
            <Link href="/guide" className="text-zinc-500 hover:underline">ℹ️ Guide</Link>
            <Link href="/" className="text-zinc-500 hover:underline">← Home</Link>
          </nav>
        </header>

        {/* Honey insight */}
        <section className="mt-8 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-6 text-white shadow-lg">
          <div className="flex items-center gap-2 text-sm font-medium opacity-90">
            <span>Honey says</span>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
              {insight.source === "gemini" ? "AI" : "insight"}
            </span>
          </div>
          <p className="mt-2 text-lg leading-relaxed">{insight.text}</p>
        </section>

        {/* Summary */}
        <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Allocated / mo" value={rm(totalAllocated)} />
          <Stat label="Projected spend" value={rm(totalProjected)} />
          <Stat
            label="Projected balance"
            value={rm(totalAllocated - totalProjected)}
            good={totalAllocated - totalProjected >= 0}
          />
        </section>

        {/* Buckets */}
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Buckets
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {projection.map((b) => {
              const style = STATUS_STYLE[b.status] ?? STATUS_STYLE.unfunded;
              const pct =
                b.allocated > 0
                  ? Math.min(100, Math.round((b.projected_spend / b.allocated) * 100))
                  : 0;
              return (
                <div
                  key={b.bucket_id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{b.bucket_label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.cls}`}>
                      {style.label}
                    </span>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className={`h-full ${b.status === "over_budget" ? "bg-rose-500" : b.status === "at_risk" ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-zinc-500">
                    <span>proj {rm(b.projected_spend)}</span>
                    <span>of {rm(b.allocated)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Manual input */}
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Add a spend
          </h2>
          <AddTransaction
            tenantId={tenantId}
            buckets={projection.map((b) => ({ id: b.bucket_id, label: b.bucket_label }))}
          />
        </section>

        {/* Recent spend */}
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Recent (auto-captured)
          </h2>
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            {recent.length === 0 && (
              <p className="p-4 text-sm text-zinc-500">
                No transactions yet — forward a screenshot to the Telegram bot.
              </p>
            )}
            {recent.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 text-sm last:border-0 dark:border-zinc-800"
              >
                <div>
                  <span className="font-medium">{t.vendor ?? "Unknown"}</span>
                  <span className="ml-2 text-xs text-zinc-400">{shortDate(t.occurred_at)}</span>
                </div>
                <div className="flex items-center gap-3">
                  {t.source && (
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
                      {t.source}
                    </span>
                  )}
                  <span className="font-medium">{rm(t.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <main className="min-h-full px-6 py-16">
        <SetupNotice reason={`Could not load the household graph: ${message}`} />
      </main>
    );
  }
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500">{label}</div>
      <div
        className={`mt-1 text-lg font-semibold ${good === false ? "text-rose-600 dark:text-rose-400" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
