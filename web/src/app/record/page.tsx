import Link from "next/link";
import { isDatabaseConfigured } from "@/lib/config";
import { resolveViewTenant, can, listMembers } from "@/lib/household";
import type { Composition } from "@/lib/attribution";
import { getBucketProjection, getRecentSpend } from "@/lib/projection";
import { pbList, pbFirst, pbStr } from "@/lib/pocketbase";
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
// (dashboard/AddTransaction, wrapping graph/SpendCapture): receipt, photo
// and paste, on-device by default and AI-assisted when a provider is set. Moving
// it to its own route is a navigation change, not a second implementation.
export default async function RecordPage() {
  const locale = await getLocale();
  const tr = (k: string, vars?: Record<string, string | number>) => t(locale, k, vars);

  if (!isDatabaseConfigured()) return <Notice tr={tr} body={tr("dash.setup.reasonNoDb")} />;

  const { tenantId, ctx } = await resolveViewTenant();
  if (!tenantId) return <Notice tr={tr} body={tr("hscore.noHousehold")} />;

  const canWrite = Boolean(ctx) && can(ctx!.accessRole, "add_record");

  const [projection, vendorNodes, recent, members, tenant] = await Promise.all([
    getBucketProjection(tenantId),
    pbList<{ id: string; label: string }>("nodes", {
      filter: `tenant = ${pbStr(tenantId)} && kind = 'vendor'`,
      perPage: 200,
    }),
    getRecentSpend(tenantId, 6, { viewerMemberId: ctx?.memberId, redact: Boolean(ctx) }),
    listMembers(tenantId),
    pbFirst<{ id: string; composition?: string }>("tenants", `id = ${pbStr(tenantId)}`),
  ]);

  // Household composition is CONTEXT, not a control — Task 6 is explicit that it
  // belongs in settings and is merely SHOWN here. Falls back to the shape of the
  // household rather than to a hardcoded default: a tenant with three members is
  // a family whether or not anyone has been to the setting yet.
  const composition: Composition =
    tenant?.composition === "couple" || tenant?.composition === "family" || tenant?.composition === "individual"
      ? tenant.composition
      : members.length > 2
        ? "family"
        : members.length === 2
          ? "couple"
          : "individual";

  return (
    // `min-w-0` is the same guard /graph documents at length: <main> is a flex
    // item, `mx-auto` suppresses cross-axis stretch, and a flex item's default
    // `min-width: auto` refuses to shrink below its min-content width. One
    // unbreakable child — a long vendor label, a wide status line from the
    // scanner — would otherwise widen the whole page past the viewport and take
    // the header and tab bar sideways with it.
    <main className="mx-auto min-h-full w-full min-w-0 max-w-lg px-4 py-5 sm:px-6">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="flex items-center gap-1.5 font-display text-xl font-semibold tracking-tight">
          <Logo size={22} /> {tr("cap.title")}
        </h1>
        <Link href="/import" className="text-xs text-amber-600 hover:underline">
          {tr("nav.import")} →
        </Link>
      </header>
      <p className="mt-1 text-sm text-zinc-500">{tr("cap.subtitle")}</p>

      {/* Composition as CONTEXT — a statement of who this household is, not a
          switcher. The old persona control read as something to change per
          record, which is exactly the confusion Task 6 splits apart. Nothing is
          shown for a household of one: there is no context to establish. */}
      {composition !== "individual" && (
        <p className="mt-1 text-xs text-zinc-400">
          {tr("rec.comp.label")}: {tr(`rec.comp.${composition}`)}
        </p>
      )}

      {canWrite ? (
        <div className="mt-4">
          <AddTransaction
            lang={locale}
            knownVendors={vendorNodes.map((v) => v.label)}
            buckets={projection.map((b) => ({
              id: b.bucket_id,
              label: dataLabel(locale, b.bucket_label),
              tier: b.tier,
            }))}
            members={members.map((m) => ({ id: m.id, label: m.display_name }))}
            composition={composition}
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
                {/* Same three-way scheme as RecordRow on /records. This list
                    was the one that showed "Saving −RM500" and "Saving +RM500"
                    on the same day, because it split on direction and a savings
                    transfer is stored with direction "in". Transfers get "→" in
                    green: nothing arrived, nothing was spent, and it is the one
                    row here that is money you still have. */}
                <span
                  title={
                    r.kind === "transfer"
                      ? "Moved between your own pockets — neither income nor spending"
                      : undefined
                  }
                  className={
                    "shrink-0 tabular-nums font-medium " +
                    (r.kind === "transfer"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : r.direction === "in"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-zinc-700 dark:text-zinc-300")
                  }
                >
                  {r.kind === "transfer" ? "→" : r.direction === "in" ? "+" : "−"}
                  {fmtMoney(r.amount, r.currency)}
                </span>
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
