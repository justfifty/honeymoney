"use client";

import { useSyncExternalStore } from "react";

const KEY = "hm-hide-balances";
const ATTR = "data-hide-balances";

// One-tap "hide balances" for using the app in public. The actual blur is CSS
// (.hm-money in globals.css) keyed off a root attribute, so it covers every
// money value on the page without prop-drilling.
//
// SUBSCRIBES TO THE DOM RATHER THAN MIRRORING IT, for the same reason as
// ChartSchemePicker beside it. This used to read localStorage in a useEffect
// and setState, which runs after the first paint. BootPrefs now sets the
// attribute before any paint, so the blur itself is right immediately — but the
// BUTTON was still rendering from React state that had not caught up, so for a
// frame it offered "Hide balances" over balances that were already hidden. The
// control contradicting the screen is a small thing that reads as a broken
// toggle, and on this particular control the reader is already anxious about
// whether it worked.
//
// One source of truth, the document, read during render.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): boolean {
  return document.documentElement.getAttribute(ATTR) === "true";
}

// The server cannot know, and must not guess "hidden" — rendering the blurred
// state for a reader who never asked for it would look like a bug. BootPrefs
// corrects it before paint on the client.
function getServerSnapshot(): boolean {
  return false;
}

function setHidden(next: boolean) {
  document.documentElement.setAttribute(ATTR, String(next));
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    /* private mode, or site data blocked. The blur still applies to this page
       view; it just will not be remembered. Never let that throw mid-tap. */
  }
  for (const l of listeners) l();
}

export default function PrivacyToggle({ hideLabel, showLabel }: { hideLabel: string; showLabel: string }) {
  const hidden = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <button
      type="button"
      onClick={() => setHidden(!hidden)}
      aria-pressed={hidden}
      title={hidden ? showLabel : hideLabel}
      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
    >
      <span aria-hidden>{hidden ? "🙈" : "👁️"}</span>
      <span className="hidden sm:inline">{hidden ? showLabel : hideLabel}</span>
    </button>
  );
}
