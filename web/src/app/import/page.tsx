import Link from "next/link";
import { redirect } from "next/navigation";
import { isDatabaseConfigured, activeAiProvider, isProviderConfigured } from "@/lib/config";
import { getContext, can } from "@/lib/household";
import { listBuckets } from "@/lib/graph";
import { listMembers } from "@/lib/household";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import { dataLabel } from "@/lib/dataLabels";
import StatementImport from "./StatementImport";
import CsvImport from "./CsvImport";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const locale = await getLocale();
  const tr = (k: string, vars?: Record<string, string | number>) => t(locale, k, vars);

  if (!isDatabaseConfigured()) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-8 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <h2 className="text-lg font-semibold">{tr("imp.notConfigured")}</h2>
        </div>
      </main>
    );
  }

  // Importing writes to the books, so unlike /graph and /records this page has
  // no read-only demo mode — there is nothing here to look at without a
  // household of your own to import into.
  const ctx = await getContext();
  if (!ctx) redirect("/login?next=/import");
  if (!can(ctx.accessRole, "add_record")) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-2xl border border-zinc-200 p-8 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">{tr("imp.noPermission")}</h2>
        </div>
      </main>
    );
  }

  const [buckets, members] = await Promise.all([
    listBuckets(ctx.tenant.id),
    listMembers(ctx.tenant.id),
  ]);

  const aiReady = isProviderConfigured(activeAiProvider());

  return (
    <main className="mx-auto min-h-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">📄 {tr("imp.title")}</h1>
          <p className="text-sm text-zinc-500">{tr("imp.subtitle")}</p>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/records" className="text-zinc-500 hover:underline">🧾 {tr("nav.records")}</Link>
          <Link href="/dashboard" className="text-zinc-500 hover:underline">📊 {tr("nav.dashboard")}</Link>
          <Link href="/" className="text-zinc-500 hover:underline">← {tr("nav.home")}</Link>
        </nav>
      </header>

      {/* CSV FIRST, and never gated. This page used to show nothing at all
          without an AI provider configured, which put the entire import feature
          behind a key — exactly what Task 10 forbids ("never gate import behind
          it"). CSV import needs no AI, no network and no key: it parses in the
          browser and posts only the rows the user approved. It is the baseline
          that works everywhere, including iOS Safari. */}
      <div className="mt-8">
        <CsvImport
          lang={locale}
          buckets={buckets.map((b) => ({ id: b.id, label: dataLabel(locale, b.label) }))}
          defaultBucketId={buckets.find((b) => b.tier === 3)?.id ?? buckets[0]?.id ?? ""}
        />
      </div>

      {/* The PDF path is an ENHANCEMENT and is honest about its cost. It sends
          statement text to an AI provider, which Task 10's rule — "nothing from
          a bank file goes to any model" — is written against. It predates that
          rule and still works, so it is kept, labelled, and clearly second. See
          NEXT.md §6.6 Task 10: removing it outright is a product decision. */}
      {aiReady ? (
        <div className="mt-10">
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-medium">{tr("imp.pdfAiTitle")}</p>
            <p className="mt-1">{tr("imp.pdfAiBody")}</p>
          </div>
          <StatementImport
            lang={locale}
            buckets={buckets.map((b) => ({ id: b.id, label: dataLabel(locale, b.label), tier: b.tier }))}
            members={members.map((m) => ({ id: m.id, label: m.display_name }))}
          />
        </div>
      ) : (
        <div className="mt-10 rounded-2xl border border-zinc-200 p-5 text-sm text-zinc-500 dark:border-zinc-800">
          <p className="font-medium text-zinc-700 dark:text-zinc-300">{tr("imp.aiNeeded")}</p>
          <p className="mt-1 text-xs">{tr("imp.aiNeededHint")}</p>
        </div>
      )}

      <p className="mt-10 max-w-2xl text-xs text-zinc-500">{tr("imp.privacy")}</p>
    </main>
  );
}
