"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// The eight switches, the people they apply to, and the log that proves it.
//
// Each switch saves ON ITS OWN, immediately — the same rule as the consent
// screen, for the same reason: a batched form with a Save button lets someone
// turn sharing off, get distracted, and remain shared because they never
// pressed it. Revocation must never depend on a second action.
//
// The confirmation is asymmetric on purpose. Turning a share OFF happens
// instantly with no dialog, because that is the safe direction and a person
// switching it off may be in a hurry. Turning one ON asks first, because it is
// the direction that cannot be undone in the sense that matters — revocation
// hides the data again but does not unsee it.

interface ShareType {
  key: string;
  label: string;
  onMeans: string;
  offMeans: string;
  detail: boolean;
  default: boolean;
  shared: boolean;
  answeredAt: string | null;
  isStale: boolean;
}

interface Other {
  id: string;
  name: string;
  role: string;
}

interface Payload {
  policyVersion: string;
  memberId: string;
  household: { id: string; name: string; others: Other[] };
  types: ShareType[];
}

export default function SharingControls() {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/account/sharing")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setData(d);
        else setErr(d.error ?? "Could not load your sharing settings.");
      })
      .catch(() => setErr("Could not load your sharing settings."));
  }, []);

  useEffect(load, [load]);

  async function set(type: string, shared: boolean) {
    setBusy(type);
    setErr(null);
    setNote(null);
    setConfirming(null);
    // Optimistic: a toggle that lags reads as a failed revocation, and someone
    // who thinks a revocation failed will click again.
    setData((d) =>
      d ? { ...d, types: d.types.map((t) => (t.key === type ? { ...t, shared } : t)) } : d,
    );
    try {
      const r = await fetch("/api/account/sharing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, shared }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error ?? "Could not save that.");
      setNote([d.effect, d.retroactive].filter(Boolean).join(" "));
    } catch (e) {
      setData((d) =>
        d ? { ...d, types: d.types.map((t) => (t.key === type ? { ...t, shared: !shared } : t)) } : d,
      );
      setErr(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setBusy(null);
    }
  }

  async function revokeAll() {
    setBusy("__all");
    setErr(null);
    setNote(null);
    try {
      const r = await fetch("/api/account/sharing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revokeAll: true }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error ?? "Could not do that.");
      setNote(d.effect);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not do that.");
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return <p className="text-zinc-500">{err ?? "Loading…"}</p>;
  }

  const others = data.household.others;
  const sharedCount = data.types.filter((t) => t.shared).length;

  return (
    <div className="space-y-8">
      {/* ── Who "the household" is ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold">Shared with</h2>
        {others.length === 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Nobody. You are the only person in <strong>{data.household.name}</strong>, so nothing
            below is visible to anyone but you. These switches start mattering the moment someone
            accepts an invite.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Anything you switch on below is visible to these {others.length}{" "}
              {others.length === 1 ? "person" : "people"} in{" "}
              <strong>{data.household.name}</strong> — not to a subset, and not to anyone outside
              it:
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {others.map((o) => (
                <li
                  key={o.id}
                  className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium dark:bg-zinc-800"
                >
                  {o.name}
                  <span className="ml-1.5 font-normal text-zinc-500">{o.role}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-4 text-xs leading-relaxed text-zinc-500">
          You are sharing <strong>{sharedCount}</strong> of {data.types.length} kinds of data.
          Nobody else can change these switches — not an owner, not anyone. Only you.
        </p>
      </section>

      {note && (
        <p className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          {note}
        </p>
      )}
      {err && (
        <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
          {err}
        </p>
      )}

      {/* ── The eight switches ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold">What you share</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Each one saves the moment you change it. Turning something off applies to your existing
          records too, not only to new ones.
        </p>

        <div className="mt-4 space-y-3">
          {data.types.map((t) => {
            const isConfirming = confirming === t.key;
            return (
              <div
                key={t.key}
                className={
                  "rounded-xl border p-4 " +
                  (t.shared
                    ? "border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
                    : "border-zinc-200 dark:border-zinc-800")
                }
              >
                <div className="flex items-start gap-3">
                  <input
                    id={`share-${t.key}`}
                    type="checkbox"
                    checked={t.shared}
                    disabled={busy === t.key || busy === "__all"}
                    onChange={(e) => {
                      // ON asks first; OFF happens immediately. See the header.
                      if (e.target.checked) setConfirming(t.key);
                      else void set(t.key, false);
                    }}
                    className="mt-0.5 h-4 w-4 flex-none accent-amber-500 disabled:opacity-50"
                  />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`share-${t.key}`} className="text-sm font-medium">
                      {t.label}
                      {t.shared ? (
                        <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                          shared
                        </span>
                      ) : (
                        <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                          private
                        </span>
                      )}
                    </label>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {t.shared ? t.onMeans : t.offMeans}
                    </p>
                    {t.answeredAt === null && (
                      <p className="mt-1 text-[11px] text-zinc-400">
                        You have not changed this — it is the default.
                      </p>
                    )}
                  </div>
                </div>

                {isConfirming && (
                  <div className="mt-3 rounded-lg border border-amber-300 bg-white p-3 dark:border-amber-800 dark:bg-zinc-900">
                    <p className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                      <strong>Before you turn this on:</strong> {t.onMeans}{" "}
                      {others.length > 0 && (
                        <>
                          That means {others.map((o) => o.name).join(", ")} will be able to see it,
                          including records you entered before today.
                        </>
                      )}{" "}
                      You can switch it back off at any time, and that hides it again — but it does
                      not un-see what someone has already read.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void set(t.key, true)}
                        className="min-h-11 rounded-lg bg-amber-500 px-4 text-xs font-semibold text-white hover:bg-amber-600"
                      >
                        Share it
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="min-h-11 rounded-lg border border-zinc-300 px-4 text-xs font-medium dark:border-zinc-700"
                      >
                        Keep it private
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── What revocation does and does not do ───────────────────────── */}
      <section className="rounded-2xl border border-zinc-200 p-5 text-sm leading-relaxed dark:border-zinc-800">
        <h2 className="text-base font-semibold">When you stop sharing</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-zinc-600 dark:text-zinc-400">
          <li>
            <strong className="text-zinc-800 dark:text-zinc-200">Your history is hidden too.</strong>{" "}
            Switching something off is not only about what happens next — the records already there
            stop being visible to your household immediately.
          </li>
          <li>
            <strong className="text-zinc-800 dark:text-zinc-200">Nothing is deleted.</strong> Your
            records stay yours and stay in your own view. Hiding them from your household does not
            remove them from the app, and your own totals do not change.
          </li>
          <li>
            <strong className="text-zinc-800 dark:text-zinc-200">
              It cannot undo what was already read.
            </strong>{" "}
            If someone has seen a figure, they know it. No switch can take that back, and we will
            not pretend otherwise.
          </li>
          <li>
            <strong className="text-zinc-800 dark:text-zinc-200">
              Household money stays household money.
            </strong>{" "}
            A bill recorded against the household rather than against you is everyone&rsquo;s
            record, and it stays visible. These switches govern what is attributed to{" "}
            <em>you</em>.
          </li>
        </ul>
      </section>

      {/* ── The one-tap exit from sharing ──────────────────────────────── */}
      <section className="rounded-2xl border border-zinc-300 bg-zinc-50 p-5 dark:border-zinc-700 dark:bg-zinc-900/60">
        <h2 className="text-base font-semibold">Stop sharing everything</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          One action, no confirmation screen, effective immediately: every switch above goes off,
          including your history. Your records, your account and your household membership are all
          untouched — this only closes what your household can see.
        </p>
        <button
          type="button"
          onClick={() => void revokeAll()}
          disabled={busy === "__all"}
          className="mt-4 min-h-11 rounded-xl border-2 border-zinc-800 px-5 text-sm font-semibold hover:bg-zinc-800 hover:text-white disabled:opacity-50 dark:border-zinc-300 dark:hover:bg-zinc-100 dark:hover:text-zinc-900"
        >
          {busy === "__all" ? "Stopping…" : "Stop sharing everything"}
        </button>
        <p className="mt-3 text-xs text-zinc-500">
          Need to leave the household altogether, or do it discreetly?{" "}
          <Link href="/sharing/leave" className="font-medium text-amber-600 hover:underline">
            Leaving and safety
          </Link>
        </p>
      </section>
    </div>
  );
}
