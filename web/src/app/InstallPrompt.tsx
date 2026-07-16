"use client";

import { useEffect, useState } from "react";
import Logo from "./Logo";
import { usePwaInstall } from "./usePwaInstall";

// Custom, intent-driven PWA install prompt (design best practice): a small
// banner pinned to the bottom that offers "Add to Home Screen" — only when the
// app is installable and running in a browser tab (not already standalone).
// Platform detection + the deferred-event capture live in usePwaInstall(),
// shared with the header menu's Install item; this file owns only the banner's
// look and its "dismiss forever" memory.
const DISMISS_KEY = "hm-install-dismissed";

export default function InstallPrompt() {
  const { canPrompt, isIos, installed, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(true); // assume dismissed until we read storage (avoids SSR flash)

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  // Show only when there is a real install path and the user hasn't opted out.
  if (dismissed || installed || (!canPrompt && !isIos)) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-amber-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:inset-x-auto sm:right-4">
      <Logo size={24} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-zinc-900">Install HoneyMoney</p>
        {isIos ? (
          <p className="text-xs text-zinc-500">
            Tap{" "}
            <ShareGlyph />
            {" "}Share, then{" "}
            <span className="whitespace-nowrap font-medium text-zinc-700">
              &ldquo;Add to Home Screen&rdquo;
            </span>
            .
          </p>
        ) : (
          <p className="text-xs text-zinc-500">
            Add it to your home screen — works offline, no app store.
          </p>
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
  );
}

// The iOS Share glyph (square with an upward arrow) so the instruction points at
// the exact toolbar button, not just the word "Share".
function ShareGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 -translate-y-px align-text-bottom text-sky-600"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" />
    </svg>
  );
}
