"use client";

// Leave the page fast, and leave as little behind on the device as possible.
//
// This is the smallest, bluntest safety feature in the app and the one most
// likely to matter. Someone reading a page about leaving a shared household may
// need it off the screen in the time it takes for a door to open.
//
// What it does, in this order, because the order is the whole design:
//
//   1. Open a neutral site in THIS tab — not a new one. A new tab leaves the
//      old one behind it, which is worse than doing nothing.
//   2. Replace the history entry, so the Back button does not return here.
//   3. Clear this origin's local storage and caches on the way out, so a
//      re-opened tab does not restore the last view.
//
// It cannot clear browser history — no page can — and saying so plainly is part
// of the feature. A safety tool that overstates what it did is more dangerous
// than one that does less and is honest, because the person calibrates their
// behaviour to what they were told.
//
// Bound to the Escape key twice in a row as well as the button: a keyboard
// gesture is faster than finding a target with a mouse, and doubling it stops a
// single stray Escape from throwing away someone's work.

import { useEffect, useRef } from "react";

const NEUTRAL = "https://www.google.com";

export default function QuickExit() {
  const lastEsc = useRef(0);

  function bail() {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* private mode, or storage blocked — the navigation still happens */
    }
    try {
      if ("caches" in window) void caches.keys().then((ks) => ks.forEach((k) => void caches.delete(k)));
    } catch {
      /* no cache API — nothing to clear */
    }
    // replace(), not assign(): assign leaves this page in the back stack.
    window.location.replace(NEUTRAL);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const now = Date.now();
      if (now - lastEsc.current < 600) bail();
      lastEsc.current = now;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="rounded-2xl border-2 border-zinc-800 p-5 dark:border-zinc-300">
      <h2 className="text-base font-semibold">Quick exit</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Leaves HoneyMoney immediately for a neutral page, clears what this app has stored on this
        device, and stops the Back button returning here. Press <kbd>Esc</kbd> twice quickly to do
        the same thing without reaching for the button.
      </p>
      <button
        type="button"
        onClick={bail}
        className="mt-4 min-h-11 w-full rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-black dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        Leave this page now
      </button>
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        What it cannot do: clear your browser history, or remove HoneyMoney from your installed
        apps. No web page can do either. If someone may check this device, delete your browser
        history yourself, and consider using a private window or a different device.
      </p>
    </div>
  );
}
