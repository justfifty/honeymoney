import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import LanguageSwitcher from "./graph/LanguageSwitcher";
import HeaderNav from "./HeaderNav";
import AppMenu from "./AppMenu";
import LogoutButton from "./admin/LogoutButton";
import Logo from "./Logo";

// The same four tabs the bottom bar carries, so desktop and mobile are one
// product rather than two. Everything else (graph, records, goals, ledger,
// household, the demo) is reachable from More.
const NAV = [
  { href: "/record", key: "nav.record" },
  { href: "/dashboard", key: "nav.dashboard" },
  // Graph sits immediately after Dashboard on purpose: it is the same money seen
  // as a picture rather than a list, so the pair reads as "summary, then shape".
  // It replaces the in-page shortcut that used to live in the dashboard header.
  { href: "/graph", key: "nav.graph" },
  { href: "/hscore", key: "nav.hscore" },
  { href: "/more", key: "more.title" },
];

// Global app chrome: brand + primary nav + language + auth state, on every page.
export default async function SiteHeader() {
  const [user, locale] = await Promise.all([getSessionUser().catch(() => null), getLocale()]);
  const tr = (k: string) => t(locale, k);
  const navItems = NAV.map((n) => ({ href: n.href, label: tr(n.key) }));
  if (user?.role === "admin") navItems.push({ href: "/admin", label: tr("auth.admin") });

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/80 backdrop-blur dark:border-zinc-800/70 dark:bg-black/60">
      {/* md:py-1.5 keeps the bar the same height it has always been: from md up
          the nav links are 44px tall for touch, so the outer padding gives back
          what they take. Below md the nav is hidden and py-2.5 still governs. */}
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 md:py-1.5">
        <Link href="/" className="mx-auto flex items-center gap-0.5 text-base font-bold tracking-tight md:mx-0">
          <Logo size={26} />
          <span className="font-display">Honey<span className="text-amber-500">Money</span></span>
        </Link>

        <HeaderNav items={navItems} />

        <div className="flex min-w-0 items-center gap-1.5 text-sm sm:gap-2">
          <LanguageSwitcher current={locale} label={tr("common.language")} />
          {user ? (
            <>
              <Link href="/setup" className="hidden max-w-[10rem] truncate text-xs text-zinc-500 hover:text-amber-600 sm:inline dark:hover:text-amber-400">
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
              {/* Truncates rather than pushing the menu button off-screen. In
                  Tamil this label is long enough to overflow a 360px header and
                  carry the hamburger past the right edge, which loses the user
                  their only way into navigation. */}
              <Link
                href="/signup"
                className="max-w-[7.5rem] shrink truncate whitespace-nowrap rounded-lg bg-amber-400 px-2.5 py-1.5 font-semibold text-zinc-950 hover:bg-amber-300"
              >
                {tr("auth.signup")}
              </Link>
            </>
          )}
          <AppMenu
            items={navItems}
            labels={{
              menu: tr("nav.menu"),
              goals: tr("nav.goals"),
              learn: tr("nav.learn"),
              setup: tr("nav.setup"),
              install: tr("nav.install"),
              installed: tr("nav.installed"),
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
