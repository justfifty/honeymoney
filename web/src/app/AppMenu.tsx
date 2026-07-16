"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePwaInstall } from "./usePwaInstall";
import IosInstallGuide, { type IosGuideStrings } from "./IosInstallGuide";

export interface AppMenuLabels {
  menu: string;       // aria-label for the trigger
  goals: string;      // "Goals" — own savings targets
  learn: string;      // "Learn" — money quiz / academy
  setup: string;      // "Setup" — account, AI capture & install hub
  install: string;    // "Install app"
  installed: string;  // "App installed" (shown disabled when already standalone)
  iosGuide?: IosGuideStrings; // translated Add-to-Home-Screen steps
}

// The hamburger menu, shown at every size. On phones it's the *only* way to
// reach Dashboard/Records/Graph/Guide (the header's inline links are `hidden
// md:flex`); on desktop it sits alongside the inline nav and is the home for the
// menu-specific actions — AI Setup, Account, and Install.
export default function AppMenu({
  items,
  labels,
}: {
  items: { href: string; label: string }[];
  labels: AppMenuLabels;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const { canPrompt, isIos, iosNeedsSafari, installed, promptInstall } = usePwaInstall();
  const anyIos = isIos || iosNeedsSafari;
  const [iosOpen, setIosOpen] = useState(false);

  // Close on route change so the panel never lingers over the new page.
  useEffect(() => {
    setOpen(false);
    setIosOpen(false);
  }, [pathname]);

  // Close on Escape or a tap outside the menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  async function onInstall() {
    if (canPrompt) {
      await promptInstall();
      setOpen(false);
    } else if (anyIos) {
      setIosOpen((v) => !v); // reveal the manual Share steps inline
    }
  }

  const showInstall = !installed && (canPrompt || anyIos);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={labels.menu}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 hover:bg-amber-50 hover:text-amber-600 dark:text-zinc-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
          {open ? (
            <>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </>
          ) : (
            <>
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h16" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white/95 p-1.5 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95"
        >
          {items.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                role="menuitem"
                aria-current={active ? "page" : undefined}
                className={
                  "block rounded-lg px-3 py-2 text-sm " +
                  (active
                    ? "bg-amber-50 font-semibold text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800")
                }
              >
                {n.label}
              </Link>
            );
          })}

          <div className="my-1 border-t border-zinc-200/70 dark:border-zinc-800/70" />

          <Link
            href="/goals"
            role="menuitem"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <span aria-hidden="true">🎯</span> {labels.goals}
          </Link>

          <Link
            href="/learn"
            role="menuitem"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <span aria-hidden="true">🎓</span> {labels.learn}
          </Link>

          <Link
            href="/setup"
            role="menuitem"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <span aria-hidden="true">⚙️</span> {labels.setup}
          </Link>

          {showInstall && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={onInstall}
                aria-expanded={anyIos ? iosOpen : undefined}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
              >
                <span aria-hidden="true">⬇️</span> {labels.install}
              </button>
              {anyIos && iosOpen && (
                <div className="px-3 pb-2">
                  <IosInstallGuide needsSafari={iosNeedsSafari} showTitle={false} strings={labels.iosGuide} />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
