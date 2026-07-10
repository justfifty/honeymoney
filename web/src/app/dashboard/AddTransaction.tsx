"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";

interface BucketOption {
  id: string;
  label: string;
}

// Manual spend entry — the no-Telegram input path. Posts to /api/transactions
// and refreshes the server-rendered dashboard so buckets/Honey update live.
export default function AddTransaction({
  buckets,
  tenantId,
  lang,
}: {
  buckets: BucketOption[];
  tenantId: string;
  lang: Locale;
}) {
  const router = useRouter();
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [bucket, setBucket] = useState(buckets[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          walletNodeId: bucket,
          vendorLabel: vendor,
          amount: Number(amount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? tr("dash.add.couldNotSave"));
      setMsg({
        ok: true,
        text: tr("dash.add.saved", {
          amount: Number(amount).toFixed(2),
          vendor,
          label: data.stored.walletLabel,
        }),
      });
      setVendor("");
      setAmount("");
      router.refresh(); // re-render buckets + Honey with the new spend
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : tr("dash.add.couldNotSave") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs text-zinc-500">
          {tr("dash.add.vendorLabel")}
          <input
            required
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder={tr("dash.add.vendorPlaceholder")}
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm text-inherit outline-none focus:border-amber-500 dark:border-zinc-700"
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
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm text-inherit outline-none focus:border-amber-500 dark:border-zinc-700"
          />
        </label>
        <label className="flex min-w-36 flex-col gap-1 text-xs text-zinc-500">
          {tr("dash.add.bucketLabel")}
          <select
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm text-inherit outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900"
          >
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
      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>
          {msg.ok ? "✅ " : "⚠️ "}
          {msg.text}
        </p>
      )}
      <p className="mt-2 text-xs text-zinc-400">
        {tr("dash.add.tip")}
      </p>
    </form>
  );
}
