"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { parseVoiceLocal } from "@/lib/voiceParse";
import { symbolOf } from "@/lib/format";
import { classifyText, CATEGORY_STYLE, noteKeyFor } from "@/lib/classify";
import { signOf, type Category } from "@/lib/recordKind";
import { t as translate, type Locale } from "@/lib/i18n";

// The three-second hook.
//
// Everything else on the landing page is a *promise* — "open the demo", "read
// the guide" — and a promise costs a navigation before it pays anything. This
// box pays immediately: type or tap four characters and a real expense appears,
// bucketed, with Honey's read on it, before you have decided whether to trust
// the product. It runs the SAME on-device parser the signed-in app runs
// (lib/voiceParse.ts), so what a visitor sees here is not a mock-up of the
// product — it IS the product, minus the database.
//
// Nothing here touches the network. No account, no token, no upload. That is
// also the honest version of the privacy claim in the trust bar directly below:
// the visitor can verify it by pulling their network tab.

// Which category this lands in is decided by lib/classify.ts — the SAME table
// the signed-in Record screen uses, so what a visitor sees here is not a
// mock-up of the product's filing, it IS the product's filing.
//
// It moved out of this file because the version that lived here knew only
// must-paid and savings, which meant the three-second hook classified "Salary
// 5000" as *Spendings*: not merely imprecise but backwards, in front of the
// judge the box exists to convince.

interface Result {
  vendor: string;
  amount: number;
  currency: string;
  category: Category;
  confidence: number;
  /** Real wall-clock cost of the parse, in ms. Shown because it is the claim. */
  ms: number;
}

export default function TryItNow({ lang = "en" }: { lang?: Locale }) {
  const tr = (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars);

  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Four, not three: one of them is income, because a money app whose demo can
  // only imagine money leaving has shown you half of it.
  const EXAMPLES = [tr("try.eg1"), tr("try.eg2"), tr("try.eg3"), tr("try.eg4")];

  function run(raw: string) {
    const value = raw.trim();
    if (!value) {
      setResult(null);
      return;
    }
    const started = performance.now();
    const parsed = parseVoiceLocal(value);
    const ms = performance.now() - started;

    // An amount is the one thing a spend cannot do without. Until there is one,
    // stay quiet rather than showing a half-parsed card that looks broken.
    if (parsed.amount === undefined) {
      setResult(null);
      return;
    }
    const kind = classifyText(value);
    setResult({
      vendor: parsed.vendor || tr("try.unknownVendor"),
      amount: parsed.amount,
      currency: parsed.currency ?? "MYR",
      category: kind.category,
      // The lower of the two: a confident amount read off an ambiguous line is
      // not a confident record, and showing the better half would be picking
      // the flattering number.
      confidence: Math.min(parsed.confidence, kind.confidence),
      ms,
    });
  }

  function change(value: string) {
    setText(value);
    run(value);
  }

  const style = result ? CATEGORY_STYLE[result.category] : null;
  const sym = result ? symbolOf(result.currency) : "";
  // Money in reads "+", money out "−" — the same glyph-and-colour scheme as
  // /records and the capture form, so a salary and a bill never look alike.
  const sign = result ? signOf(result.category) : "out";

  return (
    <div className="hm-animate hm-delay-2 mx-auto mt-5 w-full max-w-xl sm:mt-8 rounded-3xl border border-amber-200 bg-white/90 p-4 text-left shadow-xl ring-1 ring-amber-100/70 backdrop-blur sm:p-5 dark:border-amber-900/50 dark:bg-zinc-900/85">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">{tr("try.kicker")}</p>
        <p className="text-[11px] font-medium text-zinc-500">{tr("try.noSignup")}</p>
      </div>

      {/* The input. One field, no label chrome, no required-field asterisks. */}
      <div className="mt-3 flex items-center gap-2 rounded-2xl border-2 border-zinc-200 bg-white px-3 py-2 transition focus-within:border-amber-500 dark:border-zinc-700 dark:bg-zinc-950">
        <span aria-hidden className="text-lg">🧾</span>
        <label htmlFor="try-it" className="sr-only">
          {tr("try.inputLabel")}
        </label>
        <input
          id="try-it"
          ref={inputRef}
          value={text}
          onChange={(e) => change(e.target.value)}
          placeholder={tr("try.placeholder")}
          autoComplete="off"
          enterKeyHint="done"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-base text-inherit outline-none placeholder:text-zinc-400 sm:text-lg"
        />
      </div>

      {/* One tap to a result — the actual three seconds. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-zinc-500">{tr("try.tryOne")}</span>
        {EXAMPLES.map((eg) => (
          <button
            key={eg}
            type="button"
            onClick={() => {
              change(eg);
              inputRef.current?.focus();
            }}
            className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            {eg}
          </button>
        ))}
      </div>

      {/* The payoff. aria-live so it is announced, not just drawn. */}
      <div aria-live="polite">
        {result && style && (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-950/60">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {result.vendor}
              </span>
              <span
                className={
                  "shrink-0 text-xl font-bold tabular-nums " +
                  (sign === "in" ? "text-amber-700 dark:text-amber-400" : "text-zinc-900 dark:text-zinc-50")
                }
              >
                {sign === "in" ? "+" : "−"} {sym} {result.amount.toFixed(2)}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span aria-hidden className="text-zinc-400">
                →
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${style.chip}`}
              >
                <span aria-hidden>{style.emoji}</span>
                {tr(`rec.cat.${result.category}`)}
              </span>
              {result.confidence < 0.6 && (
                <span className="text-[11px] text-amber-700">{tr("try.checkThis")}</span>
              )}
            </div>

            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              🍯 {tr(noteKeyFor(result.category))}
            </p>

            {/* The claim, measured rather than asserted. */}
            <p className="mt-2.5 text-[11px] text-zinc-500">
              {tr("try.proof", { ms: result.ms < 1 ? "<1" : Math.round(result.ms) })}
            </p>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Link
                href="/signup"
                className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-amber-600 px-5 text-sm font-semibold text-white transition hover:bg-amber-700"
              >
                {tr("try.save")} →
              </Link>
              <Link
                href="/dashboard"
                className="flex min-h-11 flex-1 items-center justify-center rounded-full border border-zinc-300 px-5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100"
              >
                {tr("try.seeDemo")}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
