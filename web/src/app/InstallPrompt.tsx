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

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const anyIos = isIos || iosNeedsSafari;
  // Show only when there is a real install path and the user hasn't opted out.
  if (dismissed || installed || (!canPrompt && !anyIos)) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-amber-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:inset-x-auto sm:right-4 dark:border-amber-900 dark:bg-zinc-900/95">
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
