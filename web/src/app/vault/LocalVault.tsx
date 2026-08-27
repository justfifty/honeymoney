"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  canPickLocation,
  chooseLocation,
  forgetLocation,
  getMeta,
  hasLocation,
  loadLocal,
  sync,
  vaultAvailable,
  type VaultMeta,
} from "@/lib/localVault";
import { analyseLocal, type LocalAnalysis } from "@/lib/localAnalysis";

// Choose where your records live, and read them with the network off.
//
// The screen is arranged around the one question a person has here — "is my
// copy current, and where is it?" — so the status is the first thing rendered
// and everything else is subordinate to it. A vault whose freshness you cannot
// see is a vault you will not trust in the moment you need it.

function money(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 0,
  }).format(n);
}

function ago(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

// Browser capabilities read through useSyncExternalStore rather than mirrored
// into state by an effect. They are external values that never change during a
// session, so there is nothing to subscribe to — but the hook is still the
// right tool: it gives a distinct server snapshot, which is what stops the
// server rendering "your browser can pick a folder" into HTML that then
// contradicts itself on an iPhone.
const NEVER_CHANGES = () => () => {};

export default function LocalVault() {
  // Server snapshots are the pessimistic answers: assume no picker so the
  // fallback copy is what gets rendered if JavaScript never arrives.
  const supported = useSyncExternalStore(NEVER_CHANGES, vaultAvailable, () => true);
  const picker = useSyncExternalStore(NEVER_CHANGES, canPickLocation, () => false);
  const [located, setLocated] = useState(false);
  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [analysis, setAnalysis] = useState<LocalAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setMeta(await getMeta());
    setLocated(await hasLocation());
    const snap = await loadLocal();
    setAnalysis(snap ? analyseLocal(snap) : null);
  }, []);

  useEffect(() => {
    // Reading IndexedDB is external-system synchronisation, and every setState
    // in `refresh` happens after an await. The rule cannot see across the async
    // boundary, so it is silenced with the reason rather than the code being
    // bent to satisfy it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function onChoose() {
    setMsg(null);
    const r = await chooseLocation();
    if (r.ok) {
      setMsg({ ok: true, text: `Your records will be kept in ${r.name}. Saving now…` });
      await onSync();
    } else if (r.reason) {
      setMsg({ ok: false, text: r.reason });
    }
    await refresh();
  }

  async function onSync() {
    setBusy(true);
    setMsg(null);
    const r = await sync({ interactive: true });
    setBusy(false);
    if (r.ok) {
      setMsg({
        ok: true,
        text: r.downloaded
          ? "Downloaded. Save it wherever you keep your records — Files, Drive, or a folder on this device."
          : `Saved ${r.meta?.records ?? 0} records to ${r.meta?.target}.`,
      });
    } else if (r.reason) {
      setMsg({ ok: false, text: r.reason });
    }
    await refresh();
  }

  async function onForget() {
    await forgetLocation();
    setMsg({ ok: true, text: "Location cleared. Your local copy in this browser is untouched." });
    await refresh();
  }

  if (!supported) {
    return (
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        This browser cannot store data locally, so a private-window or locked-down setting is
        probably in the way. Everything else in HoneyMoney still works — you can still export from{" "}
        <Link href="/setup#privacy" className="underline underline-offset-2">
          Settings
        </Link>
        .
      </p>
    );
  }

  const stale = meta ? Date.now() - new Date(meta.lastSyncAt).getTime() > 7 * 86400_000 : false;

  return (
    <div className="space-y-8">
      {/* ── Status ─────────────────────────────────────────────────────── */}
      <section
        className={
          "rounded-2xl border p-5 " +
          (meta
            ? stale
              ? "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20"
              : "border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20"
            : "border-zinc-200 dark:border-zinc-800")
        }
      >
        <h2 className="text-base font-semibold">Your copy</h2>
        {meta ? (
          <>
            <p className="mt-2 text-sm leading-relaxed">
              <strong>{meta.records}</strong> records ({(meta.bytes / 1024).toFixed(0)} kB), last
              saved <strong>{ago(meta.lastSyncAt)}</strong>
              {meta.mode === "handle" ? (
                <>
                  {" "}
                  to <strong>{meta.target}</strong>.
                </>
              ) : (
                <> as a download.</>
              )}
            </p>
            {stale && (
              <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
                That was over a week ago. Anything recorded since is not in your copy yet.
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            You do not have your own copy yet. Right now your records exist only on our server — if
            we disappeared tomorrow, so would they. Choose somewhere to keep them.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {picker && (
            <button
              type="button"
              onClick={onChoose}
              disabled={busy}
              className="min-h-11 rounded-xl bg-amber-500 px-5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {located ? "Change location" : "Choose where to keep it"}
            </button>
          )}
          <button
            type="button"
            onClick={onSync}
            disabled={busy}
            className="min-h-11 rounded-xl border border-zinc-300 px-5 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {busy ? "Saving…" : picker && located ? "Save now" : "Download a copy"}
          </button>
          {located && (
            <button
              type="button"
              onClick={onForget}
              disabled={busy}
              className="min-h-11 rounded-xl px-3 text-sm text-zinc-500 hover:underline disabled:opacity-50"
            >
              Forget location
            </button>
          )}
        </div>

        {msg && (
          <p
            className={
              "mt-3 text-sm " +
              (msg.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600 dark:text-rose-400")
            }
          >
            {msg.text}
          </p>
        )}

        {!picker && (
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            This browser cannot write to a folder you pick, so HoneyMoney hands you the file instead
            and your device asks where to put it — Files, iCloud Drive, Google Drive, or anywhere
            else. Safari and every browser on iPhone work this way. The difference is only that you
            choose the place each time rather than once.
          </p>
        )}
      </section>

      {/* ── Offline analysis ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold">What your copy says</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Worked out on this device from your own file. No network, no server, nothing sent
          anywhere — this section keeps working when everything else is offline.
        </p>

        {!analysis ? (
          <p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-700">
            Nothing stored on this device yet. Save a copy above and this fills in.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Records", String(analysis.transactions)],
                ["Money in", money(analysis.totalIn)],
                ["Money out", money(analysis.totalOut)],
                ["Net", money(analysis.net)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
                >
                  <p className="text-xs text-zinc-500">{label}</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>

            {analysis.lastScore && (
              <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <p className="text-sm">
                  <strong>Money Health Score {analysis.lastScore.score}</strong>{" "}
                  <span className="capitalize text-zinc-500">{analysis.lastScore.band}</span>
                </p>
                {/* Stated, not hidden. See localAnalysis.ts on why the score is
                    read from the snapshot rather than recomputed here. */}
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  Computed on our server {analysis.lastScore.at.slice(0, 10)} and stored in your
                  copy. It is not recalculated offline — one implementation of the score means one
                  number, so it refreshes when you are back online rather than showing you a second
                  version that might disagree.
                </p>
              </div>
            )}

            {analysis.buckets.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold">Spending by bucket</h3>
                <ul className="mt-2 space-y-1.5">
                  {analysis.buckets.slice(0, 8).map((b) => (
                    <li key={b.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate">{b.label}</span>
                      <span className="tabular-nums text-zinc-500">
                        {money(b.total)} <span className="text-xs">· {b.count}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.months.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold">By month</h3>
                <ul className="mt-2 space-y-1.5">
                  {analysis.months.slice(0, 6).map((m) => (
                    <li key={m.key} className="flex items-baseline justify-between gap-3 text-sm">
                      <span>{m.label}</span>
                      <span className="tabular-nums text-zinc-500">
                        in {money(m.inflow)} · out {money(m.outflow)} ·{" "}
                        <strong className={m.net < 0 ? "text-rose-600" : "text-emerald-600"}>
                          {money(m.net)}
                        </strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.topMerchants.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold">Where it went</h3>
                <ul className="mt-2 space-y-1.5">
                  {analysis.topMerchants.slice(0, 6).map((v) => (
                    <li key={v.label} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate">{v.label}</span>
                      <span className="tabular-nums text-zinc-500">
                        {money(v.total)} <span className="text-xs">· {v.count}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs leading-relaxed text-zinc-500">
              Covers {analysis.from?.slice(0, 10) ?? "—"} to {analysis.to?.slice(0, 10) ?? "—"}.
              {analysis.voided > 0 && ` ${analysis.voided} removed record(s) are not counted.`}
              {analysis.excluded > 0 &&
                ` ${analysis.excluded} record(s) were deliberately excluded from household totals.`}{" "}
              Your copy holds what you can see — a household member&rsquo;s private records are not
              in it, exactly as they are not on your screen.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
