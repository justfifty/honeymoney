"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t as translate, type Locale } from "@/lib/i18n";
import { fmtMoney } from "@/lib/format";
import type { SpendRecord } from "@/lib/records";

interface Bucket {
  id: string;
  label: string;
}

interface LedgerEntry {
  seq: number;
  op: string;
  actor: string;
  at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

// One spend, with the three things the app never had: correct it, remove it, and
// see everything that has ever happened to it.
//
// "Remove" does not delete. It voids: the row stays, struck through, and both the
// void and any later restore are appended to the hash-chained ledger. That is
// what "records can be changed, but every change is recorded" means in practice.
export default function RecordRow({
  record,
  buckets,
  canEdit,
  canVoid,
  ccy,
  lang,
}: {
  record: SpendRecord;
  buckets: Bucket[];
  canEdit: boolean;
  canVoid: boolean;
  ccy: string;
  lang: Locale;
}) {
  const tr = (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars);
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<LedgerEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [vendor, setVendor] = useState(record.vendor ?? "");
  const [amount, setAmount] = useState(String(record.amount));
  const [bucket, setBucket] = useState(record.bucketId ?? buckets[0]?.id ?? "");
  const [when, setWhen] = useState(record.occurred_at.slice(0, 10));
  const [note, setNote] = useState(record.note ?? "");

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/transactions/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorLabel: vendor,
          amount: Number(amount),
          walletNodeId: bucket,
          occurredAt: when ? new Date(`${when}T12:00:00`).toISOString() : undefined,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? tr("rec.edit.failed"));
      setEditing(false);
      setHistory(null); // it changed — any history we cached is now stale
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr("rec.edit.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleVoid() {
    // Voiding is reversible and fully logged, so it doesn't need a scary modal —
    // but it does change the household's totals, so we still ask.
    if (!record.voided && !confirm(tr("rec.void.confirm"))) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/transactions/${record.id}${record.voided ? "?undo=1" : ""}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? tr("rec.void.failed"));
      setHistory(null);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr("rec.void.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory() {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    if (history) return;
    try {
      const res = await fetch(`/api/transactions/${record.id}`);
      const data = await res.json();
      if (res.ok) setHistory(data.history ?? []);
    } catch {
      setHistory([]);
    }
  }

  const field =
    "rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-sm text-inherit outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900";

  if (editing) {
    return (
      <div className="border-b border-zinc-50 bg-amber-50/40 px-4 py-3 dark:border-zinc-800/60 dark:bg-amber-950/10">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-36 flex-1 flex-col gap-1 text-[10px] text-zinc-500">
            {tr("g.input.whereSpend")}
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} className={field} />
          </label>
          <label className="flex w-24 flex-col gap-1 text-[10px] text-zinc-500">
            RM
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={field}
            />
          </label>
          <label className="flex w-36 flex-col gap-1 text-[10px] text-zinc-500">
            {tr("g.input.when")}
            <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} className={field} />
          </label>
          <label className="flex min-w-32 flex-col gap-1 text-[10px] text-zinc-500">
            {tr("g.input.fromBucket")}
            <select value={bucket} onChange={(e) => setBucket(e.target.value)} className={field}>
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-32 flex-1 flex-col gap-1 text-[10px] text-zinc-500">
            {tr("g.input.note")}
            <input value={note} onChange={(e) => setNote(e.target.value)} className={field} />
          </label>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {busy ? "…" : tr("rec.edit.save")}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setErr(null);
            }}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {tr("rec.edit.cancel")}
          </button>
        </div>
        <p className="mt-2 text-[10px] text-zinc-400">🔒 {tr("rec.edit.audited")}</p>
        {err && <p className="mt-1 text-[11px] text-rose-600">⚠️ {err}</p>}
      </div>
    );
  }

  return (
    <div className="border-b border-zinc-50 last:border-0 dark:border-zinc-800/60">
      <div className="group flex items-center justify-between px-4 py-2.5 text-sm">
        <div className="min-w-0">
          <span className={`font-medium ${record.voided ? "text-zinc-400 line-through" : ""}`}>
            {record.vendor ?? tr("rec.unknownVendor")}
          </span>
          <span className="ml-2 text-xs text-zinc-400">{stamp(record.occurred_at)}</span>
          {record.voided && (
            <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {tr("rec.void.badge")}
            </span>
          )}
          {record.note && <span className="ml-2 text-xs italic text-zinc-400">{record.note}</span>}
          {record.entered && (
            <span className="ml-2 text-[10px] text-zinc-400">
              {tr("rec.paidIn", {
                amount: record.entered.amount,
                currency: record.entered.currency,
                source: record.entered.rateSource,
              })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {record.source && (
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
              {record.source}
            </span>
          )}
          <span className={`font-medium ${record.voided ? "text-zinc-400 line-through" : ""}`}>
            {fmtMoney(record.amount, ccy)}
          </span>

          {/* Actions stay dim until hover/focus so a long list still reads as a
              list, not a wall of buttons — but they're always keyboard-reachable. */}
          <span className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={loadHistory}
              title={tr("rec.history.title")}
              className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
            >
              🕘
            </button>
            {canEdit && !record.voided && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                title={tr("rec.edit.title")}
                className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
              >
                ✏️
              </button>
            )}
            {canVoid && (
              <button
                type="button"
                onClick={toggleVoid}
                disabled={busy}
                title={record.voided ? tr("rec.void.restore") : tr("rec.void.title")}
                className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-950/30"
              >
                {record.voided ? "↩️" : "🗑️"}
              </button>
            )}
          </span>
        </div>
      </div>

      {err && <p className="px-4 pb-2 text-[11px] text-rose-600">⚠️ {err}</p>}

      {showHistory && (
        <div className="border-t border-zinc-100 bg-zinc-50/60 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            {tr("rec.history.title")}
          </p>
          {history === null && <p className="text-[11px] text-zinc-400">…</p>}
          {history?.length === 0 && <p className="text-[11px] text-zinc-400">{tr("rec.history.empty")}</p>}
          {history?.map((h) => (
            <p key={h.seq} className="text-[11px] text-zinc-500">
              <span className="font-mono text-zinc-400">#{h.seq}</span>{" "}
              <span className="font-medium">{tr(`rec.history.op.${h.op}`)}</span> ·{" "}
              {new Date(h.at).toLocaleString("en-MY", {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              · {h.actor}
              {h.op === "update" && <Diff before={h.before} after={h.after} />}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// Show only what actually moved. A full before/after dump of every field is
// noise; "amount: 99 → 12" is the thing the reader came for.
function Diff({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  if (!before || !after) return null;
  const WATCH = ["amount", "occurred_at", "note", "wallet_node", "vendor_node", "member"];
  const changes = WATCH.filter((k) => String(before[k] ?? "") !== String(after[k] ?? "")).map(
    (k) => `${k}: ${String(before[k] ?? "—")} → ${String(after[k] ?? "—")}`,
  );
  if (!changes.length) return null;
  return <span className="ml-1 font-mono text-[10px] text-zinc-400">({changes.join(", ")})</span>;
}

function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-MY", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
