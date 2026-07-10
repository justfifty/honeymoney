import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200/70 py-6 text-xs text-zinc-500 dark:border-zinc-800/70">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 sm:flex-row">
        <p>🍯 HoneyMoney · Happy Wife, Happy Life.</p>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="/dashboard" className="hover:text-amber-600">Dashboard</Link>
          <Link href="/records" className="hover:text-amber-600">Records</Link>
          <Link href="/graph" className="hover:text-amber-600">Graph</Link>
          <Link href="/guide" className="hover:text-amber-600">Guide</Link>
          <Link href="/login" className="hover:text-amber-600">Log in</Link>
        </nav>
        <p className="text-zinc-400">Local-first · MAIC Nexus 2026 · T3</p>
      </div>
    </footer>
  );
}
