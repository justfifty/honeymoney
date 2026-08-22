"use client";

import {
  PLUS_CATEGORIES,
  MINUS_CATEGORIES,
  SIGN_STYLE,
  kindOf,
  type Category,
  type Sign,
} from "@/lib/recordKind";
import { t as translate, type Locale } from "@/lib/i18n";

// The two buttons, and the six categories behind them.
//
// Task 1. `From bucket` plus a long category list becomes `+` / `−` and three
// choices on each side. The user never meets the word "transfer" — `+ Savings`
// simply produces one, because money you put away is not money you earned and
// the app should know that without asking.
//
// ── COLOUR, AND WHY NOT GREEN/RED ──────────────────────────────────────────
//
// Red-green deficiency is the common one, roughly one man in twelve. A money app
// that encodes "in" and "out" in exactly those two hues is unreadable to them —
// and it is worse than useless, because the two states look DIFFERENT enough to
// seem meaningful while being unidentifiable.
//
// Orange and dark grey are distinguishable under every form of colour vision
// deficiency, and — this is the part hue-based schemes miss — they differ in
// LIGHTNESS, so they survive greyscale. That is the release's actual
// requirement: "Record type is identifiable in greyscale."
//
// The glyph does the real work. `+` and `−` carry the meaning with no colour at
// all, so colour is reinforcement rather than the signal. Do not "fix" this back
// to green/red; it is a deliberate choice and it is written down twice.

export default function SignPicker({
  category,
  onChange,
  lang = "en",
}: {
  category: Category;
  onChange: (c: Category) => void;
  lang?: Locale;
}) {
  const tr = (k: string) => translate(lang, k);
  const sign: Sign = (PLUS_CATEGORIES as readonly string[]).includes(category) ? "in" : "out";
  const categories = sign === "in" ? PLUS_CATEGORIES : MINUS_CATEGORIES;

  function pickSign(next: Sign) {
    if (next === sign) return;
    // Land on the first category of the other side rather than remembering the
    // last one used there: after tapping `−` the user is about to choose, and a
    // stale pre-selection from three days ago is a wrong answer waiting to be
    // accepted by someone moving fast.
    onChange(next === "in" ? PLUS_CATEGORIES[0] : MINUS_CATEGORIES[0]);
  }

  return (
    <div>
      {/* radiogroup, not two buttons: this is one choice with two options, and
          a screen reader should say so. */}
      <div role="radiogroup" aria-label={tr("rec.sign.label")} className="flex gap-2">
        {(["in", "out"] as Sign[]).map((s) => {
          const on = s === sign;
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
                  a screen reader says "Money in", not "plus". */}
              <span aria-hidden className="text-lg leading-none">
                {style.glyph}
              </span>
              {tr(s === "in" ? "rec.sign.in" : "rec.sign.out")}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {categories.map((c) => {
          const on = c === category;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(c)}
              className={`min-h-11 rounded-lg border px-3 text-xs font-medium transition ${
                on
                  ? `border-transparent ${SIGN_STYLE[sign].fill}`
                  : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {tr(`rec.cat.${c}`)}
            </button>
          );
        })}
      </div>

      {/* Savings is the one place the two-button model hides something real, so
          it is the one place it explains itself. Money moved into savings is not
          income, and a user who sees it counted differently deserves to know
          why rather than assuming the app got it wrong. */}
      {kindOf(category) === "transfer" && (
        <p className={`mt-2 text-xs ${SIGN_STYLE.in.text}`}>{tr("rec.cat.savingsNote")}</p>
      )}
    </div>
  );
}
