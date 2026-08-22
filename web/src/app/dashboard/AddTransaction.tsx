"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";
import { CURRENCIES, rateFor, toMYR } from "@/lib/format";
import SpendCapture, { type CaptureAnalysis, type Captured } from "../graph/SpendCapture";
import type { IncomingAttachment } from "@/lib/attachments";
import SignPicker from "../record/SignPicker";
import AttributionPicker from "../record/AttributionPicker";
import { signOf, MINUS_CATEGORIES, type Category } from "@/lib/recordKind";
import { defaultVisibility, type Composition, type Visibility } from "@/lib/attribution";

interface BucketOption {
  id: string;
  label: string;
  /** 1 = must-paid · 2 = savings · 3 = spendings/personal. Drives whether a
   *  record defaults to private under the Task 6 stance. */
  tier?: number;
}

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Manual spend entry — the no-Telegram input path. Posts to /api/transactions
// and refreshes the server-rendered dashboard so buckets/Honey update live.
//
// Six fields used to be on screen at once: direction, vendor, amount, currency,
// date and bucket. Four of them are right by default on almost every entry
// (spend · MYR · today · same bucket as last time), so they were four decisions
// charged to a user who only wanted to record RM 6.50. They now live behind a
// disclosure whose LABEL states what they currently say — so the defaults stay
// visible without costing a tap, and the form asks for the two things it
// genuinely cannot guess: how much, and to whom.
export default function AddTransaction({
  buckets,
  knownVendors = [],
  members = [],
  composition = "individual",
  lang,
}: {
  buckets: BucketOption[];
  knownVendors?: string[];
  /** Household members, for Task 6 attribution. Empty ⇒ no control renders. */
  members?: { id: string; label: string }[];
  /** Household composition — CONTEXT, not a control. See lib/attribution.ts. */
  composition?: Composition;
  lang: Locale;
}) {
  const router = useRouter();
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [ccy, setCcy] = useState("MYR");
  const [when, setWhen] = useState(todayLocal());
  const [bucket, setBucket] = useState(buckets[0]?.id ?? "");
  // Task 1: the user picks a CATEGORY behind one of two buttons; `direction` is
  // derived from it rather than being a separate question. Spending is the
  // overwhelming common case, so that is where the form opens.
  const [category, setCategory] = useState<Category>(MINUS_CATEGORIES[0]);
  const direction = signOf(category);
  // Task 6. Both are remembered defaults in spirit — the common case is one
  // person logging their own routine spending, and that costs zero extra taps
  // because the control does not render for a household of one.
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>("shared");
  const [confidence, setConfidence] = useState<number | undefined>(undefined);
  const [analysis, setAnalysis] = useState<CaptureAnalysis | null>(null);
  const [details, setDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Kept so a mis-saved capture can be taken back from where it happened,
  // rather than sending the user to /records to hunt for it.
  const [lastSaved, setLastSaved] = useState<{ id: string; text: string } | null>(null);
  const [undoing, setUndoing] = useState(false);

  const [attachment, setAttachment] = useState<IncomingAttachment | null>(null);

  const amountRef = useRef<HTMLInputElement | null>(null);

  function applyCapture(c: Captured) {
    // Confidence gates the UI, not the data: a shaky parse opens the details and
    // puts the cursor on the amount, because that is the field a bad parse gets
    // wrong most often and the one a wrong value hurts most. The amount input is
    // always mounted, so it can be focused in the same tick as the capture.
    if ((c.confidence ?? 1) < 0.6) {
      setDetails(true);
      amountRef.current?.focus();
      amountRef.current?.select();
    }
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
    // The picture rides with the draft until the user commits it. Capture never
    // saves on its own — the AI proposes, the human commits — so an image that
    // uploaded itself the moment the shutter closed would break that invariant
    // and leave orphaned files behind every abandoned capture.
    if (c.attachment) setAttachment(c.attachment);
    setMsg(null);
    setLastSaved(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setLastSaved(null);
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
          direction,
          category,
          paidBy: paidBy ?? undefined,
          visibility,
          // True: a human chose this, rather than it being defaulted by a
          // migration. That distinction is what makes "reclassifying is a user
          // action" checkable later.
          attributionAsserted: Boolean(paidBy),
          ...(attachment ? { attachments: [attachment] } : {}),
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

      const text = tr("dash.add.saved", {
        amount: base.toFixed(2),
        vendor,
        label: data.stored.walletLabel,
      });
      // The spend saved. If its photo did not, say so rather than letting the
      // user believe a receipt is attached that is not there — they can still
      // re-attach it by editing, but only if they know.
      setMsg(
        data.stored.attachmentError
          ? { ok: true, text: `${text} · ${tr("cap.attachFailed")}` }
          : { ok: true, text },
      );
      if (data.stored.transactionId) setLastSaved({ id: data.stored.transactionId, text });
      setVendor("");
      setAmount("");
      // Cleared, or the next spend silently carries this one's receipt.
      setAttachment(null);
      setConfidence(undefined);
      setAnalysis(null);
      setWhen(todayLocal());
      setDetails(false);
      router.refresh(); // re-render buckets + Honey with the new spend
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : tr("dash.add.couldNotSave") });
    } finally {
      setBusy(false);
    }
  }

  // Void, not delete — the record stays in the ledger with its reversal audited.
  async function undo() {
    if (!lastSaved) return;
    setUndoing(true);
    try {
      const res = await fetch(`/api/transactions/${lastSaved.id}?reason=undo`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? tr("dash.add.undoFailed"));
      }
      setLastSaved(null);
      setMsg({ ok: true, text: tr("dash.add.undone") });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : tr("dash.add.undoFailed") });
    } finally {
      setUndoing(false);
    }
  }

  const field =
    "min-h-11 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm text-inherit outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900";

  // The disclosure states what it is hiding, so the defaults are auditable at a
  // glance — the whole point of hiding them is that they are usually right.
  const summary = [
    direction === "out" ? tr("dash.add.out") : tr("dash.add.in"),
    ccy,
    when === todayLocal() ? tr("dash.add.today") : when,
  ].join(" · ");

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
            {tr(analysis.duplicateOf.certainty === "exact" ? "cap.duplicateExact" : "cap.duplicate", {
              vendor: analysis.duplicateOf.vendor,
              amount: analysis.duplicateOf.amount.toFixed(2),
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
          <p className="mt-1 text-[11px] text-amber-700">⚠️ {tr("cap.lowConfidence")}</p>
        )}
      </div>

      {/* The two things the app cannot guess, and the button. Amount leads: it is
          what the user came holding, and on a phone it opens the number pad. */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex w-32 flex-col gap-1 text-xs text-zinc-500">
          {tr("dash.add.amountLabel")}
          <input
            ref={amountRef}
            required
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={`${field} text-lg font-semibold tabular-nums`}
          />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-zinc-500">
          {tr("dash.add.vendorLabel")}
          <input
            required
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder={tr("dash.add.vendorPlaceholder")}
            className={field}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !bucket}
          className="min-h-11 rounded-lg bg-amber-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
        >
          {busy ? tr("dash.add.saving") : tr("dash.add.submit")}
        </button>
      </div>

      {/* Task 1: the two buttons, and the categories behind them. Above the
          bucket row because the sign decides what the bucket choices MEAN — a
          Savings bucket reached via `+` is a deposit, via `−` a withdrawal. */}
      <div className="mt-3">
        <SignPicker category={category} onChange={setCategory} lang={lang} />
      </div>

      {/* Task 6. Renders nothing at all for a household of one — see
          AttributionPicker on why a one-option control is furniture. */}
      <div className="mt-3">
        <AttributionPicker
          composition={composition}
          members={members}
          paidBy={paidBy}
          visibility={visibility}
          onPaidBy={(id) => {
            setPaidBy(id);
            // Recompute the default rather than leaving a stale choice: changing
            // WHO paid changes whether privacy is the sensible default.
            setVisibility(
              defaultVisibility({
                paidBy: id,
                bucketIsPrivate: buckets.find((b) => b.id === bucket)?.tier === 3,
                composition,
              }),
            );
          }}
          onVisibility={setVisibility}
          lang={lang}
        />
      </div>

      {/* Which bucket — one tap, not a dropdown. This is the 3-bucket model made
          visible at the moment of filing, and it is where a correction becomes
          the household's own training data. */}
      <fieldset className="mt-3">
        <legend className="text-xs text-zinc-500">{tr("dash.add.bucketLabel")}</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {buckets.map((b) => {
            const on = b.id === bucket;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setBucket(b.id)}
                aria-pressed={on}
                className={
                  "min-h-11 rounded-full border px-3.5 text-xs font-medium transition " +
                  (on
                    ? "border-amber-600 bg-amber-600 text-white"
                    : "border-zinc-300 text-zinc-700 hover:border-amber-400 hover:bg-amber-50 dark:border-zinc-700 dark:text-zinc-200")
                }
              >
                {b.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Defaults, disclosed. The label is the current value, not just "More". */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setDetails((d) => !d)}
          aria-expanded={details}
          className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-amber-700"
        >
          <span aria-hidden className={details ? "rotate-90 transition-transform" : "transition-transform"}>
            ›
          </span>
          {summary}
          <span className="text-zinc-400">· {tr("dash.add.change")}</span>
        </button>

        {details && (
          <div className="mt-2 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
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
            <label className="flex w-40 flex-col gap-1 text-xs text-zinc-500">
              {tr("g.input.when")}
              <input
                type="date"
                value={when}
                max={todayLocal()}
                onChange={(e) => setWhen(e.target.value)}
                className={field}
              />
            </label>
          </div>
        )}
      </div>

      {ccy !== "MYR" && amount && (
        <p className="mt-2 text-[11px] text-zinc-500">
          ≈ RM {toMYR(Number(amount) || 0, ccy).toFixed(2)} · 1 MYR = {rateFor(ccy).perMYR.toFixed(4)} {ccy} ·{" "}
          {rateFor(ccy).source}
        </p>
      )}
      {msg && (
        <p
          className={`mt-2 flex flex-wrap items-center gap-2 text-xs ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}
        >
          <span>
            {msg.ok ? "✅ " : "⚠️ "}
            {msg.text}
          </span>
          {msg.ok && lastSaved && (
            <button
              type="button"
              onClick={undo}
              disabled={undoing}
              className="rounded-full border border-zinc-300 px-2.5 py-1 font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              {undoing ? tr("dash.add.undoing") : `↩ ${tr("dash.add.undo")}`}
            </button>
          )}
        </p>
      )}
      <p className="mt-2 text-xs text-zinc-500">{tr("dash.add.tip")}</p>
    </form>
  );
}
