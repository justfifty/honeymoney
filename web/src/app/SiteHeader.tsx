import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import LanguageSwitcher from "./graph/LanguageSwitcher";
import LogoutButton from "./admin/LogoutButton";

const NAV = [
  { href: "/dashboard", key: "nav.dashboard" },
  { href: "/records", key: "nav.records" },
  { href: "/graph", key: "nav.graph" },
  { href: "/guide", key: "nav.guide" },
];

// Global app chrome: brand + primary nav + language + auth state, on every page.
export default async function SiteHeader() {
  const [user, locale] = await Promise.all([getSessionUser().catch(() => null), getLocale()]);
  const tr = (k: string) => t(locale, k);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/80 backdrop-blur dark:border-zinc-800/70 dark:bg-black/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
          <span aria-hidden>🍯</span> HoneyMoney
        </Link>

        <nav className="hidden items-center gap-5 text-sm text-zinc-600 dark:text-zinc-300 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-amber-600 dark:hover:text-amber-400">
              {tr(n.key)}
            </Link>
          ))}
          {user?.role === "admin" && (
            <Link href="/admin" className="hover:text-amber-600 dark:hover:text-amber-400">{tr("auth.admin")}</Link>
          )}
        </nav>

        <div className="flex items-center gap-2 text-sm">
          <LanguageSwitcher current={locale} label={tr("common.language")} />
          {user ? (
            <>
              <span className="hidden max-w-[10rem] truncate text-xs text-zinc-500 sm:inline">
                {user.name || user.email}
                {user.role === "admin" && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">{tr("auth.admin")}</span>}
              </span>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-3 py-1.5 font-medium text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40">
                {tr("auth.login")}
              </Link>
              <Link href="/signup" className="rounded-lg bg-amber-500 px-3 py-1.5 font-medium text-white hover:bg-amber-600">
                {tr("auth.signup")}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
