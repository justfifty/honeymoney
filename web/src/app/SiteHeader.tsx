import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import LanguageSwitcher from "./graph/LanguageSwitcher";
import HeaderNav from "./HeaderNav";
import AppMenu from "./AppMenu";
import LogoutButton from "./admin/LogoutButton";
import Logo from "./Logo";

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
  const navItems = NAV.map((n) => ({ href: n.href, label: tr(n.key) }));
  // Importing writes to the books, so it only exists for someone signed in —
  // there is no demo version of it to show a visitor.
  if (user) navItems.push({ href: "/import", label: tr("nav.import") });
  if (user?.role === "admin") navItems.push({ href: "/admin", label: tr("auth.admin") });

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/80 backdrop-blur dark:border-zinc-800/70 dark:bg-black/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
        <Link href="/" className="mx-auto flex items-center gap-0.5 text-base font-bold tracking-tight md:mx-0">
          <Logo size={26} />
          <span className="font-display">Honey<span className="text-amber-500">Money</span></span>
        </Link>

        <HeaderNav items={navItems} />

        <div className="flex items-center gap-1.5 text-sm sm:gap-2">
          <LanguageSwitcher current={locale} label={tr("common.language")} />
          {user ? (
            <>
              <Link href="/account" className="hidden max-w-[10rem] truncate text-xs text-zinc-500 hover:text-amber-600 sm:inline dark:hover:text-amber-400">
                {user.name || user.email}
                {user.role === "admin" && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">{tr("auth.admin")}</span>}
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              {/* Icon-only on phones to keep the top bar compact; full label from sm up. */}
              <Link href="/login" aria-label={tr("auth.login")} className="flex items-center whitespace-nowrap rounded-lg px-2 py-1.5 font-medium text-amber-600 hover:bg-amber-50 sm:px-2.5 dark:text-amber-400 dark:hover:bg-amber-950/40">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 sm:hidden" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span className="hidden sm:inline">{tr("auth.login")}</span>
              </Link>
              <Link href="/signup" className="whitespace-nowrap rounded-lg bg-amber-500 px-2.5 py-1.5 font-medium text-white hover:bg-amber-600">
                {tr("auth.signup")}
              </Link>
            </>
          )}
          <AppMenu
            items={navItems}
            labels={{
              menu: tr("nav.menu"),
              setup: tr("nav.setup"),
              install: tr("nav.install"),
              installed: tr("nav.installed"),
              account: user ? tr("nav.account") : undefined,
              iosGuide: {
                title: tr("install.ios.title"),
                openSafari: tr("install.ios.openSafari"),
                step1: tr("install.ios.step1"),
                step2: tr("install.ios.step2"),
                step3: tr("install.ios.step3"),
              },
            }}
          />
        </div>
      </div>
    </header>
  );
}
