"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Primary nav with the active tab highlighted in amber. Client component so it
// can read the current path; the server header passes translated labels in.
export default function HeaderNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-5 text-sm md:flex">
      {items.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "font-semibold text-amber-600 dark:text-amber-400"
                : "text-zinc-600 hover:text-amber-600 dark:text-zinc-300 dark:hover:text-amber-400"
            }
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
