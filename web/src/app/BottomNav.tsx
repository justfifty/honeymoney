"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Touch 'n Go-familiar bottom tab bar for mobile: the primary destinations in the
// thumb zone, with a raised center Capture action (scan/voice). Shown only on the
// app pages — hidden on the marketing landing + auth so those stay focused. On
// desktop the header nav takes over (this is md:hidden).
const HIDE_ON = new Set(["/", "/login", "/signup", "/join"]);

export interface BottomNavLabels {
  dashboard: string;
  records: string;
  capture: string;
  goals: string;
  learn: string;
}

export default function BottomNav({ labels }: { labels: BottomNavLabels }) {
  const pathname = usePathname();
  if (HIDE_ON.has(pathname)) return null;

  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-950/95"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        <Tab href="/dashboard" label={labels.dashboard} on={active("/dashboard")}>
          <path d="M4 13h7V4H4v9Zm9 7h7v-9h-7v9ZM4 20h7v-5H4v5Zm9-16v5h7V4h-7Z" />
        </Tab>
        <Tab href="/records" label={labels.records} on={active("/records")}>
          <path d="M5 4h11l3 3v13H5V4Z" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M8 10h8M8 14h8M8 18h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </Tab>

        {/* Raised center: Capture (scan / voice) */}
        <Link
          href="/graph"
          aria-label={labels.capture}
          className="relative -mt-4 flex w-16 flex-col items-center"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg ring-4 ring-white dark:ring-zinc-950">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </span>
          <span className="mt-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">{labels.capture}</span>
        </Link>

        <Tab href="/goals" label={labels.goals} on={active("/goals")}>
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
        </Tab>
        <Tab href="/learn" label={labels.learn} on={active("/learn")}>
          <path d="M3 8l9-4 9 4-9 4-9-4Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M7 10.5V15c0 1 2.2 2 5 2s5-1 5-2v-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </Tab>
      </div>
    </nav>
  );
}

function Tab({
  href,
  label,
  on,
  children,
}: {
  href: string;
  label: string;
  on: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={
        "flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium " +
        (on ? "text-amber-600 dark:text-amber-400" : "text-zinc-500 dark:text-zinc-400")
      }
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
        {children}
      </svg>
      {label}
    </Link>
  );
}
