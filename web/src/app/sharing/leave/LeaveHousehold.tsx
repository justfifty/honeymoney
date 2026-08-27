"use client";

import { useState } from "react";

// Leaving, and the two things a person needs before they do it: their data, and
// the truth about what the other people will be able to tell.
//
// The confirmation here is a single typed word rather than a checkbox chain. A
// chain of "are you sure?" screens is exactly wrong for this action — it is
// reversible (they can be re-invited), it is not destructive (no records are
// deleted), and the person using it may have very little time and no privacy.
// One deliberate step is enough to prevent an accident and short enough to
// finish while someone is out of the room.

export default function LeaveHousehold({ householdName }: { householdName: string }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function leave() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/household/leave", { method: "POST" });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error ?? "Could not leave.");
      setDone(d.effect ?? ["You have left the household."]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not leave.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Done.</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-emerald-900 dark:text-emerald-200">
          {done.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        <a
          href="/dashboard"
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Go to my dashboard
        </a>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Type <strong className="text-zinc-900 dark:text-zinc-100">LEAVE</strong> to remove yourself
        from <strong>{householdName}</strong>. It takes effect the moment you press the button —
        there is no waiting period and nobody has to approve it.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value.toUpperCase())}
          placeholder="LEAVE"
          aria-label="Type LEAVE to confirm"
          autoComplete="off"
          className="min-h-11 w-32 rounded-xl border border-zinc-300 px-3 text-sm tracking-widest dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="button"
          onClick={() => void leave()}
          disabled={typed !== "LEAVE" || busy}
          className="min-h-11 rounded-xl bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
        >
          {busy ? "Leaving…" : "Leave this household"}
        </button>
      </div>
      {err && (
        <p role="alert" className="mt-3 text-sm text-rose-600">
          {err}
        </p>
      )}
    </div>
  );
}
