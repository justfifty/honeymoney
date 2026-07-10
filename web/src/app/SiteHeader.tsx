import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import LogoutButton from "./admin/LogoutButton";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/records", label: "Records" },
  { href: "/graph", label: "Graph" },
  { href: "/guide", label: "Guide" },
];

// Global app chrome: brand + primary nav + auth state, on every page.
export default async function SiteHeader() {
  const user = await getSessionUser().catch(() => null);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/80 backdrop-blur dark:border-zinc-800/70 dark:bg-black/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
          <span aria-hidden>🍯</span> HoneyMoney
        </Link>

        <nav className="hidden items-center gap-5 text-sm text-zinc-600 dark:text-zinc-300 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-amber-600 dark:hover:text-amber-400">
              {n.label}
            </Link>
          ))}
          {user?.role === "admin" && (
            <Link href="/admin" className="hover:text-amber-600 dark:hover:text-amber-400">Admin</Link>
          )}
        </nav>

        <div className="flex items-center gap-2 text-sm">
          {user ? (
            <>
              <span className="hidden max-w-[10rem] truncate text-xs text-zinc-500 sm:inline">
                {user.name || user.email}
                {user.role === "admin" && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">admin</span>}
              </span>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-3 py-1.5 font-medium text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40">
                Log in
              </Link>
              <Link href="/signup" className="rounded-lg bg-amber-500 px-3 py-1.5 font-medium text-white hover:bg-amber-600">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
