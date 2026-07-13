"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";
import { CURRENCIES, rateFor, toMYR } from "@/lib/format";
import SpendCapture, { type CaptureAnalysis, type Captured } from "../graph/SpendCapture";

interface BucketOption {
  id: string;
  label: string;
}

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Manual spend entry — the no-Telegram input path. Posts to /api/transactions
// and refreshes the server-rendered dashboard so buckets/Honey update live.
//
// This form used to be typing-only: no voice, no scan, no currency, no date. It
// was the odd one out — the /graph form had capture and this, the one on the
// page people actually live on, did not.
export default function AddTransaction({
  buckets,
  knownVendors = [],
  lang,
}: {
  buckets: BucketOption[];
  knownVendors?: string[];
  lang: Locale;
}) {
  const router = useRouter();
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [ccy, setCcy] = useState("MYR");
  const [when, setWhen] = useState(todayLocal());
  const [bucket, setBucket] = useState(buckets[0]?.id ?? "");
  const [confidence, setConfidence] = useState<number | undefined>(undefined);
  const [analysis, setAnalysis] = useState<CaptureAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function applyCapture(c: Captured) {
    if (c.vendor) setVendor(c.vendor);
    if (c.amount) setAmount(String(c.amount));
    if (c.currency) setCcy(c.currency);
    if (c.bucketNodeId && buckets.some((b) => b.id === c.bucketNodeId)) setBucket(c.bucketNodeId);
    if (c.occurredAt) {
      const d = new Date(c.occurredAt);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, "0");
        setWhen(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      }
    }
    setConfidence(c.confidence);
    setMsg(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const rate = rateFor(ccy);
      const base = toMYR(Number(amount), ccy);

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletNodeId: bucket,
          vendorLabel: vendor,
          amount: base,
          occurredAt: when ? new Date(`${when}T12:00:00`).toISOString() : undefined,
          confidence,
          ...(ccy !== "MYR"
            ? {
                entered: {
                  amount: Number(amount),
                  currency: ccy,
                  perMYR: rate.perMYR,
                  rateSource: rate.source,
                },
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? tr("dash.add.couldNotSave"));

      setMsg({
        ok: true,
        text: tr("dash.add.saved", {
          amount: base.toFixed(2),
          vendor,
          label: data.stored.walletLabel,
        }),
      });
      setVendor("");
      setAmount("");
      setConfidence(undefined);
      setAnalysis(null);
      setWhen(todayLocal());
      router.refresh(); // re-render buckets + Honey with the new spend
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : tr("dash.add.couldNotSave") });
    } finally {
      setBusy(false);
    }
  }

  const field =
    "rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm text-inherit outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="mb-3">
        <SpendCapture
          lang={lang}
          knownVendors={knownVendors}
          onResult={applyCapture}
          onAnalysis={setAnalysis}
        />
        {analysis?.duplicateOf && (
          <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
            🔁{" "}
            {tr("cap.duplicate", {
              vendor: analysis.duplicateOf.vendor,
              amount: analysis.duplicateOf.amount,
              when: new Date(analysis.duplicateOf.occurredAt).toLocaleDateString("en-MY", {
                day: "numeric",
                month: "short",
              }),
            })}
          </p>
        )}
        {analysis?.insight && (
          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">🍯 {analysis.insight}</p>
        )}
        {confidence !== undefined && confidence < 0.6 && (
          <p className="mt-1 text-[11px] text-amber-600">⚠️ {tr("cap.lowConfidence")}</p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs text-zinc-500">
          {tr("dash.add.vendorLabel")}
          <input
            required
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder={tr("dash.add.vendorPlaceholder")}
            className={field}
          />
        </label>
        <label className="flex w-28 flex-col gap-1 text-xs text-zinc-500">
          {tr("dash.add.amountLabel")}
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={field}
          />
        </label>
        <label className="flex w-24 flex-col gap-1 text-xs text-zinc-500">
          {tr("g.input.currency")}
          <select value={ccy} onChange={(e) => setCcy(e.target.value)} className={field}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-36 flex-col gap-1 text-xs text-zinc-500">
          {tr("g.input.when")}
          <input
            type="date"
            value={when}
            max={todayLocal()}
            onChange={(e) => setWhen(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex min-w-36 flex-col gap-1 text-xs text-zinc-500">
          {tr("dash.add.bucketLabel")}
          <select value={bucket} onChange={(e) => setBucket(e.target.value)} className={field}>
            {buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy || !bucket}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
        >
          {busy ? tr("dash.add.saving") : tr("dash.add.submit")}
        </button>
      </div>

      {ccy !== "MYR" && amount && (
        <p className="mt-2 text-[11px] text-zinc-400">
          ≈ RM {toMYR(Number(amount) || 0, ccy).toFixed(2)} · 1 MYR = {rateFor(ccy).perMYR.toFixed(4)} {ccy} ·{" "}
          {rateFor(ccy).source}
        </p>
      )}
      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>
          {msg.ok ? "✅ " : "⚠️ "}
          {msg.text}
        </p>
      )}
      <p className="mt-2 text-xs text-zinc-400">{tr("dash.add.tip")}</p>
    </form>
  );
}
