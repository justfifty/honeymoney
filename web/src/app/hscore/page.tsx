import Link from "next/link";
import { isDatabaseConfigured } from "@/lib/config";
import { resolveViewTenant } from "@/lib/household";
import { getHScore } from "@/lib/hscoreData";
import { pbList, pbStr } from "@/lib/pocketbase";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import HScoreClient from "./HScoreClient";
import LocalOverlay from "../LocalOverlay";

export const dynamic = "force-dynamic";

// The H-Score tab for a real household. The engine (lib/hscore.ts) is pure and
// the adapter (lib/hscoreData.ts) reads the household's own graph; this page is
// only the seam between them and the same presentational components the public
// demo renders. One implementation, so the score a visitor sees in /demo and the
// score a signed-in user sees cannot drift into two different products.
//
// persist: true here — writing the band state is what makes hysteresis work at
// all (a tier can only change after the raw score holds across the boundary for
// seven days), and the daily snapshot is what gives "what moved your score" a
// yesterday to compare against. The demo passes false: it has no database.
export default async function HScorePage() {
  const locale = await getLocale();
  const tr = (k: string, vars?: Record<string, string | number>) => t(locale, k, vars);

  if (!isDatabaseConfigured()) {
    return <Notice tr={tr} body={tr("dash.setup.reasonNoDb")} />;
  }

  const { tenantId, ctx } = await resolveViewTenant();
  if (!tenantId) return <Notice tr={tr} body={tr("hscore.noHousehold")} />;

  // The streak reads the same tenant's transactions but needs nothing the score
  // produces, so the two go out together. In series it was one round trip
  // waiting on another for no reason.
  const [result, streakMonths] = await Promise.all([
    getHScore(tenantId, { persist: Boolean(ctx) }),
    // Months in a row with at least one entry — the streak the Building tier
    // shows instead of applause.
    loggingStreak(tenantId),
  ]);

  return (
    <main className="mx-auto min-h-full w-full max-w-lg px-4 py-5 sm:px-6">
      <LocalOverlay where="your score" />
      <header className="mb-5 flex items-baseline justify-between gap-2">
        <h1 className="font-display text-xl font-semibold tracking-tight">{tr("hscore.title")}</h1>
        {!ctx && (
          <Link href="/signup" className="text-xs text-amber-600 hover:underline">
            {tr("demo.more.signup")}
          </Link>
        )}
      </header>

      <HScoreClient
        lang={locale}
        hscore={result}
        movement={result.movement}
        savingsGap={result.savingsGap}
        inputs={result.inputs}
        streakMonths={streakMonths}
        unscoredCount={result.unscoredCount}
      />
    </main>
  );
}

/** Consecutive months back from this one that carry at least one entry. */
async function loggingStreak(tenantId: string): Promise<number> {
  const rows = await pbList<{ occurred_at: string }>("transactions", {
    filter: `tenant = ${pbStr(tenantId)}`,
    sort: "-occurred_at",
    perPage: 1000,
  });
  const seen = new Set(rows.map((r) => r.occurred_at.slice(0, 7)));
  const now = new Date();
  let n = 0;
  for (let i = 0; i < 36; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    if (!seen.has(d.toISOString().slice(0, 7))) break;
    n++;
  }
  return n;
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
        <h1 className="font-display text-lg font-semibold">{tr("hscore.title")}</h1>
        <p className="mt-2 text-sm">{body}</p>
        <Link href="/demo" className="mt-4 inline-block text-sm font-medium underline">
          {tr("hscore.tryDemo")}
        </Link>
      </div>
    </main>
  );
}
