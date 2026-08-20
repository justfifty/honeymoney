import Link from "next/link";
import { isDatabaseConfigured } from "@/lib/config";
import { resolveViewTenant, can } from "@/lib/household";
import { getBucketProjection, getRecentSpend } from "@/lib/projection";
import { pbList, pbStr } from "@/lib/pocketbase";
import { getLocale } from "@/lib/locale";
import { t, type Locale } from "@/lib/i18n";
import { dataLabel } from "@/lib/dataLabels";
import { fmtMoney, shortDate } from "@/lib/format";
import AddTransaction from "../dashboard/AddTransaction";
import Logo from "../Logo";

export const dynamic = "force-dynamic";

// Record — the default landing.
//
// Capture is the only thing this app asks a user to do every day, so it gets the
// first screen rather than a tab they have to find. The primary action sits above
// the fold with nothing competing for it; everything that explains, summarises or
// scores lives one tab away.
//
// The capture component itself is the one the dashboard already used
// (dashboard/AddTransaction, wrapping graph/SpendCapture): voice, receipt, photo
// and paste, on-device by default and AI-assisted when a provider is set. Moving
// it to its own route is a navigation change, not a second implementation.
export default async function RecordPage() {
  const locale = await getLocale();
  const tr = (k: string, vars?: Record<string, string | number>) => t(locale, k, vars);

  if (!isDatabaseConfigured()) return <Notice tr={tr} body={tr("dash.setup.reasonNoDb")} />;

  const { tenantId, ctx } = await resolveViewTenant();
  if (!tenantId) return <Notice tr={tr} body={tr("hscore.noHousehold")} />;

  const canWrite = Boolean(ctx) && can(ctx!.accessRole, "add_record");

  const [projection, vendorNodes, recent] = await Promise.all([
    getBucketProjection(tenantId),
    pbList<{ id: string; label: string }>("nodes", {
      filter: `tenant = ${pbStr(tenantId)} && kind = 'vendor'`,
      perPage: 200,
    }),
    getRecentSpend(tenantId, 6, { viewerMemberId: ctx?.memberId, redact: Boolean(ctx) }),
  ]);

  return (
    <main className="mx-auto min-h-full w-full max-w-lg px-4 py-5 sm:px-6">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="flex items-center gap-1.5 font-display text-xl font-semibold tracking-tight">
          <Logo size={22} /> {tr("cap.title")}
        </h1>
        <Link href="/import" className="text-xs text-amber-600 hover:underline">
          {tr("nav.import")} →
        </Link>
      </header>
      <p className="mt-1 text-sm text-zinc-500">{tr("cap.subtitle")}</p>

      {canWrite ? (
        <div className="mt-4">
          <AddTransaction
            lang={locale}
            knownVendors={vendorNodes.map((v) => v.label)}
            buckets={projection.map((b) => ({ id: b.bucket_id, label: dataLabel(locale, b.bucket_label) }))}
          />
        </div>
      ) : (
        <ReadOnly tr={tr} signedIn={Boolean(ctx)} />
      )}

      {/* Just enough history to confirm the thing you typed actually landed.
          The full editable ledger is a tab away, on the Dashboard. */}
      {recent.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">{tr("rec.recent")}</h2>
            <Link href="/records" className="text-xs text-amber-600 hover:underline">
              {tr("rec.seeAll")}
            </Link>
          </div>
          <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {r.isPrivate ? "🔒 " : ""}
                  {r.vendor ?? tr("rec.unknownVendor")}
                </span>
                <span className="shrink-0 text-xs text-zinc-400">{shortDate(r.occurred_at)}</span>
                <span className="shrink-0 tabular-nums">{fmtMoney(r.amount, r.currency)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 text-xs leading-relaxed text-zinc-400">{tr("cap.neverAuto")}</p>
    </main>
  );
}

function ReadOnly({
  tr,
  signedIn,
}: {
  tr: (k: string, v?: Record<string, string | number>) => string;
  signedIn: boolean;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800">
      <p>{signedIn ? tr("rec.readOnly.role") : tr("demo.readOnly")}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link href="/demo" className="font-medium text-amber-600 hover:underline">
          {tr("hscore.tryDemo")}
        </Link>
        {!signedIn && (
          <Link href="/signup" className="font-medium text-amber-600 hover:underline">
            {tr("demo.createHousehold")}
          </Link>
        )}
      </div>
    </div>
  );
}

function Notice({
  tr,
  body,
}: {
  tr: (k: string, v?: Record<string, string | number>) => string;
  body: string;
}) {
  return (
    <main className="mx-auto min-h-full w-full max-w-lg px-4 py-16 sm:px-6">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <h1 className="font-display text-lg font-semibold">{tr("cap.title")}</h1>
        <p className="mt-2 text-sm">{body}</p>
        <Link href="/demo" className="mt-4 inline-block text-sm font-medium underline">
          {tr("hscore.tryDemo")}
        </Link>
      </div>
    </main>
  );
}
