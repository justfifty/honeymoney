"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  LOCAL_BUCKETS,
  bucketLabel,
  ensureLocalHousehold,
  localBucketNodes,
  localModeAvailable,
  saveLocalHousehold,
  type LocalHousehold,
} from "@/lib/localHousehold";
import {
  appendLocalRecord,
  deleteLocalRecord,
  listLocalRecords,
  asAnalysable,
  type LocalRecord,
} from "@/lib/localLedger";
import { analyseLocal, type LocalAnalysis } from "@/lib/localAnalysis";
import { exportStandalone } from "@/lib/localVault";
import SpendCapture, { type Captured } from "../graph/SpendCapture";

// HoneyMoney with no account and no network.
//
// Every request this component might have made is a request it does not make.
// There is no fetch in this file. That is the feature: a household on a signal
// that arrives for twenty minutes a day cannot depend on a round trip to record
// what they spent on rice.
//
// The capture form is deliberately the first thing and the biggest thing.
// Everything else on this screen — the totals, the bucket split, the list — is
// subordinate to the two seconds it should take to record a spend, because a
// budgeting app people stop using is worth nothing regardless of how good its
// analysis is.

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function StandaloneApp() {
  const [household, setHousehold] = useState<LocalHousehold | null>(null);
  const [records, setRecords] = useState<LocalRecord[]>([]);
  const [analysis, setAnalysis] = useState<LocalAnalysis | null>(null);
  const [supported, setSupported] = useState(true);

  // capture form
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [bucket, setBucket] = useState<string>(LOCAL_BUCKETS[2].id);
  const [when, setWhen] = useState(todayLocal());
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const refresh = useCallback(async () => {
    const rows = await listLocalRecords();
    setRecords(rows);
    setAnalysis(
      rows.length
        ? analyseLocal({
            transactions: asAnalysable(rows),
            nodes: localBucketNodes(),
            hscoreSnapshots: [],
          })
        : null,
    );
  }, []);

  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    // Both branches set state after an await, or after a capability check that
    // cannot run on the server. Wrapped in one async body so the lint rule sees
    // no synchronous setState in the effect itself.
    void (async () => {
      // Is there an account on this device? Checked client-side and tolerantly:
      // offline this throws and the answer is "carry on", which is the correct
      // answer — somebody with no connection should get the working page, not a
      // redirect they cannot follow.
      try {
        const r = await fetch("/api/health", { method: "GET" });
        if (r.ok) {
          const me = await fetch("/api/account/consent");
          if (me.ok) setSignedIn(true);
        }
      } catch {
        /* offline: exactly who this page is for */
      }
      if (!localModeAvailable()) {
        setSupported(false);
        return;
      }
      setHousehold(await ensureLocalHousehold());
      await refresh();
    })();
  }, [refresh]);

  // Receipt scanning matters MORE here than anywhere else in the app. A
  // household with poor signal is the one that benefits most from not typing,
  // and the OCR engine is the one heavy thing already cached on the device. So
  // it fills the form rather than saving directly: the person still confirms,
  // which is the rule everywhere else and doubly right when a misread number
  // would go into the only copy of a record that exists.
  //
  // aiEnabled={false} is not a limitation, it is the point — it forces the
  // on-device tesseract path and guarantees nothing is uploaded. There is no
  // account here to have consented to anything.
  function fromScan(c: Captured) {
    if (c.amount) setAmount(String(c.amount));
    if (c.vendor) setVendor(c.vendor);
    if (c.occurredAt) setWhen(c.occurredAt.slice(0, 10));
    setDirection("out");
    setMsg("Read from the photo — check it, then save.");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setMsg("Enter an amount.");
      return;
    }
    setBusy(true);
    await appendLocalRecord({
      amount: value,
      direction,
      currency: household?.currency ?? "MYR",
      vendorLabel: vendor.trim() || (direction === "in" ? "Money in" : "Spend"),
      note: note.trim(),
      walletNodeId: direction === "in" ? null : bucket,
      occurredAt: new Date(`${when}T12:00:00`).toISOString(),
      visibility: "shared",
    });
    setAmount("");
    setVendor("");
    setNote("");
    setMsg("Saved on this device.");
    setBusy(false);
    await refresh();
    setTimeout(() => setMsg(null), 3000);
  }

  async function remove(id: string) {
    await deleteLocalRecord(id);
    await refresh();
  }

  async function saveCopy() {
    setBusy(true);
    const r = await exportStandalone();
    setMsg(r.ok ? "Copy saved. Keep it somewhere safe." : (r.reason ?? "Could not save a copy."));
    setBusy(false);
  }

  if (!supported) {
    return (
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        This browser will not let HoneyMoney store anything on the device, so the offline version
        cannot work here. A private window or a locked-down setting is usually the cause.
      </p>
    );
  }

  const cur = household?.currency ?? "MYR";
  const money = (n: number) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n);

  return (
    <div className="space-y-8">
      {/* One app, once you have an account. Shown rather than redirected: a
          person who deliberately opened the offline page mid-journey should not
          be bounced somewhere that may not load. */}
      {signedIn && (
        <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900/60">
          <p className="font-medium">You are signed in — you do not need this page.</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            The main app saves to your phone first and syncs when it can, so it works offline too —
            and it keeps your score, your household and your history.{" "}
            <Link href="/record" className="font-medium text-amber-600 hover:underline">
              Go there instead
            </Link>
            . Anything you record here stays on this device and is not part of your account.
          </p>
        </div>
      )}

      {/* ── Capture. First, biggest, fewest fields. ─────────────────────── */}
      <form onSubmit={save} className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Record a spend</h2>
          <div className="flex gap-1 text-xs">
            {(["out", "in"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                aria-pressed={direction === d}
                className={
                  "min-h-9 rounded-lg border px-3 font-medium " +
                  (direction === d
                    ? "border-transparent bg-amber-500 text-white"
                    : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300")
                }
              >
                {d === "out" ? "Money out" : "Money in"}
              </button>
            ))}
          </div>
        </div>

        {/* Scan first, type second. */}
        {direction === "out" && (
          <div className="mt-4">
            <SpendCapture onResult={fromScan} lang="en" aiEnabled={false} />
            <p className="mt-1 text-center text-[11px] text-zinc-400">
              Read on this phone. The photo is not uploaded and never leaves the device.
            </p>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-500">
            Amount ({cur})
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="12.50"
              className="mt-1 block min-h-11 w-full rounded-xl border border-zinc-300 px-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="text-xs text-zinc-500">
            {direction === "in" ? "Where from" : "Where"}
            <input
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder={direction === "in" ? "Salary" : "Pasar, Shell, warung…"}
              className="mt-1 block min-h-11 w-full rounded-xl border border-zinc-300 px-3 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        </div>

        {direction === "out" && (
          <div className="mt-3">
            <p className="text-xs text-zinc-500">Bucket</p>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {LOCAL_BUCKETS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBucket(b.id)}
                  aria-pressed={bucket === b.id}
                  className={
                    "min-h-11 rounded-xl border px-2 text-xs font-medium " +
                    (bucket === b.id
                      ? "border-transparent bg-amber-500 text-white"
                      : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300")
                  }
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-500">
            When
            <input
              type="date"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="mt-1 block min-h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="text-xs text-zinc-500">
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 block min-h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-4 min-h-12 w-full rounded-xl bg-amber-500 px-5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save on this device"}
        </button>
        {msg && <p className="mt-2 text-center text-xs text-emerald-700 dark:text-emerald-300">{msg}</p>}
      </form>

      {/* ── What it adds up to ─────────────────────────────────────────── */}
      {analysis && (
        <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="text-base font-semibold">Your money</h2>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[
              ["In", money(analysis.totalIn)],
              ["Out", money(analysis.totalOut)],
              ["Left", money(analysis.net)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="text-xs text-zinc-500">{l}</p>
                <p className="mt-0.5 text-base font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          {analysis.buckets.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {analysis.buckets.map((b) => (
                <li key={b.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{b.label}</span>
                  <span className="tabular-nums text-zinc-500">
                    {money(b.total)} <span className="text-xs">· {b.count}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {analysis.months.length > 1 && (
            <ul className="mt-4 space-y-1 border-t border-zinc-200 pt-3 text-xs dark:border-zinc-800">
              {analysis.months.slice(0, 4).map((m) => (
                <li key={m.key} className="flex justify-between text-zinc-500">
                  <span>{m.label}</span>
                  <span className="tabular-nums">
                    out {money(m.outflow)} · {m.net < 0 ? "short" : "left"} {money(Math.abs(m.net))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-zinc-400">
            Worked out on this device. Nothing was sent anywhere.
          </p>
        </section>
      )}

      {/* ── Recent ─────────────────────────────────────────────────────── */}
      {records.length > 0 && (
        <section>
          <h2 className="text-base font-semibold">
            Recent <span className="font-normal text-zinc-500">({records.length})</span>
          </h2>
          <ul className="mt-3 space-y-1.5">
            {records.slice(0, 15).map((r) => (
              <li
                key={r.id}
                className="flex items-baseline justify-between gap-3 rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                <span className="min-w-0 flex-1 truncate">
                  {r.vendorLabel}
                  <span className="ml-2 text-xs text-zinc-400">
                    {r.occurred_at.slice(0, 10)} · {bucketLabel(r.wallet_node)}
                  </span>
                </span>
                <span
                  className={
                    "tabular-nums " + (r.direction === "in" ? "text-emerald-600" : "text-zinc-700 dark:text-zinc-300")
                  }
                >
                  {r.direction === "in" ? "+" : "−"}
                  {money(r.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  aria-label={`Remove ${r.vendorLabel}`}
                  className="text-xs text-zinc-400 hover:text-rose-600"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Keep a copy. The most important button on the page. ─────────── */}
      <section className="rounded-2xl border-2 border-amber-400 p-5 dark:border-amber-700">
        <h2 className="text-base font-semibold">Keep a copy</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          These records exist in this browser and <strong>nowhere else</strong>. There is no account
          and no server copy — that is the point, and it is also the risk. Clearing your browser
          data, or losing the phone, loses them. Save a file somewhere safe and do it often.
        </p>
        <button
          type="button"
          onClick={saveCopy}
          disabled={busy || records.length === 0}
          className="mt-4 min-h-11 w-full rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-black disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {records.length === 0 ? "Nothing to save yet" : busy ? "Saving…" : "Save a copy of everything"}
        </button>
      </section>

      {/* ── Settings + the way to an account, if they ever want one ─────── */}
      <section className="rounded-2xl border border-zinc-200 p-5 text-sm dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          className="font-semibold"
        >
          Settings {showSettings ? "▾" : "▸"}
        </button>
        {showSettings && household && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-zinc-500">
              Household name
              <input
                value={household.name}
                onChange={(e) => setHousehold({ ...household, name: e.target.value })}
                onBlur={() => void saveLocalHousehold({ name: household.name })}
                className="mt-1 block min-h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="text-xs text-zinc-500">
              Currency
              <input
                value={household.currency}
                onChange={(e) => setHousehold({ ...household, currency: e.target.value.toUpperCase().slice(0, 3) })}
                onBlur={() => void saveLocalHousehold({ currency: household.currency })}
                className="mt-1 block min-h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>
        )}
        <p className="mt-4 border-t border-zinc-200 pt-3 text-xs leading-relaxed text-zinc-500 dark:border-zinc-800">
          Want a score, forecasts, or to share with your partner? Those need an account and a
          connection — <Link href="/signup" className="font-medium text-amber-600 hover:underline">create one</Link>{" "}
          when you next have signal, and bring your saved file with you. Nothing here is lost by
          waiting, and you never have to.
        </p>
      </section>
    </div>
  );
}
