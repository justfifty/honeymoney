"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { t as translate, type Locale } from "@/lib/i18n";
import { isVendorOnly, type SpendPreset } from "@/lib/presets";

// One tap to fill a spend you make all the time.
//
// ── WHAT IT DOES, AND WHAT IT DELIBERATELY DOES NOT ────────────────────────
//
// A tap FILLS the form. It does not save.
//
// That is one more tap than a "log it instantly" button, and it is the right
// trade in a ledger. A preset row sits directly under the thumb on the app's
// default screen; a stray tap that writes RM18.40 to the books is a wrong
// number somebody has to notice, find and void, and they will only notice if
// they happen to look. Filling is completely reversible — the draft is right
// there, wrong, and obviously wrong — and it still removes the whole of the
// typing, which is what was actually slow.
//
// Two taps to log a repeat coffee, from a cold start, with no keyboard.
//
// ── WHERE THE PRESETS COME FROM ────────────────────────────────────────────
//
// Two sources, shown as one row:
//
//   SUGGESTED  the (vendor, amount) pairs this household already repeats,
//              derived from its own ledger (lib/presets.ts). No setup, and
//              they appear the second time you buy the same thing.
//   CUSTOM     ones the user adds, from whatever is in the form right now.
//
// Custom presets live in localStorage, on the device. That is a deliberate
// first cut rather than an oversight: it needs no collection, no migration and
// no sync path, so the feature can be judged before any of that is committed
// to. The cost is honest and small — presets do not follow you to another
// phone — and the suggested half, which needs no storage at all, does.

const STORE_KEY = "hm.presets.v1";

function loadCustom(): SpendPreset[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.vendor === "string" && Number(p.amount) > 0)
      .slice(0, 12)
      .map((p) => ({
        id: String(p.id ?? `c:${p.vendor}:${p.amount}`),
        vendor: String(p.vendor).slice(0, 60),
        amount: Math.round(Number(p.amount) * 100) / 100,
        ...(p.bucketNodeId ? { bucketNodeId: String(p.bucketNodeId) } : {}),
        seen: 0,
      }));
  } catch {
    // Private mode, blocked storage, or someone else's JSON under our key.
    // A broken preset list must never take the capture screen down with it.
    return [];
  }
}

function saveCustom(list: SpendPreset[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    /* nothing to do, and nothing worth interrupting the user for */
  }
}

export default function QuickPresets({
  lang = "en",
  suggested,
  currency,
  draft,
  onPick,
}: {
  lang?: Locale;
  /** Derived server-side from this household's own repeats. */
  suggested: SpendPreset[];
  currency: string;
  /** What is in the form right now, for "save this as a preset". */
  draft: { vendor: string; amount: number; bucketNodeId?: string };
  onPick: (p: SpendPreset) => void;
}) {
  const tr = (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars);

  // null until the browser has been read, so the server render and the first
  // client render agree and hydration does not warn.
  const [custom, setCustom] = useState<SpendPreset[] | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    // Reading a browser-only store after mount is precisely the "subscribe to
    // an external system" case effects exist for, and it cannot be a useState
    // initialiser: the server renders no presets, and a client that rendered
    // them on the first pass would be a hydration mismatch. One setState, once,
    // on mount — the same pattern and the same reasoning as OfflineGate.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustom(loadCustom());
  }, []);

  const update = useCallback((next: SpendPreset[]) => {
    setCustom(next);
    saveCustom(next);
  }, []);

  // Custom first — a preset somebody chose to make outranks one we guessed —
  // and a suggestion that duplicates a custom one is dropped rather than shown
  // twice at different positions in the same row.
  const shown = useMemo(() => {
    const mine = custom ?? [];
    const taken = new Set(mine.map((p) => `${p.vendor.toLowerCase()}|${p.amount}`));
    return [...mine, ...suggested.filter((s) => !taken.has(`${s.vendor.toLowerCase()}|${s.amount}`))];
  }, [custom, suggested]);

  const canAdd =
    draft.vendor.trim().length > 0 &&
    draft.amount > 0 &&
    !shown.some(
      (p) => p.vendor.toLowerCase() === draft.vendor.trim().toLowerCase() && p.amount === draft.amount,
    );

  if (!shown.length && !canAdd) return null;

  const money = (n: number) => `${currency ? `${currency} ` : ""}${n.toFixed(2)}`;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-zinc-500">⚡ {tr("preset.title")}</span>
        {shown.some((p) => p.id.startsWith("c:")) && (
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="text-[11px] text-zinc-400 hover:text-amber-600"
          >
            {editing ? tr("preset.done") : tr("preset.edit")}
          </button>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {shown.map((p) => {
          const isCustom = p.id.startsWith("c:");
          return (
            <span key={p.id} className="relative inline-flex">
              <button
                type="button"
                onClick={() => onPick(p)}
                // min-h-9 rather than the 44px thumb target used for primary
                // navigation: these are dense, secondary, and sit well away from
                // any destructive control. A 44px row of six chips would push
                // the amount field below the fold on a small phone, which costs
                // more than it saves.
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs transition-colors hover:border-amber-400 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-amber-950/30"
              >
                <span className="font-medium">{p.vendor}</span>
                {/* A vendor-only shortcut shows no figure, because it has none
                    to show. Printing "0.00" would look like a spend of nothing
                    rather than an invitation to type the amount. */}
                {!isVendorOnly(p) && (
                  <span className="tabular-nums text-zinc-500">{money(p.amount)}</span>
                )}
              </button>
              {editing && isCustom && (
                <button
                  type="button"
                  onClick={() => update((custom ?? []).filter((c) => c.id !== p.id))}
                  aria-label={tr("preset.remove", { vendor: p.vendor })}
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white"
                >
                  ×
                </button>
              )}
            </span>
          );
        })}

        {canAdd && (
          <button
            type="button"
            onClick={() =>
              update([
                {
                  id: `c:${Date.now()}`,
                  vendor: draft.vendor.trim(),
                  amount: draft.amount,
                  ...(draft.bucketNodeId ? { bucketNodeId: draft.bucketNodeId } : {}),
                  seen: 0,
                },
                ...(custom ?? []),
              ])
            }
            className="inline-flex min-h-9 items-center rounded-full border border-dashed border-zinc-300 px-3 py-1.5 text-xs text-zinc-500 hover:border-amber-400 hover:text-amber-700 dark:border-zinc-700"
          >
            + {tr("preset.save", { vendor: draft.vendor.trim(), amount: money(draft.amount) })}
          </button>
        )}
      </div>
    </div>
  );
}
