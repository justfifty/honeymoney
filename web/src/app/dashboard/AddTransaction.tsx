"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/i18n";
import { CURRENCIES, rateFor, symbolOf, toMYR } from "@/lib/format";
import SpendCapture, { type CaptureAnalysis, type Captured } from "../graph/SpendCapture";
import type { IncomingAttachment } from "@/lib/attachments";
import AttributionPicker from "../record/AttributionPicker";
import {
  signOf,
  kindOf,
  tierFor,
  defaultBucketFor,
  SIGN_STYLE,
  PLUS_CATEGORIES,
  MINUS_CATEGORIES,
  MUST_PAID_TIER,
  SAVINGS_TIER,
  SPENDINGS_TIER,
  type Category,
  type Sign,
} from "@/lib/recordKind";
import { classifyText, CATEGORY_STYLE, noteKeyFor } from "@/lib/classify";
import { parseVoiceLocal } from "@/lib/voiceParse";
import { defaultVisibility, type Composition, type Visibility } from "@/lib/attribution";
import { enqueue } from "@/lib/offlineQueue";
import { appendLocalRecord } from "@/lib/localLedger";

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

// Record — one line in, one card back. The demo's UX, with a database behind it.
//
// ── WHAT THIS REPLACED, AND WHY ────────────────────────────────────────────
//
// The landing page's try-it box (app/TryItNow.tsx) asks a visitor for one line
// of text — "Grab 18.40" — and answers instantly with a filed record: vendor,
// amount, category, Honey's read on it, timed in milliseconds. It is the single
// most convincing thing on the site.
//
// Then the visitor signs up, and the app asked them to fill in a form: sign,
// category, amount, vendor, bucket, currency, date. The product got harder the
// moment you paid for it, and the classification the demo did for free became a
// question. That is backwards, and it is the reason this screen now leads with
// the same one-line field and the same result card.
//
// ── THE CLASSIFIER KNOWS INCOME, WHICH IS THE HALF THAT WAS MISSING ────────
//
// lib/classify.ts is shared with the demo, so both surfaces file identically —
// and it recognises EARNINGS, not just spending. That matters more here than it
// looks: income is read from `income_source` nodes and never from a transaction
// (lib/hscoreData.ts), and a stated income category is what creates one
// (lib/graph.ts). A household that types "Salary 5000" now gets an income the
// dashboard, the H-Score, the projections and Honey can all read — the exact
// gap that had Honey answering "I don't know your monthly income yet".
//
// ── NOTHING WAS TRADED AWAY FOR THE SPEED ──────────────────────────────────
//
// Everything the form did, it still does — the receipt scanner, the duplicate
// warning, the itemised lines, attribution and visibility, currency, back-dating,
// undo. The fields moved behind "Edit details", whose label states what they
// currently say, and the AI still only ever proposes: no capture saves itself.
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

  // The one line the user types. Everything below is derived from it and then
  // freely editable — the parse is a proposal, not a lock.
  const [line, setLine] = useState("");
  const [parseMs, setParseMs] = useState<number | null>(null);

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
  /** Set once the user states the direction outright. See pickSign. */
  const [pinnedSign, setPinnedSign] = useState<Sign | null>(null);
  /** The card's category chip, opened. One tap to disagree, in place. */
  const [picking, setPicking] = useState(false);
  // Income does not come FROM a bucket, so it is not asked for. `savings` is on
  // the `+` side but is a TRANSFER into a tier-2 bucket, so it still needs one.
  const isIncome = direction === "in" && category !== "savings";
  // Task 6. Both are remembered defaults in spirit — the common case is one
  // person logging their own routine spending, and that costs zero extra taps
  // because the control does not render for a household of one.
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>("shared");
  // Off unless the payer asks. A total that quietly omits real spending is a
  // worse failure than a visible one — see the migration note on the field.
  const [excludeFromTotals, setExcludeFromTotals] = useState(false);
  const [confidence, setConfidence] = useState<number | undefined>(undefined);
  // Shown, not stored. The itemised rows are what makes a scan checkable at a
  // glance -- "did it read my receipt or just guess a number?" -- but the
  // transaction itself is still one amount against one bucket, so these live in
  // component state and never reach the API.
  const [lineItems, setLineItems] = useState<{ label: string; amount: number }[] | null>(null);
  const [analysis, setAnalysis] = useState<CaptureAnalysis | null>(null);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Kept so a mis-saved capture can be taken back from where it happened,
  // rather than sending the user to /records to hunt for it.
  const [lastSaved, setLastSaved] = useState<{ id: string; text: string } | null>(null);
  const [undoing, setUndoing] = useState(false);

  const [attachment, setAttachment] = useState<IncomingAttachment | null>(null);

  const amountRef = useRef<HTMLInputElement | null>(null);
  const lineRef = useRef<HTMLInputElement | null>(null);

  // The examples follow the side you are on. On the money-in side they are the
  // three shapes of earning a Malaysian household actually types.
  const EXAMPLES =
    direction === "in"
      ? [tr("try.eg4"), tr("qa.egIn2"), tr("qa.egIn3")]
      : [tr("try.eg1"), tr("try.eg2"), tr("try.eg3")];

  /** The bucket a category should land in, by this household's own tiers. */
  function bucketForCategory(next: Category): string {
    const tier = tierFor(next);
    if (tier === null) return bucket;
    const withTier = buckets.map((b) => ({ id: b.id, tier: b.tier ?? SPENDINGS_TIER }));
    return defaultBucketFor(next, withTier) ?? bucket;
  }

  /** Set the category and take its bucket with it, so the two never disagree. */
  function pickCategory(next: Category) {
    setCategory(next);
    setBucket(bucketForCategory(next));
    setVisibility(
      defaultVisibility({
        paidBy,
        bucketIsPrivate: buckets.find((b) => b.id === bucketForCategory(next))?.tier === SPENDINGS_TIER,
        composition,
      }),
    );
  }

  /**
   * Money in, or money out — stated outright, and it sticks.
   *
   * `pinnedSign` is what makes the control real. Without it the next keystroke
   * re-ran the classifier over the whole line and put the record back on the
   * spending side, because "Ali 500" — my brother paid me back — matches no
   * earnings keyword and the cold-start default is spending. The button
   * appeared to work and then quietly undid itself, which is worse than not
   * offering it.
   *
   * Pinned, the table still chooses WHICH kind of money-in this is; it may no
   * longer choose whether it is money-in. Cleared when the draft is, so the
   * next record starts from the app's own default rather than from a choice
   * made about a different one.
   */
  function pickSign(next: Sign) {
    if (next === direction) return;
    setPinnedSign(next);
    const kind = classifyText(line, { sign: next });
    pickCategory(kind.category);
    setConfidence(undefined);
    lineRef.current?.focus();
  }

  // ── the one line ─────────────────────────────────────────────────────────
  //
  // Parsed on every keystroke, on this device, with no network and no token —
  // the same `parseVoiceLocal` + `classifyText` pair the landing page runs. The
  // timing shown on the card is measured here rather than asserted in copy.
  function runLine(raw: string) {
    setLine(raw);
    const value = raw.trim();
    if (!value) {
      setParseMs(null);
      return;
    }
    const started = performance.now();
    const parsed = parseVoiceLocal(value, knownVendors);
    // The stated side outranks the guessed one — see pickSign.
    const kind = classifyText(value, pinnedSign ? { sign: pinnedSign } : {});
    setParseMs(performance.now() - started);

    if (parsed.vendor) setVendor(parsed.vendor);
    if (parsed.amount !== undefined) setAmount(String(parsed.amount));
    if (parsed.currency) setCcy(parsed.currency);
    if (parsed.occurredAt) setDateFrom(parsed.occurredAt);
    pickCategory(kind.category);
    // The lower of the two. A confident amount read off an ambiguous line is not
    // a confident record, and showing the better half would be picking the
    // flattering number.
    setConfidence(Math.min(parsed.confidence, kind.confidence));
    setMsg(null);
    setLastSaved(null);
  }

  function setDateFrom(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    const pad = (n: number) => String(n).padStart(2, "0");
    setWhen(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }

  function applyCapture(c: Captured) {
    // Confidence gates the UI, not the data: a shaky parse opens the details and
    // puts the cursor on the amount, because that is the field a bad parse gets
    // wrong most often and the one a wrong value hurts most.
    if ((c.confidence ?? 1) < 0.6) {
      setEdit(true);
      // Mounted by `edit` in the same commit, so focus waits a tick for it.
      setTimeout(() => {
        amountRef.current?.focus();
        amountRef.current?.select();
      }, 0);
    }
    if (c.vendor) setVendor(c.vendor);
    if (c.amount) setAmount(String(c.amount));
    if (c.currency) setCcy(c.currency);
    // A scan that picked a bucket has ALSO picked a category — the household's
    // own filing history said which tier this belongs in (lib/receipt.ts), and
    // leaving the chip on "Spending" while the bucket says Must-paid would show
    // the user two answers to one question.
    if (c.bucketNodeId && buckets.some((b) => b.id === c.bucketNodeId)) {
      setBucket(c.bucketNodeId);
      const tier = buckets.find((b) => b.id === c.bucketNodeId)?.tier;
      if (tier === MUST_PAID_TIER) setCategory("must_paid");
      else if (tier === SAVINGS_TIER) setCategory("savings");
      else if (tier === SPENDINGS_TIER) setCategory("spendings");
    }
    if (c.occurredAt) setDateFrom(c.occurredAt);
    setLineItems(c.lineItems ?? null);
    setConfidence(c.confidence);
    // The picture rides with the draft until the user commits it. Capture never
    // saves on its own — the AI proposes, the human commits — so an image that
    // uploaded itself the moment the shutter closed would break that invariant
    // and leave orphaned files behind every abandoned capture.
    if (c.attachment) setAttachment(c.attachment);
    setParseMs(null);
    setMsg(null);
    setLastSaved(null);
  }

  function clearDraft() {
    setLine("");
    // The pin belongs to the record that was just saved, not to the next one.
    setPinnedSign(null);
    setPicking(false);
    setVendor("");
    setAmount("");
    setParseMs(null);
    // Cleared, or the next record silently carries this one's receipt.
    setAttachment(null);
    setConfidence(undefined);
    setLineItems(null);
    setAnalysis(null);
    setWhen(todayLocal());
    setEdit(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Validated here rather than with `required`, because the fields now live
    // behind a disclosure: a hidden required input blocks submit with a browser
    // error the user cannot see, on a control they cannot reach.
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setMsg({ ok: false, text: tr("qa.needAmount") });
      setEdit(true);
      return;
    }
    if (!vendor.trim()) {
      setMsg({ ok: false, text: tr("qa.needVendor") });
      setEdit(true);
      return;
    }
    setBusy(true);
    setMsg(null);
    setLastSaved(null);
    try {
      const rate = rateFor(ccy);
      const base = toMYR(value, ccy);

      const payload = {
          // Omitted for income: the API accepts an inflow with no bucket, and
          // sending buckets[0] is what filed every salary against Must-paid.
          ...(isIncome ? {} : { walletNodeId: bucket }),
          vendorLabel: vendor,
          amount: base,
          direction,
          category,
          paidBy: paidBy ?? undefined,
          visibility,
          excludeFromTotals,
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
                  amount: value,
                  currency: ccy,
                  perMYR: rate.perMYR,
                  rateSource: rate.source,
                },
              }
            : {}),
      };

      // Offline: keep it on the device and tell the user, rather than failing.
      //
      // The check is `navigator.onLine` FIRST and a caught fetch error second,
      // because the two are different situations. A known-offline device should
      // never attempt the request at all — the attempt costs a timeout the user
      // waits through, on the screen where speed is the entire product. A fetch
      // that fails while the browser believes it is online is the harder case
      // (a captive portal, the laptop origin being down) and is caught below.
      if (!navigator.onLine) {
        await enqueue(payload);
        setMsg({ ok: true, text: tr("dash.add.queued") });
        clearDraft();
        setBusy(false);
        return;
      }

      let res: Response;
      try {
        res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        // The network said yes and then did not deliver. Same outcome as being
        // offline from the user's side, so it gets the same handling: the
        // capture survives.
        await enqueue(payload);
        setMsg({ ok: true, text: tr("dash.add.queued") });
        clearDraft();
        setBusy(false);
        return;
      }
      const data = await res.json();

      // The household chose local-only storage, so the server refused — as it
      // is supposed to. This is a SUCCESS, not an error, and it must not go
      // through the retry queue: that would POST, get 409, retry five times and
      // then present a correctly-working system to the user as a failure.
      //
      // Caught here rather than before the request because the mode is the
      // server's fact, not the browser's. A client that decided for itself
      // where to write would be wrong the moment the mode changed in another
      // tab, on another device, or by another member of the household.
      if (res.status === 409 && data.storageMode === "local_only") {
        await appendLocalRecord(payload);
        setMsg({ ok: true, text: tr("dash.add.savedLocally") });
        clearDraft();
        setBusy(false);
        return;
      }

      if (!res.ok) throw new Error(data.error ?? tr("dash.add.couldNotSave"));

      const text = tr("dash.add.saved", {
        amount: base.toFixed(2),
        vendor,
        label: data.stored.walletLabel,
      });
      // The record saved. If its photo did not, say so rather than letting the
      // user believe a receipt is attached that is not there — they can still
      // re-attach it by editing, but only if they know.
      setMsg(
        data.stored.attachmentError
          ? { ok: true, text: `${text} · ${tr("cap.attachFailed")}` }
          : { ok: true, text },
      );
      if (data.stored.transactionId) setLastSaved({ id: data.stored.transactionId, text });
      clearDraft();
      lineRef.current?.focus();
      router.refresh(); // re-render buckets + Honey with the new record
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
    "min-h-11 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm text-inherit outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900";

  // The disclosure states what it is hiding, so the defaults stay auditable at a
  // glance — the whole point of hiding them is that they are usually right.
  const summary = [
    direction === "out" ? tr("dash.add.out") : tr("dash.add.in"),
    ccy,
    when === todayLocal() ? tr("dash.add.today") : when,
  ].join(" · ");

  const style = CATEGORY_STYLE[category];
  const amountValue = Number(amount);
  // The card is drawn from the FORM's state, not from the parse — so a scanned
  // receipt, a typed line and a hand-corrected amount all produce the same card,
  // and what the user is about to save is what they are looking at.
  const showCard = Number.isFinite(amountValue) && amountValue > 0;
  const bucketLabel = buckets.find((b) => b.id === bucket)?.label ?? "";

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {/* ── WHICH WAY THE MONEY WENT ──────────────────────────────────────
          Above the field, always visible, one tap.

          Task 1 put this first for a reason — it changes what everything under
          it means — and the one-line rewrite demoted it behind "Edit details",
          which made recording income something you had to go looking for. On a
          product whose whole income figure is read from what you declare, the
          money-in half cannot be the hidden half.

          It is also the ONLY thing on this screen the user states outright
          rather than implies, so it outranks the classifier: see pickSign. */}
      <div role="radiogroup" aria-label={tr("rec.sign.label")} className="mb-3 flex gap-2">
        {(["out", "in"] as Sign[]).map((s) => {
          const on = s === direction;
          const style = SIGN_STYLE[s];
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pickSign(s)}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border-2 text-sm font-semibold transition ${
                on
                  ? `${style.fill} border-transparent`
                  : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {/* The glyph is aria-hidden and the label carries the meaning, so
                  a screen reader says "Money in", not "plus". Orange and dark
                  grey, never green/red — see SIGN_STYLE. */}
              <span aria-hidden className="text-lg leading-none">
                {style.glyph}
              </span>
              {tr(s === "in" ? "rec.sign.in" : "rec.sign.out")}
            </button>
          );
        })}
      </div>

      {/* ── ONE LINE ──────────────────────────────────────────────────────
          The same field, and the same on-device parser, as the landing page's
          try-it box. Not auto-focused: this screen is the app's default landing,
          and a keyboard that opens itself every time you open the app is a cost
          paid on every launch to save a tap on some of them. */}
      <div className="flex items-center gap-2 rounded-2xl border-2 border-zinc-200 bg-white px-3 py-2 transition focus-within:border-amber-500 dark:border-zinc-700 dark:bg-zinc-950">
        <span aria-hidden className="text-lg">
          🧾
        </span>
        <label htmlFor="record-line" className="sr-only">
          {tr("try.inputLabel")}
        </label>
        <input
          id="record-line"
          ref={lineRef}
          value={line}
          onChange={(e) => runLine(e.target.value)}
          placeholder={tr(direction === "in" ? "qa.placeholderIn" : "try.placeholder")}
          autoComplete="off"
          enterKeyHint="done"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-base text-inherit outline-none placeholder:text-zinc-400 sm:text-lg"
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-zinc-500">{tr("try.tryOne")}</span>
        {EXAMPLES.map((eg) => (
          <button
            key={eg}
            type="button"
            onClick={() => {
              runLine(eg);
              lineRef.current?.focus();
            }}
            className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            {eg}
          </button>
        ))}
      </div>

      {/* ── THE CARD ──────────────────────────────────────────────────────
          What is about to be saved, in the shape the demo showed it. aria-live
          so it is announced rather than merely drawn. */}
      <div aria-live="polite">
        {showCard && (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-950/60">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {vendor || tr("try.unknownVendor")}
              </span>
              <span
                className={
                  "shrink-0 text-xl font-bold tabular-nums " +
                  (direction === "in"
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-zinc-900 dark:text-zinc-50")
                }
              >
                {direction === "in" ? "+" : "−"} {symbolOf(ccy)} {amountValue.toFixed(2)}
              </span>
            </div>

            {/* The classification, and the way to disagree with it. A chip that
                cannot be tapped is a verdict; this one opens the picker, and the
                correction is what the household's filing history learns from. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span aria-hidden className="text-zinc-400">
                →
              </span>
              <button
                type="button"
                onClick={() => setPicking((v) => !v)}
                aria-expanded={picking}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 transition hover:brightness-95 ${style.chip}`}
              >
                <span aria-hidden>{style.emoji}</span>
                {tr(`rec.cat.${category}`)}
                <span aria-hidden className="opacity-60">
                  ▾
                </span>
              </button>
              {!isIncome && bucketLabel && (
                <span className="text-[11px] text-zinc-500">{tr("qa.lands", { bucket: bucketLabel })}</span>
              )}
              {confidence !== undefined && confidence < 0.6 && (
                <span className="text-[11px] font-medium text-amber-700">{tr("try.checkThis")}</span>
              )}
            </div>

            {/* Disagreeing costs one tap, in place — not a trip through a
                disclosure. The correction is the household's own filing
                history, which is what beats a keyword table over time. Only the
                categories on the CURRENT side are offered; crossing the ledger
                is what the two buttons above the field are for. */}
            {picking && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(direction === "in" ? PLUS_CATEGORIES : MINUS_CATEGORIES).map((c) => {
                  const on = c === category;
                  const cs = CATEGORY_STYLE[c];
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        pickCategory(c);
                        // A human said so: no more "worth a check" on this record.
                        setConfidence(undefined);
                        setPicking(false);
                      }}
                      className={
                        "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium ring-1 transition " +
                        (on ? cs.chip : "bg-transparent text-zinc-600 ring-zinc-300 hover:bg-zinc-50 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800")
                      }
                    >
                      <span aria-hidden>{cs.emoji}</span>
                      {tr(`rec.cat.${c}`)}
                    </button>
                  );
                })}
              </div>
            )}

            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              🍯 {tr(noteKeyFor(category))}
            </p>

            {/* Savings is the one place the two-button model hides something
                real: money you put away sits on the `+` side but is a TRANSFER,
                not income. A user who sees it counted differently deserves the
                reason rather than assuming the app got it wrong. */}
            {kindOf(category) === "transfer" && (
              <p className={`mt-2 text-xs ${SIGN_STYLE.in.text}`}>{tr("rec.cat.savingsNote")}</p>
            )}

            {/* The claim, measured rather than asserted — and only for the typed
                path, which is the one that ran on this device. A scan reports its
                own cost in SpendCapture. */}
            {parseMs !== null && (
              <p className="mt-2.5 text-[11px] text-zinc-500">
                {tr("try.proof", { ms: parseMs < 1 ? "<1" : Math.round(parseMs) })}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── RECEIPT, PHOTO, PASTE ─────────────────────────────────────────
          The alternative to typing, kept below it: typing is the fast path and a
          returning user already has their thumb on the field above. */}
      <div className="mt-4">
        <SpendCapture
          lang={lang}
          knownVendors={knownVendors}
          onResult={applyCapture}
          onAnalysis={setAnalysis}
        />

        {/* The itemised rows the scan found. Collapsed by default because the
            amount is what the form is for -- but one tap proves the OCR read the
            receipt rather than guessing a total, which is the question anyone
            asks the first time they scan one. The sum is shown against the
            captured amount so a misread is visible instead of merely present. */}
        {lineItems && lineItems.length > 0 && (
          <details className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60">
            <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
              🧾 {lineItems.length} {lineItems.length === 1 ? "item" : "items"} read from the receipt
            </summary>
            <ul className="border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
              {lineItems.map((it, i) => (
                <li key={i} className="flex justify-between gap-3 py-0.5 text-[11px]">
                  <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-300">{it.label}</span>
                  <span className="shrink-0 tabular-nums text-zinc-500">{it.amount.toFixed(2)}</span>
                </li>
              ))}
              <li className="mt-1 flex justify-between gap-3 border-t border-zinc-200 pt-1 text-[11px] font-medium dark:border-zinc-800">
                <span className="text-zinc-500">Items total</span>
                <span className="tabular-nums">
                  {lineItems.reduce((sum, it) => sum + it.amount, 0).toFixed(2)}
                </span>
              </li>
            </ul>
          </details>
        )}

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

      {/* Task 6. Renders nothing at all for a household of one — see
          AttributionPicker on why a one-option control is furniture. Kept in the
          open rather than behind the disclosure: who paid, and who can see it,
          is not a default anyone should discover after the fact. */}
      <div className="mt-3">
        <AttributionPicker
          composition={composition}
          members={members}
          paidBy={paidBy}
          visibility={visibility}
          excludeFromTotals={excludeFromTotals}
          onPaidBy={(id) => {
            setPaidBy(id);
            // Recompute the default rather than leaving a stale choice: changing
            // WHO paid changes whether privacy is the sensible default.
            setVisibility(
              defaultVisibility({
                paidBy: id,
                bucketIsPrivate: buckets.find((b) => b.id === bucket)?.tier === SPENDINGS_TIER,
                composition,
              }),
            );
          }}
          onVisibility={(v) => {
            setVisibility(v);
            // A record that stops being private cannot stay out of the totals:
            // everyone can see it, so a total that omits it is a discrepancy.
            if (v === "shared") setExcludeFromTotals(false);
          }}
          onExcludeFromTotals={setExcludeFromTotals}
          lang={lang}
        />
      </div>

      {/* ── EDIT DETAILS ──────────────────────────────────────────────────
          Everything the form used to ask up front. The label states the current
          values, so the defaults are auditable without opening it. */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setEdit((d) => !d)}
          aria-expanded={edit}
          className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-amber-700"
        >
          <span aria-hidden className={edit ? "rotate-90 transition-transform" : "transition-transform"}>
            ›
          </span>
          {tr("qa.editDetails")}
          <span className="text-zinc-400">· {summary}</span>
        </button>

        {edit && (
          <div className="mt-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            {/* No sign picker here any more: direction is the pair of buttons
                above the field, and the category is one tap on the card's chip.
                Two controls for one choice, on one screen, is how a household
                ends up disagreeing with itself about what it just recorded. */}
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex w-28 flex-col gap-1 text-xs text-zinc-500">
                {tr("dash.add.amountLabel")}
                <input
                  ref={amountRef}
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
              {/* "Where did you spend?" is the wrong question for money coming
                  IN — a salary has a payer, not a shop. The field is the same
                  field; only what it asks for changes with the direction. */}
              <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-zinc-500">
                {tr(direction === "in" ? "dash.add.vendorLabelIn" : "dash.add.vendorLabel")}
                <input
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder={tr(
                    direction === "in" ? "dash.add.vendorPlaceholderIn" : "dash.add.vendorPlaceholder",
                  )}
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

            {/* Which bucket — one tap, not a dropdown. This is the 3-bucket model
                made visible at the moment of filing.
                ⚠️ HIDDEN FOR INCOME. `tierFor()` returns null for income and
                income_other — income does not come FROM a bucket, it arrives
                from outside and the household's ALLOCATES edges decide where it
                goes. This fieldset once rendered regardless and defaulted to
                buckets[0], so every salary was filed against Must-paid: the
                graph then showed a household's pay originating inside its own
                rent bucket. `savings` keeps the picker, because a savings
                deposit genuinely lands in a tier-2 bucket — a transfer, not an
                inflow. */}
            {!isIncome && (
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
                            ? "border-zinc-700 bg-zinc-700 text-white dark:border-zinc-500 dark:bg-zinc-600"
                            : "border-zinc-300 text-zinc-700 hover:border-amber-400 hover:bg-amber-50 dark:border-zinc-700 dark:text-zinc-200")
                        }
                      >
                        {b.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}
          </div>
        )}
      </div>

      {ccy !== "MYR" && amount && (
        <p className="mt-2 text-[11px] text-zinc-500">
          ≈ RM {toMYR(Number(amount) || 0, ccy).toFixed(2)} · 1 MYR = {rateFor(ccy).perMYR.toFixed(4)} {ccy} ·{" "}
          {rateFor(ccy).source}
        </p>
      )}

      {/* The button wears the direction's colour: amber for money in, matching
          the `+ Money in` toggle and the money-in figures on /records; dark grey
          for spends, matching the bucket chips. It is the last thing pressed, so
          its colour is the final confirmation of WHICH record this was. */}
      <button
        type="submit"
        disabled={busy || (!bucket && !isIncome)}
        className={
          "mt-4 min-h-12 w-full rounded-full px-5 text-sm font-semibold text-white transition-colors disabled:opacity-50 " +
          (isIncome
            ? "bg-amber-500 hover:bg-amber-600"
            : "bg-amber-600 hover:bg-amber-700")
        }
      >
        {busy ? tr("dash.add.saving") : `${tr(isIncome ? "dash.add.submitIn" : "dash.add.submit")} →`}
      </button>

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
      <p className="mt-2 text-xs text-zinc-500">{tr("qa.hint")}</p>
    </form>
  );
}
