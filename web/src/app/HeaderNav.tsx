"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

// Primary nav with the active tab highlighted in amber. Client component so it
// can read the current path; the server header passes translated labels in.
//
// `hidden md:flex` is the desktop half of a pair: below 768px BottomNav carries
// the same four destinations in the thumb zone. Both switch at md, so exactly
// one of them is showing at any width — if you change this breakpoint, change
// BottomNav's `md:hidden` with it or the four vanish in the gap between them.
export default function HeaderNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    // gap-1 rather than gap-5: the items now carry px-2 of their own so the
    // touch target reaches 44px, and the visual spacing between labels comes
    // out the same as before.
    <nav aria-label="Primary" className="hidden items-center gap-1 text-sm md:flex">
      {items.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={
              // 768px is iPad portrait — a touch device reading a "desktop"
              // header — so these need the same 44px minimum as the tab bar,
              // and the same pressed state.
              "hm-tap flex min-h-11 items-center rounded-md px-2 " +
              "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-amber-500"
            }
          >
            <NavLabel active={active}>{n.label}</NavLabel>
          </Link>
        );
      })}
    </nav>
  );
}

// Separated from the Link only so it can read useLinkStatus(), which is
// scoped to the Link it sits inside. Same reason as BottomNav's TabFace: the
// highlight otherwise stays on the item you are leaving for the whole of the
// wait, which is precisely the moment it should have moved.
function NavLabel({ active, children }: { active: boolean; children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  const on = active || pending;
  return (
    <span
      className={
        on
          ? "font-semibold text-amber-600 dark:text-amber-400"
          : "text-zinc-600 hover:text-amber-600 dark:text-zinc-300 dark:hover:text-amber-400"
      }
    >
      {children}
    </span>
  );
}
