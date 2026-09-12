import Link from "next/link";
import { isDatabaseConfigured } from "@/lib/config";
import { resolveViewTenant, can, listMembers } from "@/lib/household";
import { listGoals, GOAL_CATEGORIES } from "@/lib/goals";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import { isUnreachable } from "@/lib/pocketbase";
import DegradedNotice from "../DegradedNotice";
import Logo from "../Logo";
import GoalsManager from "./GoalsManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Goals — your own targets" };

// Goals: self-directed savings targets (own time, own targets), with milestones
// and monthly-pace math. Signed out → the public demo household's goals, so a
// judge sees it populated. Reuses the graph's `goal` nodes.
export default async function GoalsPage() {
  const locale = await getLocale();
  const tr = (k: string) => t(locale, k);

  if (!isDatabaseConfigured()) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm">PocketBase isn&apos;t running — start it with <code>npm run pb:start</code>.</p>
      </main>
    );
  }

  // Same shape as /dashboard, /hscore, /record and /graph: an unreachable
  // ledger is a temporary fact about a host, not an error this reader can act
  // on, and it must not reach the error boundary — that renders an empty tab,
  // which is exactly how the 2026-09-13 outage presented on this page.
  let data: {
    ctx: Awaited<ReturnType<typeof resolveViewTenant>>["ctx"];
    goals: Awaited<ReturnType<typeof listGoals>>;
    members: Awaited<ReturnType<typeof listMembers>>;
  };
  try {
    const { tenantId, ctx } = await resolveViewTenant();
    const [goals, members] = tenantId
      ? await Promise.all([
          // The viewer decides what they may see: a private goal is redacted for
          // everyone except its owner.
          listGoals(tenantId, { viewerMemberId: ctx?.memberId ?? null }),
          listMembers(tenantId),
        ])
      : [[], []];
    data = { ctx, goals, members };
  } catch (err) {
    if (!isUnreachable(err)) throw err;
    return (
      <main className="mx-auto min-h-full max-w-2xl px-4 py-16 sm:px-6">
        <DegradedNotice
          lang={locale}
          detail={err instanceof Error ? err.message : undefined}
          where={tr("goals.title")}
        />
      </main>
    );
  }

  const { ctx, goals, members } = data;
  const canWrite = Boolean(ctx) && can(ctx!.accessRole, "manage_graph");

  return (
    <main className="mx-auto min-h-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Logo size={24} /> {tr("goals.title")}
        </h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/dashboard" className="text-zinc-500 hover:underline">{tr("nav.dashboard")}</Link>
          <Link href="/learn" className="text-amber-600 hover:underline">🎓 {tr("nav.learn")}</Link>
        </nav>
      </header>
      <p className="mt-2 text-sm text-zinc-500">{tr("goals.subtitle")}</p>

      <GoalsManager
        goals={goals}
        canWrite={canWrite}
        categories={GOAL_CATEGORIES.map((c) => ({ key: c.key, emoji: c.emoji, label: c.label }))}
        members={members.map((m) => ({ id: m.id, name: m.display_name }))}
        viewerMemberId={ctx?.memberId ?? null}
      />
    </main>
  );
}
