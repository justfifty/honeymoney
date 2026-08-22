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
  onPaidBy,
  onVisibility,
  lang = "en",
}: {
  composition: Composition;
  members: { id: string; label: string }[];
  paidBy: string | null;
  visibility: Visibility;
  onPaidBy: (id: string | null) => void;
  onVisibility: (v: Visibility) => void;
  lang?: Locale;
}) {
  const tr = (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars);

  // Nothing at all, for a household of one.
  if (!showsAttribution(composition, members.length)) return null;

  const current = members.find((m) => m.id === paidBy);

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
        <label className="mt-3 flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={visibility === "private"}
            onChange={(e) => onVisibility(e.target.checked ? "private" : "shared")}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="font-medium">
              {tr("rec.attr.private", { who: current?.label ?? "" })}
            </span>
            {/* The indicator the stance depends on. A privacy feature nobody can
                see is indistinguishable from surveillance — the other partner
                cannot tell whether something is hidden or simply absent — so the
                consequence is stated in plain words at the point of choosing. */}
            <span className="mt-0.5 block text-[11px] text-zinc-400">
              {visibility === "private" ? tr("rec.attr.privateOn") : tr("rec.attr.privateOff")}
            </span>
          </span>
        </label>
      )}
    </div>
  );
}

function chip(on: boolean): string {
  return `min-h-11 rounded-lg border px-3 text-xs font-medium transition ${
    on
      ? "border-transparent bg-amber-500 text-white"
      : "border-zinc-300 text-zinc-600 hover:bg-white dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
  }`;
}
