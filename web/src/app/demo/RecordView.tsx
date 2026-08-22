"use client";

// Record — the default landing screen in the real app, and the first thing a
// visitor should be able to do here without reading anything.
//
// Three ways in: type · scan a receipt · photograph a statement. The
// primary action sits above the fold with no scroll, because a capture surface
// you have to scroll to is a capture surface people stop using by week two.
//
// Nothing is ever auto-committed. Every path lands in a DRAFT the user reviews
// and confirms, with per-line confidence shown. That invariant is the whole
// reason the ledger is trustworthy: the AI proposes, the human commits.
//
// In the demo the receipt and statement paths open a clearly-labelled SAMPLE
// rather than opening a camera — the point being demonstrated is the review
// flow and the SST arithmetic, and faking an OCR pass as if it were real would
// be the one dishonest thing on the page.

import { useMemo, useState } from "react";
import { assessTax, buildBill, expectedServiceTaxRate, TYPICAL_SERVICE_CHARGE } from "@/lib/sst";
import type { DemoBucket, DemoPersona, DemoTxn, CaptureSource } from "@/lib/demoData";

type Tr = (k: string, vars?: Record<string, string | number>) => string;

const rm2 = (n: number) => `RM${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface DraftLine {
  label: string;
  amount: number;
  /** 0–1. Rendered per line, because a receipt is not uniformly legible. */
  confidence: number;
  include: boolean;
}

interface Draft {
  source: CaptureSource;
  vendor: string;
  lines: DraftLine[];
  bucketId: string;
  /**
   * Present for receipts. Stores the RATES rather than the frozen ringgit
   * figures: untick a line and the service charge and SST have to move with it,
   * or the draft shows arithmetic that stopped being true the moment it was
   * edited.
   */
  bill?: { serviceChargeRate: number; taxRate: number; category?: string; rawText?: string };
  recurrence: "annual" | "monthly" | null;
  /** Provenance, so a re-parse is auditable against what was actually captured. */
  imageSha256?: string;
  parserVersion: string;
}

const PARSER_VERSION = "hm-parse/2026.08";

// ── typing: "kopi 6.50" ─────────────────────────────────────────────────────
// The same shape the on-device parser uses — Unicode-first so a merchant name in
// Chinese or Tamil survives instead of being stripped down to its digits.

function parseTyped(input: string): { vendor: string; amount: number } | null {
  const amountMatch = input.match(/(?:rm\s*)?(\d+(?:[.,]\d{1,2})?)/i);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const vendor = input
    .replace(amountMatch[0], " ")
    .replace(/[^\p{L}\p{M}\p{N}'&\-\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  return { vendor: vendor || "—", amount };
}

// ── the samples ─────────────────────────────────────────────────────────────

function sampleReceipt(): Draft {
  const lines: DraftLine[] = [
    { label: "Nasi Lemak Ayam", amount: 12.9, confidence: 0.97, include: true },
    { label: "Teh Tarik", amount: 3.5, confidence: 0.95, include: true },
    { label: "Roti Canai", amount: 2.4, confidence: 0.78, include: true },
    { label: "Air Suam", amount: 0.8, confidence: 0.61, include: true },
  ];
  // F&B keeps the protected 6% service-tax rate; the 10% service charge is the
  // restaurant's own and is NOT a tax — mislabelling it breaks the total.
  return {
    source: "receipt",
    vendor: "Restoran Nasi Kandar",
    lines,
    bucketId: "",
    bill: {
      serviceChargeRate: TYPICAL_SERVICE_CHARGE,
      taxRate: expectedServiceTaxRate("f&b"),
      category: "f&b",
      rawText: "SST 6%\nSERVICE CHARGE 10%",
    },
    recurrence: null,
    imageSha256: "e3b0c44298fc1c149afbf4c8996fb924…",
    parserVersion: PARSER_VERSION,
  };
}

function sampleStatement(): Draft {
  return {
    source: "statement",
    vendor: "Maybank — Penyata Bulanan",
    lines: [
      { label: "TNB Elektrik", amount: 178.4, confidence: 0.96, include: true },
      { label: "Unifi", amount: 139.0, confidence: 0.96, include: true },
      { label: "99 Speedmart", amount: 86.2, confidence: 0.88, include: true },
      { label: "Petronas", amount: 120.0, confidence: 0.92, include: true },
      { label: "SHOPEE *PAY", amount: 54.9, confidence: 0.64, include: true },
    ],
    bucketId: "",
    recurrence: null,
    imageSha256: "9f86d081884c7d659a2feaa0c55ad015…",
    parserVersion: PARSER_VERSION,
  };
}

// ── UI ──────────────────────────────────────────────────────────────────────

function confidenceChip(c: number, tr: Tr) {
  const level = c >= 0.9 ? "high" : c >= 0.75 ? "medium" : "low";
  const cls =
    level === "high"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
      : level === "medium"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
        : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300";
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cls}`} title={tr(`cap.conf.${level}`)}>
      {Math.round(c * 100)}%
    </span>
  );
}

function DraftReview({
  draft,
  buckets,
  onChange,
  onCommit,
  onCancel,
  tr,
}: {
  draft: Draft;
  buckets: DemoBucket[];
  onChange: (d: Draft) => void;
  onCommit: () => void;
  onCancel: () => void;
  tr: Tr;
}) {
  const included = draft.lines.filter((l) => l.include);
  const subtotal = included.reduce((s, l) => s + l.amount, 0);
  const breakdown = draft.bill
    ? buildBill(subtotal, { serviceChargeRate: draft.bill.serviceChargeRate, taxRate: draft.bill.taxRate })
    : null;
  // What the button promises and what gets written must be the same number.
  const total = breakdown ? breakdown.total : subtotal;

  const tax = useMemo(
    () =>
      breakdown && draft.bill
        ? assessTax(breakdown, { rawText: draft.bill.rawText, category: draft.bill.category })
        : null,
    [breakdown, draft.bill],
  );

  const setLine = (i: number, patch: Partial<DraftLine>) =>
    onChange({ ...draft, lines: draft.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">{tr("cap.draft.title")}</h2>
        <button type="button" onClick={onCancel} className="text-xs text-zinc-500 hover:underline">
          {tr("cap.draft.discard")}
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-500">{tr("cap.draft.hint")}</p>

      <label className="mt-4 block">
        <span className="text-xs font-medium text-zinc-500">{tr("cap.vendor")}</span>
        <input
          value={draft.vendor}
          onChange={(e) => onChange({ ...draft, vendor: e.target.value })}
          className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      <ul className="mt-4 space-y-2">
        {draft.lines.map((l, i) => (
          <li
            key={i}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
              l.include ? "border-zinc-200 dark:border-zinc-800" : "border-dashed border-zinc-200 opacity-50 dark:border-zinc-800"
            }`}
          >
            <input
              type="checkbox"
              checked={l.include}
              onChange={(e) => setLine(i, { include: e.target.checked })}
              aria-label={tr("cap.line.include", { label: l.label })}
              className="h-4 w-4 accent-amber-500"
            />
            <input
              value={l.label}
              onChange={(e) => setLine(i, { label: e.target.value })}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            {confidenceChip(l.confidence, tr)}
            <input
              type="number"
              step="0.01"
              value={l.amount}
              onChange={(e) => setLine(i, { amount: Number(e.target.value) })}
              className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-right text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
            />
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() =>
          onChange({ ...draft, lines: [...draft.lines, { label: "", amount: 0, confidence: 1, include: true }] })
        }
        className="mt-2 text-xs text-amber-600 hover:underline"
      >
        + {tr("cap.line.add")}
      </button>

      {/* SST, done properly: the 10% service charge is the restaurant's, not
          the government's, and the service tax applies on top of it. */}
      {breakdown && tax && (
        <div className="mt-4 rounded-2xl bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
          <h3 className="text-xs font-semibold text-zinc-500">{tr("cap.tax.title")}</h3>
          <dl className="mt-2 space-y-1">
            <Row label={tr("cap.tax.subtotal")} value={rm2(breakdown.subtotal)} />
            <Row
              label={tr("cap.tax.serviceCharge", { pct: Math.round((tax.serviceChargeRate ?? 0) * 100) })}
              value={rm2(breakdown.serviceCharge)}
              note={tr("cap.tax.notATax")}
            />
            <Row
              label={tr("cap.tax.serviceTax", { pct: Math.round((tax.taxRate ?? 0) * 100) })}
              value={rm2(breakdown.tax)}
            />
            <Row label={tr("cap.tax.total")} value={rm2(breakdown.total)} strong />
          </dl>
          {tax.flags.length > 0 && (
            <ul className="mt-2 space-y-1">
              {tax.flags.map((f) => (
                <li key={f.code} className="text-xs text-amber-700 dark:text-amber-400">
                  ⚠ {tr(f.messageKey, f.vars)}
                </li>
              ))}
            </ul>
          )}
          {tax.reconciles && (
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">✓ {tr("cap.tax.reconciles")}</p>
          )}
        </div>
      )}

      <label className="mt-4 block">
        <span className="text-xs font-medium text-zinc-500">{tr("cap.bucket")}</span>
        <select
          value={draft.bucketId}
          onChange={(e) => onChange({ ...draft, bucketId: e.target.value })}
          className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">{tr("cap.bucket.choose")}</option>
          {buckets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.recurrence === "annual"}
          onChange={(e) => onChange({ ...draft, recurrence: e.target.checked ? "annual" : null })}
          className="h-4 w-4 accent-amber-500"
        />
        <span>{tr("cap.annual")}</span>
      </label>
      <p className="ml-6 text-xs text-zinc-400">{tr("cap.annual.hint")}</p>

      {/* Provenance — what was captured and which parser read it, so a re-parse
          later can be checked against the original rather than trusted. */}
      {draft.imageSha256 && (
        <p className="mt-4 break-all text-[11px] text-zinc-400">
          {tr("cap.provenance", { sha: draft.imageSha256, version: draft.parserVersion })}
        </p>
      )}

      <button
        type="button"
        onClick={onCommit}
        disabled={!draft.bucketId || included.length === 0}
        className="mt-5 w-full rounded-2xl bg-amber-500 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {tr("cap.commit", { total: rm2(total) })}
      </button>
      {!draft.bucketId && <p className="mt-2 text-center text-xs text-zinc-400">{tr("cap.needBucket")}</p>}
    </div>
  );
}

function Row({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className={`text-xs ${strong ? "font-semibold" : "text-zinc-500"}`}>
        {label}
        {note && <span className="ml-1 text-[10px] text-zinc-400">({note})</span>}
      </dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : "text-zinc-600 dark:text-zinc-300"}`}>{value}</dd>
    </div>
  );
}

export default function RecordView({
  persona,
  onAdd,
  tr,
}: {
  persona: DemoPersona;
  onAdd: (t: DemoTxn) => void;
  tr: Tr;
}) {
  const [typed, setTyped] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const defaultBucket = persona.buckets.find((b) => b.tier === 3 && !b.private)?.id ?? persona.buckets[0]?.id ?? "";

  const startTyped = () => {
    const parsed = parseTyped(typed);
    if (!parsed) {
      setFlash(tr("cap.parse.fail"));
      return;
    }
    setDraft({
      source: "text",
      vendor: parsed.vendor,
      lines: [{ label: parsed.vendor, amount: parsed.amount, confidence: 1, include: true }],
      bucketId: defaultBucket,
      recurrence: null,
      parserVersion: PARSER_VERSION,
    });
    setTyped("");
    setFlash(null);
  };

  const commit = () => {
    if (!draft) return;
    const included = draft.lines.filter((l) => l.include && l.amount > 0);
    const subtotal = included.reduce((s, l) => s + l.amount, 0);
    const total = draft.bill
      ? buildBill(subtotal, { serviceChargeRate: draft.bill.serviceChargeRate, taxRate: draft.bill.taxRate }).total
      : subtotal;
    onAdd({
      id: `edit-${Date.now()}-${Math.round(total * 100)}`,
      date: new Date().toISOString(),
      amount: Math.round(total * 100) / 100,
      vendor: draft.vendor || "—",
      bucketId: draft.bucketId,
      contributorId: persona.contributors[0]?.id ?? null,
      recurrence: draft.recurrence,
      source: draft.source,
    });
    setDraft(null);
    setFlash(tr("cap.committed", { total: rm2(total) }));
  };

  if (draft) {
    return (
      <DraftReview
        draft={draft}
        buckets={persona.buckets}
        onChange={setDraft}
        onCommit={commit}
        onCancel={() => setDraft(null)}
        tr={tr}
      />
    );
  }

  const ways: { key: CaptureSource; icon: string; make: () => Draft }[] = [
    { key: "receipt", icon: "🧾", make: sampleReceipt },
    { key: "statement", icon: "📄", make: sampleStatement },
  ];

  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{tr("cap.title")}</h2>
      <p className="mt-1 text-sm text-zinc-500">{tr("cap.subtitle")}</p>

      {/* Primary action, above the fold, no scroll required. */}
      <div className="mt-4 flex gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && startTyped()}
          placeholder={tr("cap.placeholder")}
          aria-label={tr("cap.placeholder")}
          className="min-w-0 flex-1 rounded-2xl border border-zinc-300 px-4 py-3 text-base outline-none transition focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="button"
          onClick={startTyped}
          className="shrink-0 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-600"
        >
          {tr("cap.add")}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-zinc-400">{tr("cap.example")}</p>

      {flash && <p className="mt-3 rounded-xl bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-800">{flash}</p>}

      <div className="mt-5 grid grid-cols-2 gap-2">
        {ways.map((w) => (
          <button
            key={w.key}
            type="button"
            onClick={() => setDraft({ ...w.make(), bucketId: defaultBucket })}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-zinc-200 py-4 text-xs font-medium transition hover:border-amber-400 hover:bg-amber-50/50 dark:border-zinc-800 dark:hover:border-amber-600 dark:hover:bg-amber-950/20"
          >
            <span className="text-2xl" aria-hidden>
              {w.icon}
            </span>
            {tr(`cap.way.${w.key}`)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-zinc-400">{tr("cap.way.sampleNote")}</p>

      <p className="mt-6 text-xs leading-relaxed text-zinc-400">{tr("cap.neverAuto")}</p>
    </div>
  );
}
