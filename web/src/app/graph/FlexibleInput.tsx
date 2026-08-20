"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t as translate, type Locale } from "@/lib/i18n";
import { toMYR, symbolOf, rateFor, CURRENCIES } from "@/lib/format";
import SpendCapture, { type CaptureAnalysis, type Captured } from "./SpendCapture";

interface Opt {
  id: string;
  label: string;
}

type Mode = "spend" | "income" | "bucket" | "allocation";
const MODES: { key: Mode; icon: string }[] = [
  { key: "spend", icon: "🧾" },
  { key: "income", icon: "💰" },
  { key: "bucket", icon: "🪣" },
  { key: "allocation", icon: "➡️" },
];

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Flexible in-app input: add any item — a spend, an income stream, a bucket, or
// an allocation — for any person in the household, with an optional subject-matter
// tag. Posts to /api/graph and refreshes the server-rendered views.
export default function FlexibleInput({
  buckets,
  incomes,
  members,
  categoryLabels,
  knownVendors = [],
  canManageGraph = true,
  lang = "en",
  ccy = "MYR",
}: {
  buckets: Opt[];
  incomes: Opt[];
  members: Opt[];
  categoryLabels: { tier: number; label: string }[];
  knownVendors?: string[];
  canManageGraph?: boolean;
  lang?: Locale;
  ccy?: string;
}) {
  const tr = (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars);
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("spend");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [analysis, setAnalysis] = useState<CaptureAnalysis | null>(null);

  // shared fields
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [subject, setSubject] = useState("");
  const [bucket, setBucket] = useState(buckets[0]?.id ?? "");
  const [member, setMember] = useState("");
  const [tier, setTier] = useState(String(categoryLabels[0]?.tier ?? 3));

  // spend-only fields — previously missing entirely, so a captured spend could
  // never record what currency it was paid in or what day it happened.
  const [entryCcy, setEntryCcy] = useState(ccy);
  const [when, setWhen] = useState(todayLocal());
  const [note, setNote] = useState("");
  const [confidence, setConfidence] = useState<number | undefined>(undefined);

  const allocSrc = [...incomes, ...buckets];
  const [src, setSrc] = useState(allocSrc[0]?.id ?? "");
  const [dst, setDst] = useState(buckets[0]?.id ?? "");
  const [allocMode, setAllocMode] = useState<"fixed" | "pct">("fixed");

  const sym = symbolOf(entryCcy);

  // Capture (voice / scan / photo / paste) fills the form — it never saves.
  // The user always sees and confirms what will be stored, which matters when a
  // model got it wrong: fixing it here costs one keystroke, fixing it after the
  // fact costs an audit-ledger correction.
  function applyCapture(c: Captured) {
    if (c.vendor) setLabel(c.vendor);
    if (c.amount) setAmount(String(c.amount));
    if (c.currency) setEntryCcy(c.currency);
    if (c.bucketNodeId && buckets.some((b) => b.id === c.bucketNodeId)) setBucket(c.bucketNodeId);
    if (c.note) setNote(c.note);
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
      const rate = rateFor(entryCcy);
      // Amounts are entered in the display currency and stored in the base (MYR),
      // so the graph math stays in one unit. We keep what the user actually typed
      // — and the rate and source we converted at — so the figure stays auditable.
      const base = mode === "spend" ? toMYR(Number(amount), entryCcy) : toMYR(Number(amount), ccy);

      let payload: Record<string, unknown> = { entity: mode };
      if (mode === "spend") {
        payload = {
          ...payload,
          vendorLabel: label,
          amount: base,
          walletNodeId: bucket,
          memberId: member || undefined,
          occurredAt: when ? new Date(`${when}T12:00:00`).toISOString() : undefined,
          note: note || undefined,
          confidence,
          ...(entryCcy !== "MYR"
            ? {
                entered: {
                  amount: Number(amount),
                  currency: entryCcy,
                  perMYR: rate.perMYR,
                  rateSource: rate.source,
                },
              }
            : {}),
        };
      } else if (mode === "income") payload = { ...payload, label, monthly: base, subject };
      else if (mode === "bucket") payload = { ...payload, label, tier: Number(tier), subject };
      else if (mode === "allocation")
        payload =
          allocMode === "pct"
            ? { ...payload, srcNode: src, dstNode: dst, percentage: Number(amount) }
            : { ...payload, srcNode: src, dstNode: dst, amount: base };

      const res = await fetch("/api/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? tr("g.input.saveFail"));

      setMsg({ ok: true, text: tr("g.input.added", { item: tr(`add.${mode}`) + (label ? `: ${label}` : "") }) });
      setLabel("");
      setAmount("");
      setSubject("");
      setNote("");
      setConfidence(undefined);
      setAnalysis(null);
      setWhen(todayLocal());
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : tr("g.input.saveFail") });
    } finally {
      setBusy(false);
    }
  }

  const field =
    "rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm text-inherit outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900";
  const lbl = "flex flex-col gap-1 text-xs text-zinc-500";
  const visibleModes = canManageGraph ? MODES : MODES.filter((m) => m.key === "spend");

  return (
    <details className="mt-8 rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">
        ➕ {tr("add.title")}
        <span className="ml-2 text-xs font-normal text-zinc-400">{tr("add.hint")}</span>
      </summary>
      <div className="border-t border-zinc-100 p-4 dark:border-zinc-800">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {visibleModes.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => {
                setMode(m.key);
                setMsg(null);
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${mode === m.key ? "border-amber-500 bg-amber-500 text-white" : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"}`}
            >
              {m.icon} {tr(`add.${m.key}`)}
            </button>
          ))}
        </div>

        {mode === "spend" && (
          <div className="mb-3">
            <SpendCapture
              lang={lang}
              knownVendors={knownVendors}
              onResult={applyCapture}
              onAnalysis={setAnalysis}
            />
            {analysis && <AnalysisPanel analysis={analysis} lang={lang} />}
            {confidence !== undefined && confidence < 0.6 && (
              <p className="mt-1 text-[11px] text-amber-600">⚠️ {tr("cap.lowConfidence")}</p>
            )}
          </div>
        )}

        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          {mode === "spend" && (
            <>
              <label className={`${lbl} min-w-40 flex-1`}>
                {tr("g.input.whereSpend")}
                <input
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={tr("g.input.whereSpendPh")}
                  className={field}
                />
              </label>
              <label className={`${lbl} w-28`}>
                {tr("g.input.amount", { sym })}
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={field}
                />
              </label>
              <label className={`${lbl} w-24`}>
                {tr("g.input.currency")}
                <select value={entryCcy} onChange={(e) => setEntryCcy(e.target.value)} className={field}>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${lbl} w-36`}>
                {tr("g.input.when")}
                <input
                  type="date"
                  value={when}
                  max={todayLocal()}
                  onChange={(e) => setWhen(e.target.value)}
                  className={field}
                />
              </label>
              <label className={`${lbl} min-w-36`}>
                {tr("g.input.fromBucket")}
                <select value={bucket} onChange={(e) => setBucket(e.target.value)} className={field}>
                  {buckets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${lbl} min-w-32`}>
                {tr("g.input.person")}
                <select value={member} onChange={(e) => setMember(e.target.value)} className={field}>
                  <option value="">{tr("g.input.anyone")}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${lbl} min-w-40 flex-1`}>
                {tr("g.input.note")}
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={tr("g.input.notePh")}
                  className={field}
                />
              </label>
              {entryCcy !== "MYR" && (
                <p className="w-full text-[11px] text-zinc-400">
                  ≈ RM {toMYR(Number(amount) || 0, entryCcy).toFixed(2)} · 1 MYR ={" "}
                  {rateFor(entryCcy).perMYR.toFixed(4)} {entryCcy} · {rateFor(entryCcy).source}
                </p>
              )}
            </>
          )}

          {mode === "income" && (
            <>
              <label className={`${lbl} min-w-40 flex-1`}>
                {tr("g.input.incomeSource")}
                <input
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={tr("g.input.incomeSourcePh")}
                  className={field}
                />
              </label>
              <label className={`${lbl} w-32`}>
                {tr("g.input.perMonth", { sym: symbolOf(ccy) })}
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={field}
                />
              </label>
              <label className={`${lbl} min-w-36`}>
                {tr("g.input.subjectDept")}
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={tr("g.input.subjectDeptPh")}
                  className={field}
                />
              </label>
            </>
          )}

          {mode === "bucket" && (
            <>
              <label className={`${lbl} min-w-40 flex-1`}>
                {tr("g.input.bucketDept")}
                <input
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={tr("g.input.bucketDeptPh")}
                  className={field}
                />
              </label>
              <label className={`${lbl} min-w-44`}>
                {tr("g.input.category")}
                <select value={tier} onChange={(e) => setTier(e.target.value)} className={field}>
                  {categoryLabels.map((c) => (
                    <option key={c.tier} value={c.tier}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${lbl} min-w-36`}>
                {tr("g.input.subject")}
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={tr("g.input.subjectPh")}
                  className={field}
                />
              </label>
            </>
          )}

          {mode === "allocation" && (
            <>
              <label className={`${lbl} min-w-40 flex-1`}>
                {tr("g.input.allocFrom")}
                <select value={src} onChange={(e) => setSrc(e.target.value)} className={field}>
                  {allocSrc.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${lbl} min-w-40 flex-1`}>
                {tr("g.input.toBucket")}
                <select value={dst} onChange={(e) => setDst(e.target.value)} className={field}>
                  {buckets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${lbl} w-24`}>
                {allocMode === "pct" ? "%" : `${symbolOf(ccy)}/mo`}
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={field}
                />
              </label>
              <label className={`${lbl} w-24`}>
                {tr("g.input.type")}
                <select
                  value={allocMode}
                  onChange={(e) => setAllocMode(e.target.value as "fixed" | "pct")}
                  className={field}
                >
                  <option value="fixed">{tr("g.input.fixed")}</option>
                  <option value="pct">{tr("g.input.percent")}</option>
                </select>
              </label>
            </>
          )}

          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {busy ? "…" : tr("add.submit")}
          </button>
        </form>
        {msg && (
          <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>
            {msg.ok ? "✅ " : "⚠️ "}
            {msg.text}
          </p>
        )}
      </div>
    </details>
  );
}

// What the receipt agent concluded, shown before anything is saved so the user
// can act on it — most importantly the duplicate warning, which is the one that
// stops the same Touch 'n Go payment being entered twice.
function AnalysisPanel({ analysis, lang }: { analysis: CaptureAnalysis; lang: Locale }) {
  const tr = (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars);
  const rows: { icon: string; cls: string; text: string }[] = [];

  if (analysis.duplicateOf) {
    // "exact" is arithmetic — same shop, same money, same day. It gets stated as
    // fact. "likely" is a day or two out, which a daily kopi habit also looks
    // like, so it stays a question rather than an accusation.
    const d = analysis.duplicateOf;
    rows.push({
      icon: "🔁",
      cls: d.certainty === "exact" ? "font-medium text-rose-600" : "text-amber-600",
      text: tr(d.certainty === "exact" ? "cap.duplicateExact" : "cap.duplicate", {
        vendor: d.vendor,
        amount: d.amount.toFixed(2),
        when: new Date(d.occurredAt).toLocaleDateString("en-MY", { day: "numeric", month: "short" }),
      }),
    });
  }
  if (analysis.bucket) {
    rows.push({ icon: "🪣", cls: "text-zinc-500", text: `${analysis.bucket.label} — ${analysis.bucket.reason}` });
  }
  if (analysis.subscription) {
    rows.push({ icon: "🔄", cls: "text-sky-600", text: analysis.subscription.note });
  }
  if (analysis.anomaly) {
    rows.push({ icon: "📈", cls: "text-amber-600", text: analysis.anomaly.note });
  }
  if (analysis.insight) {
    rows.push({ icon: "🍯", cls: "text-amber-700 dark:text-amber-300", text: analysis.insight });
  }
  if (!rows.length) return null;

  return (
    <div className="mt-2 space-y-1 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
      {rows.map((r, i) => (
        <p key={i} className={`text-[11px] ${r.cls}`}>
          <span className="mr-1">{r.icon}</span>
          {r.text}
        </p>
      ))}
    </div>
  );
}
