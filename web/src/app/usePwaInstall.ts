"use client";

import { useEffect, useState } from "react";

// Shared PWA-install state for both the auto-banner (InstallPrompt) and the
// header menu's "Install" item, so the platform detection + deferred-event
// capture live in one place instead of drifting between two copies.
//
// Three platforms, three paths:
//   • Android/Chromium — the browser fires `beforeinstallprompt`; we suppress
//     its own banner and keep the event so *our* UI can fire the native dialog.
//   • iOS Safari — never fires that event and offers no programmatic install,
//     so callers show the manual Share → "Add to Home Screen" steps.
//   • iPhone/iPad NOT in Safari (Chrome/Firefox/Edge for iOS, or an in-app
//     webview like Telegram/WhatsApp/Instagram) — "Add to Home Screen" isn't
//     reliably offered there, so callers tell the user to open it in Safari.
interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// iOS reports iPad (since iPadOS 13) with a desktop-Mac UA, so also treat a
// touch-capable "Macintosh" as iOS.
function isIosDevice(ua: string) {
  return /iPad|iPhone|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
}

// Every iOS browser is WebKit, but only Safari's share sheet offers "Add to
// Home Screen". CriOS/FxiOS/EdgiOS/OPiOS are Chrome/Firefox/Edge/Opera for iOS;
// GSA is the Google app. Anything else on iOS that isn't Safari is most likely
// an in-app webview, where installing is impossible.
function isIosSafari(ua: string) {
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(ua);
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
  /** iPhone/iPad, but not in Safari — tell the user to open it in Safari. */
  iosNeedsSafari: boolean;
  /** Already running from the home screen — hide any install affordance. */
  installed: boolean;
  /** Fire the native install dialog. No-op unless canPrompt is true. */
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

export function usePwaInstall(): PwaInstall {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [iosNeedsSafari, setIosNeedsSafari] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    const ua = navigator.userAgent;
    if (isIosDevice(ua)) {
      if (isIosSafari(ua)) setIsIos(true);
      else setIosNeedsSafari(true);
    }

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

  return { canPrompt: !!deferred, isIos, iosNeedsSafari, installed, promptInstall };
}
