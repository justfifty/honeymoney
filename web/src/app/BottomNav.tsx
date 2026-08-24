"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The app's five tabs, in the thumb zone: Record · Dashboard · Graph · H-Score · More.
//
// Graph sits beside Dashboard because it is the same money as a picture rather
// than a list — summary, then shape. It replaced an in-page shortcut in the
// dashboard header, which duplicated a control now permanently on screen.
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
// On desktop the header nav takes over — this is md:hidden, and HeaderNav is
// `hidden md:flex`, so exactly one of the two carries the four at any width.
// Routes with their own navigation are excluded upstream by ChromeGate.
//
// This bar used to hide itself on "/", /login, /signup and /join to keep the
// marketing and auth pages focused. That is what made the four destinations
// vanish below 768px on those routes: the header nav is hidden there, so the
// only remaining route into the app was the hamburger — and More is already the
// overflow menu. Focus is not worth losing navigation over, so the bar now
// renders everywhere the header nav would have.
//
// To put the marketing landing back the way it was, the change is one line:
//   const HIDE_ON = new Set(["/", "/login", "/signup", "/join"]);
// and an early `if (HIDE_ON.has(pathname)) return null;` below.

export interface BottomNavLabels {
  record: string;
  dashboard: string;
  graph: string;
  hscore: string;
  more: string;
}

export default function BottomNav({ labels }: { labels: BottomNavLabels }) {
  const pathname = usePathname();

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
        <Tab href="/graph" label={labels.graph} on={active("/graph")}>
          {/* Three nodes and two edges — the smallest mark that reads as a graph
              rather than as a chart, at 22px. */}
          <circle cx="6" cy="7" r="2.4" />
          <circle cx="18" cy="10" r="2.4" />
          <circle cx="10" cy="18" r="2.4" />
          <path d="M7.9 8.2 16.1 9.4M16.6 12.1 11.5 16.3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
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
      // The label is hidden below 360px, so the link carries it either way —
      // a screen reader must never be left with four unnamed icons.
      aria-label={label}
      aria-current={on ? "page" : undefined}
      className={
        // min-h-14 is 56px: comfortably past the 44px minimum touch target, and
        // it survives the label being hidden at 320px without the row collapsing.
        "relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] " +
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-500 " +
        (on
          ? "font-semibold text-amber-600 dark:text-amber-400"
          : "font-medium text-zinc-500 dark:text-zinc-400")
      }
    >
      {/* Active state is a bar plus weight, not hue alone — the tab has to be
          identifiable in greyscale and by anyone who can't separate amber from
          grey. Same reasoning as the +/- glyphs on records. */}
      {on && <span className="absolute inset-x-2.5 top-0 h-0.5 rounded-b-full bg-amber-500" aria-hidden="true" />}
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden="true">
        {children}
      </svg>
      {/* Degrade rather than disappear: at 320px there is no room for four
          labels in a script like Tamil, so the icons stand alone. */}
      <span className="max-w-full truncate max-[359px]:hidden">{label}</span>
    </Link>
  );
}
