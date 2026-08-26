import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import Logo from "./Logo";

const NAV = [
  { href: "/dashboard", key: "nav.dashboard" },
  { href: "/records", key: "nav.records" },
  { href: "/graph", key: "nav.graph" },
  { href: "/guide", key: "nav.guide" },
  // Both live in the always-on static snapshot, so the footer keeps working as
  // a way out of the offline page when the origin is down.
  { href: "/demo", key: "demo.title" },
  { href: "/gallery", key: "gallery.title" },
  { href: "/deck", key: "deck.title" },
  { href: "/setup", key: "nav.setup" },
  { href: "/login", key: "auth.login" },
];

export default async function SiteFooter() {
  const locale = await getLocale();
  const tr = (k: string) => t(locale, k);

  return (
    <footer className="mt-auto border-t border-zinc-200/70 py-6 text-xs text-zinc-500 dark:border-zinc-800/70">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 sm:flex-row">
        <p className="flex items-center gap-1.5">
          <Link href="/" aria-label={tr("nav.home")} className="flex items-center gap-1.5 hover:text-amber-600">
            <Logo size={16} /> <span className="font-display">Honey<span className="text-amber-500">Money</span></span>
          </Link>
          {" · "}{tr("home.slogan")}
        </p>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-amber-600">{tr(n.key)}</Link>
          ))}
        </nav>
        {/* The legal links sit in their own row rather than in NAV above. They
            are not navigation — a privacy notice and a set of terms have to be
            reachable from every page to have been *given*, and burying them
            among nine product links is how they stop being findable. Both are
            in the always-on static snapshot, so they survive the origin being
            down; a notice that needs the laptop on is not given either. */}
        <p className="flex items-center gap-x-3 text-zinc-400">
          <Link href="/privacy" className="hover:text-amber-600">{tr("footer.privacy")}</Link>
          <Link href="/terms" className="hover:text-amber-600">{tr("footer.terms")}</Link>
          <span>{tr("footer.meta")}</span>
        </p>
      </div>
    </footer>
  );
}
