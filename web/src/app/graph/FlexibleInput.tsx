"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SpendCapture from "./SpendCapture";

interface Opt {
  id: string;
  label: string;
}

type Mode = "spend" | "income" | "bucket" | "allocation";
const MODES: { key: Mode; label: string; icon: string }[] = [
  { key: "spend", label: "Spend", icon: "🧾" },
  { key: "income", label: "Income", icon: "💰" },
  { key: "bucket", label: "Bucket", icon: "🪣" },
  { key: "allocation", label: "Allocation", icon: "➡️" },
];

// Flexible in-app input: add any item — a spend, an income stream, a bucket, or
// an allocation — for any person or business, with an optional subject-matter
// tag. Posts to /api/graph and refreshes the server-rendered views.
export default function FlexibleInput({
  tenantId,
  buckets,
  incomes,
  members,
  categoryLabels,
}: {
  tenantId: string;
  buckets: Opt[];
  incomes: Opt[];
  members: Opt[];
  categoryLabels: { tier: number; label: string }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("spend");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // shared fields
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [subject, setSubject] = useState("");
  const [bucket, setBucket] = useState(buckets[0]?.id ?? "");
  const [member, setMember] = useState("");
  const [tier, setTier] = useState(String(categoryLabels[0]?.tier ?? 3));
  const allocSrc = [...incomes, ...buckets];
  const [src, setSrc] = useState(allocSrc[0]?.id ?? "");
  const [dst, setDst] = useState(buckets[0]?.id ?? "");
  const [allocMode, setAllocMode] = useState<"fixed" | "pct">("fixed");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      let payload: Record<string, unknown> = { tenantId, entity: mode };
      if (mode === "spend") payload = { ...payload, vendorLabel: label, amount: Number(amount), walletNodeId: bucket, memberId: member || undefined };
      else if (mode === "income") payload = { ...payload, label, monthly: Number(amount), subject };
      else if (mode === "bucket") payload = { ...payload, label, tier: Number(tier), subject };
      else if (mode === "allocation")
        payload = allocMode === "pct"
          ? { ...payload, srcNode: src, dstNode: dst, percentage: Number(amount) }
          : { ...payload, srcNode: src, dstNode: dst, amount: Number(amount) };

      const res = await fetch("/api/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setMsg({ ok: true, text: `Added ${mode}${label ? `: ${label}` : ""}.` });
      setLabel("");
      setAmount("");
      setSubject("");
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not save" });
    } finally {
      setBusy(false);
    }
  }

  const field = "rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm text-inherit outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900";
  const lbl = "flex flex-col gap-1 text-xs text-zinc-500";

  return (
    <details className="mt-8 rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">
        ➕ Add to the graph
        <span className="ml-2 text-xs font-normal text-zinc-400">income · bucket · allocation · spend — for any person</span>
      </summary>
      <div className="border-t border-zinc-100 p-4 dark:border-zinc-800">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => { setMode(m.key); setMsg(null); }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${mode === m.key ? "border-amber-500 bg-amber-500 text-white" : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"}`}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        {mode === "spend" && (
          <div className="mb-3">
            <SpendCapture
              onResult={({ vendor, amount: amt }) => {
                if (vendor) setLabel(vendor);
                if (amt) setAmount(String(amt));
              }}
            />
          </div>
        )}

        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          {mode === "spend" && (
            <>
              <label className={`${lbl} min-w-40 flex-1`}>Where did you spend?
                <input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. 99 Speedmart" className={field} />
              </label>
              <label className={`${lbl} w-28`}>Amount (RM)
                <input required type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
              </label>
              <label className={`${lbl} min-w-36`}>From bucket
                <select value={bucket} onChange={(e) => setBucket(e.target.value)} className={field}>
                  {buckets.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </label>
              <label className={`${lbl} min-w-32`}>Person (optional)
                <select value={member} onChange={(e) => setMember(e.target.value)} className={field}>
                  <option value="">— anyone —</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
            </>
          )}

          {mode === "income" && (
            <>
              <label className={`${lbl} min-w-40 flex-1`}>Income source
                <input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Freelance, Rental, Bonus" className={field} />
              </label>
              <label className={`${lbl} w-32`}>RM / month
                <input required type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
              </label>
              <label className={`${lbl} min-w-36`}>Subject / dept (optional)
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Dine-in, Side gig" className={field} />
              </label>
            </>
          )}

          {mode === "bucket" && (
            <>
              <label className={`${lbl} min-w-40 flex-1`}>Bucket / department
                <input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Marketing, Zakat, Travel" className={field} />
              </label>
              <label className={`${lbl} min-w-44`}>Category
                <select value={tier} onChange={(e) => setTier(e.target.value)} className={field}>
                  {categoryLabels.map((c) => <option key={c.tier} value={c.tier}>{c.label}</option>)}
                </select>
              </label>
              <label className={`${lbl} min-w-36`}>Subject (optional)
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="tag" className={field} />
              </label>
            </>
          )}

          {mode === "allocation" && (
            <>
              <label className={`${lbl} min-w-40 flex-1`}>From (income or bucket)
                <select value={src} onChange={(e) => setSrc(e.target.value)} className={field}>
                  {allocSrc.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
              <label className={`${lbl} min-w-40 flex-1`}>To bucket
                <select value={dst} onChange={(e) => setDst(e.target.value)} className={field}>
                  {buckets.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </label>
              <label className={`${lbl} w-24`}>{allocMode === "pct" ? "%" : "RM/mo"}
                <input required type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
              </label>
              <label className={`${lbl} w-24`}>Type
                <select value={allocMode} onChange={(e) => setAllocMode(e.target.value as "fixed" | "pct")} className={field}>
                  <option value="fixed">Fixed RM</option>
                  <option value="pct">Percent</option>
                </select>
              </label>
            </>
          )}

          <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50">
            {busy ? "Saving…" : "Add"}
          </button>
        </form>
        {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.ok ? "✅ " : "⚠️ "}{msg.text}</p>}
      </div>
    </details>
  );
}
