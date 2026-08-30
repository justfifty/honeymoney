"use client";

import { useEffect, useState } from "react";
import Logo from "./Logo";
import { usePwaInstall } from "./usePwaInstall";
import IosInstallGuide from "./IosInstallGuide";

// Custom, intent-driven PWA install prompt (design best practice): a small
// banner pinned to the bottom that offers "Add to Home Screen" — only when the
// app is installable and running in a browser tab (not already standalone).
// Platform detection lives in usePwaInstall(); this file owns the banner's look
// and its "dismiss forever" memory. On iOS there's no install API, so we show
// the manual Share steps (or, off-Safari, tell the user to open it in Safari).
const DISMISS_KEY = "hm-install-dismissed";

export default function InstallPrompt() {
  const { canPrompt, isIos, iosNeedsSafari, installed, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(true); // assume dismissed until we read storage (avoids SSR flash)

  // NOT SHOWN UNTIL THE VISITOR HAS SEEN SOMETHING.
  //
  // This appeared the instant the page did, and on the landing page it is
  // bottom-right of a hero whose whole job is one product visual — so a
  // first-time visitor's first impression was a card asking them to install an
  // app they had not yet been shown. Measured on both 1440x900 and 390x844: the
  // banner overlapped the Sankey in both.
  //
  // Waiting for one viewport of scroll makes it an offer to somebody who has
  // demonstrated interest rather than an interruption of the pitch. The timer
  // is the fallback for a fold that fits without scrolling — a short page, or a
  // desktop window tall enough that there is nothing to scroll past.
  const [engaged, setEngaged] = useState(false);
  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");

    const check = () => {
      if (window.scrollY > window.innerHeight * 0.6) {
        setEngaged(true);
        window.removeEventListener("scroll", check);
      }
    };
    window.addEventListener("scroll", check, { passive: true });
    const timer = window.setTimeout(() => setEngaged(true), 20_000);
    // No initial synchronous check. A page restored mid-scroll fires `scroll`
    // on the first movement, and the timer covers a fold with nothing to scroll
    // past — so the subscription is the only thing that ever sets state, which
    // is the shape the effect is meant to have.
    return () => {
      window.removeEventListener("scroll", check);
      window.clearTimeout(timer);
    };
  }, []);

  const anyIos = isIos || iosNeedsSafari;
  // Show only when there is a real install path and the user hasn't opted out.
  if (dismissed || !engaged || installed || (!canPrompt && !anyIos)) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    // Sits ABOVE the bottom tab bar, not on top of it. At `bottom-3` this banner
    // — z-50, and the full width of a phone — covered the whole of BottomNav
    // (fixed, bottom-0, z-40) and swallowed every tap meant for Record,
    // Dashboard, Graph, H-Score and More. Anyone who hadn't dismissed it was
    // stranded on whatever page they landed on, which on a phone is /record.
    // On iOS it is worse: the Add-to-Home-Screen steps render inside it, so it
    // is several rows tall and also covers the form. The offset clears the bar
    // (3.5rem) plus the home indicator, and collapses back to bottom-3 from md
    // up where BottomNav is hidden.
    <div className="fixed inset-x-3 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-50 mx-auto max-w-md rounded-2xl border border-amber-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:inset-x-auto sm:right-4 md:bottom-3 dark:border-amber-900 dark:bg-zinc-900/95">
      <div className="flex items-center gap-3">
        <Logo size={24} />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">Install HoneyMoney</p>
          {!anyIos && (
            <p className="text-xs text-zinc-500">Add it to your home screen — works offline, no app store.</p>
          )}
        </div>
        {canPrompt && (
          <button
            type="button"
            onClick={() => promptInstall()}
            className="rounded-full bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-600"
          >
            Install
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded-full px-2 py-1 text-zinc-400 hover:text-zinc-600"
        >
          ✕
        </button>
      </div>
      {anyIos && (
        <div className="mt-2 border-t border-zinc-200/70 pt-2 dark:border-zinc-800/70">
          <IosInstallGuide needsSafari={iosNeedsSafari} showTitle={false} />
        </div>
      )}
    </div>
  );
}
