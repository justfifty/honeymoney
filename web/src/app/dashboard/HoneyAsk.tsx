"use client";

import { useState } from "react";

export interface HoneyAskLabels {
  title: string;
  placeholder: string;
  button: string;
  thinking: string;
  aiBadge: string;
  ruleBadge: string;
  disclaimer: string;
  suggestions: string[];
  /** Confidence chips — the honest signal about how thin the data is. */
  confHigh: string;
  confFair: string;
  confThin: string;
}

interface AskResult {
  answer: string;
  source: "ai" | "computed" | "error";
  kind?: string;
  confidence?: "high" | "fair" | "thin";
}

// The what-if co-pilot input. What arrives here has already been through the
// three stages in lib/copilot.ts — parse, compute, narrate — so this component
// renders a finished sentence and never assembles one.
//
// ── WHAT THE BADGES SAY, AND WHY THE WORDING CHANGED ───────────────────────
//
// The old pair was "AI" / "rule-based", which described the wrong thing and
// flattered the wrong path: it implied the AI answer was the good one and the
// deterministic one was a degraded fallback. It was the other way round — the
// deterministic path was the only one doing arithmetic.
//
// Both badges now say the numbers were CALCULATED, because in both cases they
// were, by the same engine. The only difference is who chose the words. A user
// deciding whether to trust a figure is asking "did something work this out?",
// not "was a language model involved?"
export default function HoneyAsk({ labels }: { labels: HoneyAskLabels }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AskResult | null>(null);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setRes(null);
    try {
      const r = await fetch("/api/insight/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Couldn’t answer that.");
      setRes({ answer: data.answer, source: data.source, kind: data.kind, confidence: data.confidence });
    } catch (e) {
      setRes({ answer: e instanceof Error ? e.message : "Couldn’t answer that.", source: "error" });
    } finally {
      setBusy(false);
    }
  }

  const conf = res?.confidence;
  const confLabel = conf === "high" ? labels.confHigh : conf === "fair" ? labels.confFair : labels.confThin;
  // Amber for thin data rather than red: not enough history is a normal state
  // for a new household, not an error they did something to cause.
  const confTone =
    conf === "high"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
      : conf === "fair"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
        : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

  return (
    <section className="mt-6 rounded-2xl border border-amber-200 bg-white p-5 dark:border-amber-900/50 dark:bg-zinc-900">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden="true">🍯</span> {labels.title}
      </h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={labels.placeholder}
          maxLength={300}
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="whitespace-nowrap rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {busy ? labels.thinking : labels.button}
        </button>
      </form>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {labels.suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setQ(s);
              ask(s);
            }}
            className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-500 hover:border-amber-300 hover:text-amber-600 dark:border-zinc-700 dark:text-zinc-400"
          >
            {s}
          </button>
        ))}
      </div>

      {res && (
        <div
          aria-live="polite"
          className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-zinc-800 dark:bg-amber-950/30 dark:text-zinc-100"
        >
          <p>{res.answer}</p>
          {res.source !== "error" && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-block rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-black/30 dark:text-amber-300">
                {res.source === "ai" ? labels.aiBadge : labels.ruleBadge}
              </span>
              {/* Only shown where a projection was actually made. A confidence
                  chip on "I can't help pick a loan" would be meaningless. */}
              {conf && res.kind !== "out_of_scope" && res.kind !== "needs_price" && res.kind !== "unclear" && (
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${confTone}`}>
                  {confLabel}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* The scope line. Persistent and visible under the surface itself —
          never behind a settings toggle, because the person who needs to read
          it is the one about to act on an answer. */}
      <p className="mt-3 text-xs text-zinc-400">{labels.disclaimer}</p>
    </section>
  );
}
