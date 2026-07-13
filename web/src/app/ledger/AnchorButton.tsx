"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AnchorButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function anchor() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/ledger/anchor", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not anchor the ledger.");
      setMsg({
        ok: data.ok,
        text: data.ok
          ? "Submitted. A Bitcoin block will confirm it within a few hours — the proof is downloadable now."
          : (data.anchor?.detail ?? "The timestamping calendars couldn't be reached."),
      });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not anchor the ledger." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={anchor}
        disabled={busy || disabled}
        title={disabled ? "The chain is broken — fix that before anchoring it." : undefined}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {busy ? "Anchoring…" : "⛓️ Anchor now"}
      </button>
      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>
          {msg.ok ? "✅ " : "⚠️ "}
          {msg.text}
        </p>
      )}
    </div>
  );
}
