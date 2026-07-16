"use client";

import { useEffect, useState } from "react";

// Shared PWA-install state for both the auto-banner (InstallPrompt) and the
// header menu's "Install" item, so the platform detection + deferred-event
// capture live in one place instead of drifting between two copies.
//
// Two platforms, two paths:
//   • Android/Chromium — the browser fires `beforeinstallprompt`; we suppress
//     its own banner and keep the event so *our* UI can fire the native dialog.
//   • iOS Safari — never fires that event and offers no programmatic install,
//     so callers show the manual Share → "Add to Home Screen" steps instead.
interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// iOS reports iPad (since iPadOS 13) with a desktop-Mac UA, so also treat a
// touch-capable "Macintosh" as iOS. Third-party iOS browsers are all WebKit but
// only Safari's share sheet offers "Add to Home Screen", so we scope to Safari.
function isIosSafari() {
  const ua = navigator.userAgent;
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return iOS && safari;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS-only, non-standard: true when launched from the home screen.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export interface PwaInstall {
  /** Android/Chromium: a deferred prompt is ready — call promptInstall(). */
  canPrompt: boolean;
  /** iOS Safari: no programmatic install — show the manual Share steps. */
  isIos: boolean;
  /** Already running from the home screen — hide any install affordance. */
  installed: boolean;
  /** Fire the native install dialog. No-op unless canPrompt is true. */
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

export function usePwaInstall(): PwaInstall {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    if (isIosSafari()) setIsIos(true);

    const onBIP = (e: Event) => {
      e.preventDefault(); // suppress the browser's own mini-infobar
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function promptInstall() {
    if (!deferred) return "unavailable" as const;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // The event is single-use — drop it so the button can't fire a spent prompt.
    setDeferred(null);
    return outcome;
  }

  return { canPrompt: !!deferred, isIos, installed, promptInstall };
}
