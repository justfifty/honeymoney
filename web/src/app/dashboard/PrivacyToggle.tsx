"use client";

import { useEffect, useState } from "react";

const KEY = "hm-hide-balances";

// One-tap "hide balances" for using the app in public. Persists the choice and
// toggles a root attribute; the actual blur is CSS (.hm-money in globals.css),
// so it covers every money value on the page without prop-drilling.
export default function PrivacyToggle({ hideLabel, showLabel }: { hideLabel: string; showLabel: string }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(KEY) === "1";
    setHidden(stored);
    document.documentElement.dataset.hideBalances = String(stored);
  }, []);

  function toggle() {
    const next = !hidden;
    setHidden(next);
    document.documentElement.dataset.hideBalances = String(next);
    localStorage.setItem(KEY, next ? "1" : "0");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      title={hidden ? showLabel : hideLabel}
      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
    >
      <span aria-hidden>{hidden ? "🙈" : "👁️"}</span>
      <span className="hidden sm:inline">{hidden ? showLabel : hideLabel}</span>
    </button>
  );
}
