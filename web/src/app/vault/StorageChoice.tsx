"use client";

import { useCallback, useEffect, useState } from "react";
import { getMeta } from "@/lib/localVault";

// The cloud-optional switch, and the consent it needs to be worth anything.
//
// ── WHY THIS SCREEN IS SHAPED LIKE A WARNING ───────────────────────────────
//
// Every other privacy control in this app is safe to press: revoking a share
// hides data, leaving a household drops a membership, and both are reversible
// in the sense that matters. This one deletes records off our server and we do
// not keep a copy. It is the only irreversible privacy control here, so it is
// the only one that argues with you before it works.
//
// The costs are rendered from lib/storageMode.ts verbatim, not paraphrased
// here. A UI that summarised them would drift from the list the server stamps
// against the decision as `policy_version`, and then the evidence of what
// somebody was told would no longer match what they were shown.
//
// The confirmation is a typed phrase rather than a checkbox for the same reason
// the API demands one: a checkbox is a thing you tick past.

interface ModeSpec {
  key: string;
  label: string;
  summary: string;
  costs: string[];
  gains: string[];
}

interface State {
  mode: string;
  since: string | null;
  purgedAt: string | null;
  purgedRecords: number;
  serverRecords: number;
  canChange: boolean;
  modes: ModeSpec[];
}

export default function StorageChoice() {
  const [state, setState] = useState<State | null>(null);
  const [opening, setOpening] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const [copyAt, setCopyAt] = useState<string | null>(null);
  const [copyRecords, setCopyRecords] = useState(0);
  // Freshness is decided when the copy is READ, not while rendering. Calling
  // Date.now() in render makes the output depend on when React happened to
  // paint, which is exactly the impurity that breaks hydration and re-renders.
  const [copyFresh, setCopyFresh] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetch("/api/account/storage-mode").then((r) => r.json());
      if (d.ok) setState(d);
    } catch {
      /* offline: the switch is unusable anyway, and the vault above still works */
    }
    const m = await getMeta();
    setCopyAt(m?.lastSyncAt ?? null);
    setCopyRecords(m?.records ?? 0);
    setCopyFresh(
      Boolean(m?.lastSyncAt) && Date.now() - new Date(m!.lastSyncAt).getTime() < 24 * 3600_000,
    );
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function choose(mode: string) {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/account/storage-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          confirm: mode === "local_only" ? typed : undefined,
          localCopy: { at: copyAt, records: copyRecords },
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setResult({ ok: false, lines: [d.error ?? "Could not change that."] });
      } else {
        setResult({ ok: true, lines: d.effect ?? ["Done."] });
        setOpening(false);
        setTyped("");
      }
    } catch (e) {
      setResult({ ok: false, lines: [e instanceof Error ? e.message : "Could not change that."] });
    } finally {
      setBusy(false);
      await load();
    }
  }

  if (!state) return null;

  const local = state.mode === "local_only";
  const localSpec = state.modes.find((m) => m.key === "local_only");
  const copyCovers = copyRecords >= state.serverRecords;
  const ready = copyFresh && copyCovers;

  return (
    <section
      className={
        "rounded-2xl border p-5 " +
        (local
          ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20"
          : "border-zinc-200 dark:border-zinc-800")
      }
    >
      <h2 className="text-base font-semibold">Where your records are kept</h2>

      {local ? (
        <>
          <p className="mt-2 text-sm leading-relaxed">
            <strong>On your own devices only.</strong> We deleted{" "}
            {state.purgedRecords > 0 ? `${state.purgedRecords} records ` : "your records "}
            from our server
            {state.purgedAt ? ` on ${state.purgedAt.slice(0, 10)}` : ""} and do not have a copy.
            New records are stored on this device and in the file you chose; the server refuses to
            write them.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Your H-Score, forecasts, household sharing and Ask Honey are off, because those are
            computed from records we no longer have.
          </p>
          {state.canChange && (
            <button
              type="button"
              onClick={() => choose("cloud")}
              disabled={busy}
              className="mt-4 min-h-11 rounded-xl border border-zinc-300 px-5 text-sm font-semibold hover:bg-white disabled:opacity-50 dark:border-zinc-700"
            >
              {busy ? "Switching…" : "Store on the server again"}
            </button>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            On our server in Singapore, where we can read them — that is what lets us compute your
            H-Score and resolve what your household sees. You currently have{" "}
            <strong>{state.serverRecords}</strong> records there.
          </p>

          {!state.canChange ? (
            <p className="mt-3 text-xs text-zinc-500">
              Only a household owner can change this, because it applies to everyone in the
              household at once.
            </p>
          ) : !opening ? (
            <button
              type="button"
              onClick={() => setOpening(true)}
              className="mt-4 min-h-11 rounded-xl border border-zinc-300 px-5 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Keep them on my devices instead
            </button>
          ) : (
            <div className="mt-4 rounded-xl border-2 border-amber-400 p-4 dark:border-amber-700">
              <p className="text-sm font-semibold">Before you do this</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {localSpec?.summary}
              </p>

              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-rose-600">
                What stops working
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                {localSpec?.costs.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>

              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                What you get
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                {localSpec?.gains.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>

              {/* The gate. Stated as a fact about their copy, not as an error,
                  because at this point they have not done anything wrong. */}
              <div
                className={
                  "mt-4 rounded-lg border p-3 text-xs leading-relaxed " +
                  (ready
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                    : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200")
                }
              >
                {ready ? (
                  <>
                    ✓ Your local copy holds {copyRecords} records and was saved{" "}
                    {copyAt?.slice(0, 10)}. That covers the {state.serverRecords} on the server.
                  </>
                ) : (
                  <>
                    Save a fresh copy first — use the buttons above. We will not delete the
                    server&rsquo;s records until you hold a copy from the last 24 hours covering all{" "}
                    {state.serverRecords} of them.
                    {copyAt && ` Yours holds ${copyRecords}, saved ${copyAt.slice(0, 10)}.`}
                  </>
                )}
              </div>

              <label className="mt-4 block text-xs text-zinc-600 dark:text-zinc-400">
                Type <strong>DELETE FROM SERVER</strong> to confirm
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value.toUpperCase())}
                  disabled={!ready}
                  autoComplete="off"
                  className="mt-1 block min-h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm tracking-wide disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => choose("local_only")}
                  disabled={!ready || typed !== "DELETE FROM SERVER" || busy}
                  className="min-h-11 rounded-xl bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
                >
                  {busy ? "Deleting…" : "Delete from server, keep on my devices"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpening(false);
                    setTyped("");
                  }}
                  className="min-h-11 rounded-xl border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {result && (
        <ul
          className={
            "mt-4 list-disc space-y-1 rounded-xl border p-4 pl-8 text-sm leading-relaxed " +
            (result.ok
              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
              : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300")
          }
        >
          {result.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
