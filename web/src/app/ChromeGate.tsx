"use client";

import { usePathname } from "next/navigation";

// Hides global chrome on routes that supply their own.
//
// /demo is a self-contained one-page app with its own bottom tab bar. Rendering
// the site-wide BottomNav underneath it doesn't just look wrong: the two fixed
// bars stack, and the global one sits on top and swallows every tap meant for
// the demo's tabs. The site footer has the same problem from the other end —
// it scrolls up underneath a fixed bar that covers it.
//
// The children are still rendered on the server; this only decides whether they
// reach the page. That is deliberate — it keeps the chrome components untouched
// and the rule in one readable place, rather than scattering pathname checks
// through every one of them.
export default function ChromeGate({
  hideOn,
  children,
}: {
  hideOn: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hidden = hideOn.some((h) => pathname === h || pathname.startsWith(`${h}/`));
  return hidden ? null : <>{children}</>;
}
