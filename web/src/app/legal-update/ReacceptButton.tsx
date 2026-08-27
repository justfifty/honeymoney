"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// The button that writes the acknowledgement.
//
// It sends NO body. What gets recorded is read from the consent ledger on the
// server and carried forward unchanged, so there is nothing here that could
// turn an optional purpose on — not by a bug, and not by anyone crafting a
// request. The only thing this button can do is say "I have seen the new
// version".
export default function ReacceptButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/account/reaccept", { method: "POST" });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Could not record that.");
      setDone(true);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not record that.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
        Recorded, with today&rsquo;s date. Your existing choices are unchanged — anything you had
        switched off is still off. Change any of them in{" "}
        <a href="/setup#privacy" className="underline underline-offset-2">
          Settings → Privacy
        </a>
        .
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={accept}
        disabled={busy}
        className="min-h-11 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
      >
        {busy ? "Recording…" : "I have read the updated documents"}
      </button>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
    </div>
  );
}
