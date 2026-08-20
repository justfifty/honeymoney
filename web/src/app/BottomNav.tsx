"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The app's four tabs, in the thumb zone: Record · Dashboard · H-Score · More.
//
// Record is first and is the default landing, because capture is the only thing
// this app asks of a user every day. The other three are read-or-occasional, so
// they sit to the right of it. There is no raised centre button any more: when
// the first tab IS capture, a floating action button for capture is a second
// door to the same room.
//
// /demo is deliberately not here. Someone with real data never opens it, so a
// fifth tab would be dead space on every screen for everyone who signed up — it
// lives on the public route and is reachable from More.
//
// Hidden on the marketing landing and auth pages so those stay focused, and on
// routes that carry their own navigation (see ChromeGate). On desktop the header
// nav takes over — this is md:hidden.
const HIDE_ON = new Set(["/", "/login", "/signup", "/join"]);

export interface BottomNavLabels {
  record: string;
  dashboard: string;
  hscore: string;
  more: string;
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
        <Tab href="/record" label={labels.record} on={active("/record")}>
          <path d="M5 4h14v16H5z" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M9 9h6M9 13h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </Tab>
        <Tab href="/dashboard" label={labels.dashboard} on={active("/dashboard")}>
          <path d="M4 13h7V4H4v9Zm9 7h7v-9h-7v9ZM4 20h7v-5H4v5Zm9-16v5h7V4h-7Z" />
        </Tab>
        <Tab href="/hscore" label={labels.hscore} on={active("/hscore")}>
          <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.35" />
          <path d="M12 3.5a8.5 8.5 0 0 1 6.6 13.8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </Tab>
        <Tab href="/more" label={labels.more} on={active("/more")}>
          <circle cx="5" cy="12" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="19" cy="12" r="1.9" />
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
