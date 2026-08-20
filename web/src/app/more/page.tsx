import Link from "next/link";
import { resolveViewTenant } from "@/lib/household";
import { getSessionUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// More — everything that isn't Record, Dashboard or H-Score.
//
// The point of this tab is what it keeps OFF the other three. Bucket caps, goals,
// export, household management, the ledger and settings are all things a user
// touches occasionally and deliberately; putting any of them in the thumb row
// would cost a daily action its place.
//
// /demo lives here rather than on the tab bar. A user with real data never opens
// the demo, so a tab for it is dead space on every screen for everyone who has
// signed up — but it still needs a way in for someone showing the app to a
// partner, or to a judge.

type Item = { href: string; key: string; desc: string; icon: string; auth?: boolean };

const GROUPS: { titleKey: string; items: Item[] }[] = [
  {
    titleKey: "more.g.money",
    items: [
      { href: "/goals", key: "nav.goals", desc: "more.d.goals", icon: "🎯" },
      { href: "/graph", key: "nav.graph", desc: "more.d.graph", icon: "🕸️" },
      { href: "/records", key: "nav.records", desc: "more.d.records", icon: "🧾" },
      { href: "/import", key: "nav.import", desc: "more.d.import", icon: "📄", auth: true },
    ],
  },
  {
    titleKey: "more.g.household",
    items: [
      { href: "/household", key: "more.household", desc: "more.d.household", icon: "👪", auth: true },
      { href: "/ledger", key: "more.ledger", desc: "more.d.ledger", icon: "⛓️", auth: true },
      { href: "/account", key: "more.account", desc: "more.d.account", icon: "⚙️", auth: true },
    ],
  },
  {
    titleKey: "more.g.learn",
    items: [
      { href: "/guide", key: "nav.guide", desc: "more.d.guide", icon: "📖" },
      { href: "/learn", key: "nav.learn", desc: "more.d.learn", icon: "🎓" },
      { href: "/gallery", key: "gallery.title", desc: "more.d.gallery", icon: "🖼️" },
      { href: "/demo", key: "more.demo", desc: "more.d.demo", icon: "▶️" },
    ],
  },
];

export default async function MorePage() {
  const locale = await getLocale();
  const tr = (k: string, vars?: Record<string, string | number>) => t(locale, k, vars);
  const [user, view] = await Promise.all([
    getSessionUser().catch(() => null),
    resolveViewTenant().catch(() => ({ tenantId: null, ctx: null, isDemo: true })),
  ]);

  return (
    <main className="mx-auto min-h-full w-full max-w-lg px-4 py-5 sm:px-6">
      <h1 className="font-display text-xl font-semibold tracking-tight">{tr("more.title")}</h1>
      {view.ctx ? (
        <p className="mt-1 text-sm text-zinc-500">
          {tr("more.household.is", { name: view.ctx.tenant.name })}
        </p>
      ) : (
        <p className="mt-1 text-sm text-zinc-500">{tr("more.signedOut")}</p>
      )}

      {GROUPS.map((g) => {
        const items = g.items.filter((i) => !i.auth || user);
        if (items.length === 0) return null;
        return (
          <section key={g.titleKey} className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{tr(g.titleKey)}</h2>
            <ul className="mt-2 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
              {items.map((i, n) => (
                <li key={i.href} className={n > 0 ? "border-t border-zinc-100 dark:border-zinc-800" : ""}>
                  <Link
                    href={i.href}
                    className="flex min-h-[3.25rem] items-start gap-3 px-4 py-3 text-sm transition hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <span aria-hidden className="mt-0.5 text-base">{i.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{tr(i.key)}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-zinc-500">{tr(i.desc)}</span>
                    </span>
                    <span aria-hidden className="mt-1 text-zinc-300">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {!user && (
        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-amber-900 dark:text-amber-200">{tr("more.signup.pitch")}</p>
          <div className="mt-3 flex gap-3">
            <Link href="/signup" className="font-medium text-amber-700 underline dark:text-amber-300">
              {tr("demo.createHousehold")}
            </Link>
            <Link href="/login" className="font-medium text-amber-700 underline dark:text-amber-300">
              {tr("auth.login")}
            </Link>
          </div>
        </div>
      )}

      <p className="mt-8 text-xs leading-relaxed text-zinc-400">{tr("more.privacy")}</p>
    </main>
  );
}
