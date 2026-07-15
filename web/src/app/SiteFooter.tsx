import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import Logo from "./Logo";

const NAV = [
  { href: "/dashboard", key: "nav.dashboard" },
  { href: "/records", key: "nav.records" },
  { href: "/graph", key: "nav.graph" },
  { href: "/guide", key: "nav.guide" },
  { href: "/login", key: "auth.login" },
];

export default async function SiteFooter() {
  const locale = await getLocale();
  const tr = (k: string) => t(locale, k);

  return (
    <footer className="mt-auto border-t border-zinc-200/70 py-6 text-xs text-zinc-500 dark:border-zinc-800/70">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 sm:flex-row">
        <p className="flex items-center gap-1.5"><Logo size={16} /> <span className="font-display">Honey<span className="text-amber-500">Money</span></span> · {tr("home.slogan")}</p>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-amber-600">{tr(n.key)}</Link>
          ))}
        </nav>
        <p className="text-zinc-400">{tr("footer.meta")}</p>
      </div>
    </footer>
  );
}
