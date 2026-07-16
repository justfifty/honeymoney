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
}

// The what-if co-pilot input: ask Honey a plain-language money question and get a
// grounded, advice-free answer. Works for signed-out visitors too (demo tenant),
// so a judge can try it live in the demo.
export default function HoneyAsk({ labels }: { labels: HoneyAskLabels }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ answer: string; source: string } | null>(null);

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
      setRes({ answer: data.answer, source: data.source });
    } catch (e) {
      setRes({ answer: e instanceof Error ? e.message : "Couldn’t answer that.", source: "error" });
    } finally {
      setBusy(false);
    }
  }

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
        <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-zinc-800 dark:bg-amber-950/30 dark:text-zinc-100">
          <p>{res.answer}</p>
          {res.source !== "error" && (
            <span className="mt-2 inline-block rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-black/30 dark:text-amber-300">
              {res.source === "ai" ? labels.aiBadge : labels.ruleBadge}
            </span>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-zinc-400">{labels.disclaimer}</p>
    </section>
  );
}
