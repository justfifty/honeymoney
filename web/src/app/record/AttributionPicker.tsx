"use client";

import { showsAttribution, type Composition, type Visibility } from "@/lib/attribution";
import { t as translate, type Locale } from "@/lib/i18n";

// Who paid — and whether it is private.
//
// Task 6, and the shape of this component IS the task. Household composition is
// CONTEXT: it lives in settings, it is established at onboarding, and it is shown
// at the top of Record as a fact rather than a control. Attribution is the thing
// chosen per record, and its options are derived from that composition.
//
// The most important line in this file is the early return. An individual
// household renders NOTHING — not a disabled control, not a single-option
// dropdown, not a greyed row. It occupies no space and adds no tap, because a
// control with one option is furniture, not a choice. Most HoneyMoney users are
// one person, and making them dismiss a question about who paid every time they
// buy coffee would be the single most effective way to stop them logging.

export default function AttributionPicker({
  composition,
  members,
  paidBy,
  visibility,
  excludeFromTotals = false,
  onPaidBy,
  onVisibility,
  onExcludeFromTotals,
  lang = "en",
}: {
  composition: Composition;
  members: { id: string; label: string }[];
  paidBy: string | null;
  visibility: Visibility;
  excludeFromTotals?: boolean;
  onPaidBy: (id: string | null) => void;
  onVisibility: (v: Visibility) => void;
  onExcludeFromTotals?: (v: boolean) => void;
  lang?: Locale;
}) {
  const tr = (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars);

  // Nothing at all, for a household of one.
  if (!showsAttribution(composition, members.length)) return null;

  return (
    <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/60">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        {tr("rec.attr.label")}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {/* "Household" is a real answer, not an escape hatch: the electricity
            bill is not paid BY anyone in particular, and forcing a name onto it
            would put fiction into the ledger. */}
        <button
          type="button"
          aria-pressed={!paidBy}
          onClick={() => onPaidBy(null)}
          className={chip(!paidBy)}
        >
          🏠 {tr("rec.attr.household")}
        </button>
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={paidBy === m.id}
            onClick={() => onPaidBy(m.id)}
            className={chip(paidBy === m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* The visibility control appears only when there is somebody to be
          private FROM. A household record has no one to hide from, so offering
          the toggle there would be a question with no meaning. */}
      {paidBy && (
        <>
          {/* Two explicit buttons, not one checkbox.
              A checkbox states one of the two outcomes and leaves the other
              implied, so "not ticked" has to be read as an answer — and the
              answer it hides is the one that shares the record. Two labelled
              options mean the state is legible without inference, whichever way
              it is set, which is what "a private-versus-household label before
              users save" actually requires. */}
          <div className="mt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              {tr("rec.attr.saveAs")}
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={visibility === "private"}
                onClick={() => onVisibility("private")}
                className={band(visibility === "private", "private")}
              >
                {tr("rec.attr.badge.private")}
              </button>
              <button
                type="button"
                aria-pressed={visibility === "shared"}
                onClick={() => onVisibility("shared")}
                className={band(visibility === "shared", "shared")}
              >
                {tr("rec.attr.badge.shared")}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
              {visibility === "private"
                ? tr("rec.attr.privateOn")
                : tr("rec.attr.privateOff")}
            </p>
          </div>

          {/* Only offered for a private record, because for a shared one it
              would be incoherent: a record everybody can see, quietly missing
              from the total everybody reads, is a discrepancy waiting to be
              blamed on the app. */}
          {visibility === "private" && onExcludeFromTotals && (
            <label className="mt-3 flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={excludeFromTotals}
                onChange={(e) => onExcludeFromTotals(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-amber-500"
              />
              <span>
                <span className="font-medium">{tr("rec.attr.exclude")}</span>
                <span className="mt-0.5 block text-[11px] text-zinc-400">
                  {tr("rec.attr.excludeHelp")}
                </span>
              </span>
            </label>
          )}
        </>
      )}
    </div>
  );
}

// The two visibility bands. Coloured differently from the payer chips on
// purpose: they answer a different question, and an identical-looking row of
// four buttons would read as one four-way choice.
function band(on: boolean, kind: "private" | "shared"): string {
  const base = "min-h-11 rounded-lg border px-2 text-xs font-semibold transition";
  if (!on) {
    return `${base} border-zinc-300 text-zinc-500 hover:bg-white dark:border-zinc-700 dark:hover:bg-zinc-800`;
  }
  return kind === "private"
    ? `${base} border-transparent bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900`
    : `${base} border-transparent bg-amber-500 text-white`;
}

function chip(on: boolean): string {
  return `min-h-11 rounded-lg border px-3 text-xs font-medium transition ${
    on
      ? "border-transparent bg-amber-500 text-white"
      : "border-zinc-300 text-zinc-600 hover:bg-white dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
  }`;
}
