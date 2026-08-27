import Link from "next/link";
import { isDatabaseConfigured } from "@/lib/config";
import { getBucketProjection, getHoneyInsight } from "@/lib/projection";
import { getSpendRecords } from "@/lib/records";
import { detectRecurring } from "@/lib/radar";
import { can, resolveViewTenant } from "@/lib/household";
import { pbList, pbStr } from "@/lib/pocketbase";
import { rm, shortDate, STATUS_STYLE } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { t, type Locale } from "@/lib/i18n";
import { dataLabel } from "@/lib/dataLabels";
import RecordRow from "../records/RecordRow";
import PrivacyToggle from "./PrivacyToggle";
import HoneyAsk from "./HoneyAsk";
import LocalOverlay from "../LocalOverlay";

export const dynamic = "force-dynamic";

// How many editable rows the Dashboard shows before handing off to /records.
// The whole month is 30+ rows, which turned this page into a 10,000px scroll and
// buried everything under it — a view screen should end, not continue.
const RECENT_ROWS = 8;

function SetupNotice({ reason, lang }: { reason: string; lang: Locale }) {
  const tr = (k: string) => t(lang, k);
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-amber-300 bg-amber-50 p-8 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <h2 className="text-lg font-semibold">{tr("dash.setup.title")}</h2>
      <p className="mt-2 text-sm">{reason}</p>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
        <li>{tr("dash.setup.step1")} <code>npm run pb:download</code> ({tr("dash.setup.from")} <code>web/</code>).</li>
        <li>{tr("dash.setup.step2")} <code>npm run pb:start</code> {tr("dash.setup.step2tail")}</li>
        <li>{tr("dash.setup.step3")} <code>.env.example</code> → <code>web/.env.local</code> {tr("dash.setup.step3tail")}</li>
        <li>{tr("dash.setup.step4")} <code>npm run dev</code>.</li>
      </ol>
      <p className="mt-4 text-xs opacity-80">{tr("dash.setup.footer")}</p>
    </div>
  );
}

export default async function Dashboard() {
  const locale = await getLocale();
  const tr = (k: string, vars?: Record<string, string | number>) => t(locale, k, vars);

  if (!isDatabaseConfigured()) {
    return (
      <main className="min-h-full px-6 py-16">
      <LocalOverlay where="the dashboard" />
        <SetupNotice reason={tr("dash.setup.reasonNoDb")} lang={locale} />
      </main>
    );
  }
  // Signed in → your own household. Signed out → the public demo, read-only.
  const { tenantId, ctx, isDemo } = await resolveViewTenant();
  const canWrite = Boolean(ctx) && can(ctx!.accessRole, "add_record");

  if (!tenantId) {
    return (
      <main className="min-h-full px-6 py-16">
        <SetupNotice reason={tr("dash.setup.reasonNoTenant")} lang={locale} />
      </main>
    );
  }

  try {
    // The editable rows need the full SpendRecord shape (bucket, member, voided
    // state), not the trimmed recent-spend projection — RecordRow edits real
    // records, so it has to be handed real records.
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [projection, editable, radar, bucketNodes] = await Promise.all([
      getBucketProjection(tenantId),
      getSpendRecords(tenantId, monthStart, new Date(), {
        viewerMemberId: ctx?.memberId,
        redact: Boolean(ctx),
      }),
      detectRecurring(tenantId),
      pbList<{ id: string; label: string }>("nodes", {
        filter: `tenant = ${pbStr(tenantId)} && kind = 'bucket'`,
        sort: "created",
      }),
    ]);
    const bucketOptions = bucketNodes.map((b) => ({ id: b.id, label: dataLabel(locale, b.label) }));
    const insight = await getHoneyInsight(projection, locale);

    const totalAllocated = projection.reduce((s, b) => s + b.allocated, 0);
    const totalProjected = projection.reduce((s, b) => s + b.projected_spend, 0);

    return (
      <main className="mx-auto min-h-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Stacks on a phone. As one row it was wider than a 390px viewport —
            the four nav links don't wrap — which pushed the whole document into
            horizontal scroll and clipped every card below it off the right edge. */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          {/* The visible title block is gone, and what it said is why: an <h1>
              reading "HoneyMoney" under a header that already carries the
              wordmark, above a bottom bar already showing Dashboard as the
              active tab. Three statements of where you are, on a 390px screen
              where the first real number sat below the fold.

              The heading itself stays for screen readers and the document
              outline — removing the h1 outright would leave the page with no
              heading at all, which is a worse trade than a little duplication. */}
          <h1 className="sr-only">{tr("dash.subtitle")}</h1>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <PrivacyToggle hideLabel={tr("dash.privacy.hide")} showLabel={tr("dash.privacy.show")} />
            {/* The in-page Graph shortcut that used to sit here is gone: Graph
                is now a first-class tab beside Dashboard in both the header and
                the bottom bar, so a link here would duplicate a control that is
                permanently on screen. The empty-buckets state further down still
                links to the graph, because there the point is not navigation —
                it is "you have no buckets yet, here is where you build them". */}
          </div>
        </header>


        {/* Capture lives at /record — the default landing, the first tab, and
            permanently on the bottom bar. This page views and edits what already
            exists.

            There used to be an "Add a spend" button here as well, directly under
            a comment saying capture "has one front door, not two". It was the
            second one, and it pushed the household's actual figures below the
            fold on a phone to offer a tap that was already on screen. A viewer
            who cannot write still gets the note below, because that explains
            something they cannot otherwise work out. */}
        {canWrite ? null : (
          <p className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            {isDemo ? (
              <>
                {tr("demo.readOnly")}{" "}
                <Link href="/signup" className="font-medium text-amber-600 hover:underline">
                  {tr("demo.createHousehold")}
                </Link>
              </>
            ) : (
              tr("role.readOnly")
            )}
          </p>
        )}

        {/* Summary */}
        <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label={tr("dash.stat.allocated")} value={rm(totalAllocated)} />
          <Stat label={tr("dash.stat.projectedSpend")} value={rm(totalProjected)} />
          <Stat
            label={tr("dash.stat.projectedBalance")}
            value={rm(totalAllocated - totalProjected)}
            good={totalAllocated - totalProjected >= 0}
          />
        </section>

        {/* Buckets */}
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {tr("dash.buckets")}
          </h2>
          {projection.length === 0 && (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-center">
              <p className="font-medium text-amber-900">{tr("dash.bucketsEmpty.title")}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-amber-800/80">{tr("dash.bucketsEmpty.body")}</p>
              <Link href="/graph" className="mt-4 inline-block rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-600">
                🕸️ {tr("dash.bucketsEmpty.cta")}
              </Link>
            </div>
          )}
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
                    <span className="font-medium">{dataLabel(locale, b.bucket_label)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.cls}`}>
                      {tr(`status.${b.status}`)}
                    </span>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className={`h-full ${b.status === "over_budget" ? "bg-rose-500" : b.status === "at_risk" ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-zinc-500">
                    <span>{tr("dash.proj")} <span className="hm-money">{rm(b.projected_spend)}</span></span>
                    <span>{tr("dash.of")} <span className="hm-money">{rm(b.allocated)}</span></span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Subscription & bill radar */}
        {radar.items.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 flex flex-wrap items-center gap-x-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              🔁 {tr("dash.radar.title")}
              <span className="normal-case text-zinc-400">
                · <span className="hm-money">{rm(radar.monthlyTotal)}</span>/{tr("dash.radar.mo")}
              </span>
            </h2>
            <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              {radar.items.slice(0, 8).map((r) => (
                <div
                  key={r.vendor}
                  className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 text-sm last:border-0 dark:border-zinc-800"
                >
                  <div>
                    <span className="font-medium">{r.vendor}</span>
                    <span className="ml-2 text-xs text-zinc-400">
                      {tr("dash.radar.every", { n: r.cadenceDays })} · {tr("dash.radar.next")} {shortDate(r.nextLikely)}
                    </span>
                  </div>
                  <span className="hm-money font-medium">{rm(r.amount)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent entries — VIEW AND EDIT.
            These were read-only rows, so the one screen a user actually looks at
            could show them a mis-parsed amount and offer nothing to do about it
            but navigate elsewhere and find it again. RecordRow is the same
            component /records uses: inline edit, remove/restore, and a per-entry
            history. Reused rather than reimplemented, so the two can't drift. */}
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {tr("dash.recent")}
            </h2>
            <Link href="/records" className="text-xs text-amber-600 hover:underline">
              {editable.length > RECENT_ROWS
                ? tr("dash.recentMore", { n: editable.length - RECENT_ROWS })
                : tr("rec.seeAll")}{" "}
              →
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            {/* An empty list is a capture surface, not a full stop — it says what
                to do and puts the control one tap away. */}
            {editable.length === 0 && (
              <div className="p-4 text-sm text-zinc-500">
                <p>{tr("dash.recentEmpty")}</p>
                {canWrite && (
                  <Link
                    href="/record"
                    className="mt-3 inline-flex min-h-11 items-center rounded-full bg-amber-600 px-4 text-xs font-semibold text-white hover:bg-amber-700"
                  >
                    ✍️ {tr("dash.recentEmptyCta")}
                  </Link>
                )}
              </div>
            )}
            {editable.slice(0, RECENT_ROWS).map((r) => (
              <RecordRow
                key={r.id}
                record={r}
                buckets={bucketOptions}
                canEdit={canWrite}
                canVoid={canWrite}
                ccy="MYR"
                lang={locale}
              />
            ))}
          </div>
        </section>

        {/* ⚠️ ORDER IS DELIBERATE: Honey comments AFTER the numbers it is
            commenting on. Both blocks used to open the page, so someone who
            came to check their buckets read an opinion about figures they had
            not seen yet, and scrolled past both to reach the data. Summary ->
            buckets -> subscriptions -> recent, THEN what Honey makes of it. */}
        {/* Honey insight */}
        <section className="mt-8 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-6 text-white shadow-lg">
          <div className="flex items-center gap-2 text-sm font-medium opacity-90">
            <span>{tr("dash.honeySays")}</span>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
              {insight.source === "gemini" ? tr("dash.badge.ai") : tr("dash.badge.insight")}
            </span>
          </div>
          <p className="mt-2 text-lg leading-relaxed">{insight.text}</p>
        </section>

        {/* What-if co-pilot */}
        <HoneyAsk
          labels={{
            title: tr("dash.ask.title"),
            placeholder: tr("dash.ask.placeholder"),
            button: tr("dash.ask.button"),
            thinking: tr("dash.ask.thinking"),
            // Both say CALCULATED, because both are — the numbers come from
            // lib/askCompute.ts either way. Only the wording differs.
            aiBadge: tr("ask.badge.ai"),
            ruleBadge: tr("ask.badge.computed"),
            disclaimer: tr("ask.scopeNotice"),
            suggestions: [tr("dash.ask.s1"), tr("dash.ask.s2"), tr("dash.ask.s3"), tr("dash.ask.s4")],
            confHigh: tr("ask.conf.label.high"),
            confFair: tr("ask.conf.label.fair"),
            confThin: tr("ask.conf.label.thin"),
          }}
        />

      </main>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : tr("dash.setup.unknownError");
    return (
      <main className="min-h-full px-6 py-16">
        <SetupNotice reason={tr("dash.setup.reasonError", { message })} lang={locale} />
      </main>
    );
  }
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500">{label}</div>
      <div
        className={`hm-money mt-1 text-lg font-semibold ${good === false ? "text-rose-600 dark:text-rose-400" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
