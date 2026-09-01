"use client";

import { useMemo } from "react";
import { t as translate, type Locale } from "@/lib/i18n";
import type { ReceiptBreakdown } from "../graph/SpendCapture";
import { reconcile, splitToTotal, type SplitItem } from "@/lib/receiptSplit";
import { SAVINGS_TIER } from "@/lib/recordKind";

// The itemised half of a scan, made EDITABLE.
//
// ── WHAT WAS HERE BEFORE ───────────────────────────────────────────────────
//
// A collapsed <details> listing what the reader found, in grey, at 11px, with no
// inputs. It proved the OCR had read the receipt rather than guessed a total,
// which is a real thing to prove — and then stopped. If the reader misread
// "Nasi lemak 7.00" as "Nasi lemak 700", the user could see the mistake and
// could do nothing about it except distrust the whole scan. The rows were
// dropped when the form was submitted, so the detail was never anywhere but on
// screen for a few seconds.
//
// That is the shape of a demo, not of a ledger. The app's own promise is that
// the parser PROPOSES and the human COMMITS; a proposal you cannot edit is not a
// proposal, it is an announcement.
//
// ── WHAT IT IS NOW ─────────────────────────────────────────────────────────
//
// Every row is editable, deletable, and joined by a row the user can add for
// something the reader missed. Underneath, the two ways a receipt can enter the
// ledger, as an explicit choice rather than a default nobody was told about:
//
//   ONE RECORD   the total, with the itemisation stored alongside it. What
//                almost everyone wants for a mamak bill, and the default.
//   PER ITEM     one record per line, each filable into its own bucket. What a
//                supermarket run needs, where the same receipt holds groceries,
//                nappies and a birthday present.
//
// The sums are shown against the receipt's own total either way, because the one
// question a person asks of an itemised list is "does this match the paper in my
// hand", and an app that will not answer it has not really shown them anything.

export interface EditableItem extends SplitItem {
  /** Stable across edits and deletions, so React does not reorder inputs. */
  key: string;
  /** Recorded, or not. Only meaningful in "each" mode. */
  include: boolean;
}

let seq = 0;
export function newItemKey(): string {
  seq += 1;
  return `li-${seq}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Reader output → editable rows. Everything arrives ticked. */
export function toEditable(
  items: { label: string; amount: number; qty?: number; unitPrice?: number; discount?: boolean }[],
): EditableItem[] {
  return items.map((i) => ({ ...i, key: newItemKey(), include: true }));
}

export type ItemMode = "total" | "each";

export default function ReceiptItems({
  lang = "en",
  items,
  onItems,
  mode,
  onMode,
  breakdown,
  truncated,
  currency,
  total,
  buckets,
  defaultBucketId,
}: {
  lang?: Locale;
  items: EditableItem[];
  onItems: (next: EditableItem[]) => void;
  mode: ItemMode;
  onMode: (m: ItemMode) => void;
  breakdown?: ReceiptBreakdown;
  truncated?: boolean;
  currency: string;
  /** The amount in the form — what a "one record" save would post. */
  total: number;
  buckets: { id: string; label: string; tier?: number }[];
  defaultBucketId: string;
}) {
  const tr = (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars);

  // Only ticked rows count towards anything. An untick is the lightweight way to
  // say "the reader invented this line" without losing it while you check.
  const active = useMemo(() => items.filter((i) => i.include), [items]);
  const rec = useMemo(() => reconcile(active, total, breakdown), [active, total, breakdown]);
  const split = useMemo(
    () => (mode === "each" ? splitToTotal(active, total) : null),
    [mode, active, total],
  );

  function patch(key: string, p: Partial<EditableItem>) {
    onItems(items.map((i) => (i.key === key ? { ...i, ...p } : i)));
  }
  function remove(key: string) {
    onItems(items.filter((i) => i.key !== key));
  }
  function add() {
    onItems([
      ...items,
      { key: newItemKey(), label: "", amount: 0, include: true, bucketId: defaultBucketId },
    ]);
  }

  // A line on a receipt is something that was BOUGHT, so a savings bucket is
  // never the right home for one: money moved into savings is a transfer, and a
  // record whose bucket says "transfer" while its category says "spending" is
  // the exact disagreement lib/recordKind.ts exists to prevent. Filtered out of
  // the choices rather than corrected afterwards -- an option that cannot be
  // right should not be offered.
  const itemBuckets = useMemo(
    () => buckets.filter((b) => b.tier !== SAVINGS_TIER),
    [buckets],
  );

  // AFTER every hook, never before one: an early return above a useMemo changes
  // the hook order between renders, which React treats as a different component.
  if (!items.length) return null;

  const money = (n: number) => `${currency ? `${currency} ` : ""}${n.toFixed(2)}`;
  const cell =
    "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs outline-none hover:border-zinc-300 focus:border-amber-500 dark:hover:border-zinc-700";
  const chargeRows: [string, number][] = breakdown
    ? ([
        [tr("items.subtotal"), breakdown.subtotal],
        [tr("items.service"), breakdown.serviceCharge],
        [tr("items.tax"), breakdown.tax],
        [tr("items.rounding"), breakdown.rounding],
      ].filter(([, v]) => v !== 0) as [string, number][])
    : [];

  return (
    <section className="mt-3 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
          🧾 {tr("items.title", { n: items.length })}
        </h3>
        {/* The reconciliation, stated as a fact rather than hidden behind a
            disclosure. It is the only thing on screen that can tell a user the
            reader dropped a row, and it is worth nothing if they have to go
            looking for it. */}
        <span
          className={`rounded px-2 py-0.5 text-[11px] ${
            rec.ok
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          }`}
        >
          {rec.ok
            ? `✓ ${tr("items.reconciles")}`
            : tr(rec.difference > 0 ? "items.short" : "items.over", {
                amount: Math.abs(rec.difference).toFixed(2),
              })}
        </span>
      </header>

      {truncated && (
        <p className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          ⚠️ {tr("items.truncated")}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-xs">
          <thead className="text-left text-[10px] uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="w-8 px-2 py-1.5" />
              <th className="px-2 py-1.5 font-medium">{tr("items.col.item")}</th>
              <th className="w-16 px-2 py-1.5 text-right font-medium">{tr("items.col.qty")}</th>
              <th className="w-24 px-2 py-1.5 text-right font-medium">{tr("items.col.amount")}</th>
              {mode === "each" && (
                <th className="w-40 px-2 py-1.5 font-medium">{tr("items.col.bucket")}</th>
              )}
              <th className="w-8 px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              // What this row will actually be recorded as, once the service
              // charge and tax have been spread over it. Shown next to the
              // printed figure rather than instead of it: the user is checking
              // against a piece of paper, and a table that silently disagrees
              // with the paper is the thing they will not trust.
              const posted = split?.find((s) => s.key === it.key);
              return (
                <tr
                  key={it.key}
                  className={`border-t border-zinc-100 dark:border-zinc-800 ${
                    it.include ? "" : "opacity-45"
                  }`}
                >
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={it.include}
                      onChange={(e) => patch(it.key, { include: e.target.checked })}
                      className="h-3.5 w-3.5 accent-amber-500"
                      aria-label={tr("items.include")}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      value={it.label}
                      onChange={(e) => patch(it.key, { label: e.target.value })}
                      placeholder={tr("items.labelPlaceholder")}
                      className={cell}
                    />
                    {it.discount && (
                      <span className="ml-1.5 rounded bg-emerald-100 px-1 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        {tr("items.discount")}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={it.qty ?? ""}
                      onChange={(e) =>
                        patch(it.key, {
                          qty: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                      className={`${cell} text-right tabular-nums`}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={it.amount ? String(it.amount) : ""}
                      onChange={(e) => patch(it.key, { amount: Number(e.target.value) || 0 })}
                      className={`${cell} text-right font-medium tabular-nums`}
                    />
                    {posted && posted.amount !== it.amount && (
                      <div
                        title={tr("items.allInWhy")}
                        className="pr-1.5 text-right text-[10px] text-zinc-400"
                      >
                        → {posted.amount.toFixed(2)}
                      </div>
                    )}
                  </td>
                  {mode === "each" && (
                    <td className="px-2 py-1">
                      <select
                        value={it.bucketId ?? defaultBucketId}
                        onChange={(e) => patch(it.key, { bucketId: e.target.value })}
                        disabled={it.discount}
                        className="w-full rounded border border-zinc-200 bg-transparent px-1.5 py-1 text-[11px] outline-none focus:border-amber-500 disabled:opacity-40 dark:border-zinc-700"
                      >
                        {itemBuckets.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td className="px-2 py-1 text-right">
                    <button
                      type="button"
                      onClick={() => remove(it.key)}
                      aria-label={tr("items.remove")}
                      className="rounded px-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <button
          type="button"
          onClick={add}
          className="rounded-lg border border-dashed border-zinc-300 px-2 py-1 text-[11px] text-zinc-500 hover:border-amber-400 hover:text-amber-700 dark:border-zinc-700"
        >
          + {tr("items.add")}
        </button>
        <dl className="text-right text-[11px] tabular-nums text-zinc-500">
          <div className="flex justify-end gap-3">
            <dt>{tr("items.itemsNet")}</dt>
            <dd className="w-24">{money(rec.net)}</dd>
          </div>
          {chargeRows.map(([label, value]) => (
            <div key={label} className="flex justify-end gap-3">
              <dt>{label}</dt>
              <dd className="w-24">{money(value)}</dd>
            </div>
          ))}
          <div className="flex justify-end gap-3 font-medium text-zinc-700 dark:text-zinc-200">
            <dt>{tr("items.receiptTotal")}</dt>
            <dd className="w-24">{money(rec.total)}</dd>
          </div>
        </dl>
      </div>

      {/* ── HOW THIS RECEIPT ENTERS THE LEDGER ──────────────────────────────
          Asked outright, with the consequence of each answer written next to it,
          because the two produce genuinely different books and neither is right
          for every receipt. */}
      <fieldset className="border-t border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
        <legend className="sr-only">{tr("items.modeLegend")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["total", "each"] as ItemMode[]).map((m) => {
            const on = mode === m;
            const disabled = m === "each" && !split;
            return (
              <label
                key={m}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-[11px] transition ${
                  on
                    ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30"
                    : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800"
                } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="receipt-item-mode"
                  checked={on}
                  disabled={disabled}
                  onChange={() => onMode(m)}
                  className="mt-0.5 accent-amber-500"
                />
                <span>
                  <span className="block font-medium text-zinc-700 dark:text-zinc-200">
                    {tr(m === "total" ? "items.modeTotal" : "items.modeEach")}
                  </span>
                  <span className="mt-0.5 block text-zinc-500">
                    {m === "total"
                      ? tr("items.modeTotalWhy", { amount: money(rec.total) })
                      : split
                        ? tr("items.modeEachWhy", { n: split.length, amount: money(rec.total) })
                        : tr("items.modeEachImpossible")}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        {mode === "each" && split && (
          <p className="mt-2 text-[11px] text-zinc-500">{tr("items.allInWhy")}</p>
        )}
      </fieldset>
    </section>
  );
}
