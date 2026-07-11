"use client";

import { useEffect, useState } from "react";
import Logo from "./Logo";

// Custom, intent-driven PWA install prompt (design best practice): capture
// beforeinstallprompt, prevent the default banner, and offer our own button —
// only when the app is installable and running in a browser tab (not standalone).
interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "hm-install-dismissed";

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return; // already installed
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  if (!deferred) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDeferred(null);
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-amber-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:inset-x-auto sm:right-4">
      <Logo size={24} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-zinc-900">Install HoneyMoney</p>
        <p className="text-xs text-zinc-500">Add it to your home screen — works offline, no app store.</p>
      </div>
      <button
        type="button"
        onClick={install}
        className="rounded-full bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-600"
      >
        Install
      </button>
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
