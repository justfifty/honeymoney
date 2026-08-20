"use client";

// The H-Score tab, in the order the spec fixes it:
//
//   ring + band → five sub-score bars → what moved → goals → (directory)
//
// The directory is deliberately NOT on this screen. It is reachable only by
// tapping a goal, which is what keeps "here is a product" downstream of "here is
// what you're trying to fix" rather than downstream of "here is your score".

import { useState } from "react";
import {
  pointsToNextBand,
  BANDS,
  MIN_TXNS_30D,
  type Band,
  type HScore,
  type ScoreInputs,
  type ScoreMovement,
  type SubScore,
  type ComponentKey,
} from "@/lib/hscore";
import { categoryFor } from "@/lib/directory";
import DirectoryView from "./DirectoryView";

type Tr = (k: string, vars?: Record<string, string | number>) => string;

const BAND_STYLE: Record<Band, { ring: string; text: string; chip: string }> = {
  building: { ring: "#8B94A3", text: "text-zinc-600 dark:text-zinc-300", chip: "bg-zinc-100 dark:bg-zinc-800" },
  steady: { ring: "#3E7BB6", text: "text-sky-700 dark:text-sky-300", chip: "bg-sky-50 dark:bg-sky-950/40" },
  strong: { ring: "#2E8B57", text: "text-emerald-700 dark:text-emerald-300", chip: "bg-emerald-50 dark:bg-emerald-950/40" },
  thriving: { ring: "#E8A012", text: "text-amber-700 dark:text-amber-300", chip: "bg-amber-50 dark:bg-amber-950/40" },
};

const rm = (n: number) => `RM${Math.round(n).toLocaleString("en-MY")}`;

// ── 1. the ring ─────────────────────────────────────────────────────────────

function ScoreRing({ hscore, tr }: { hscore: HScore; tr: Tr }) {
  const provisional = !hscore.confidence.ok;
  const style = BAND_STYLE[hscore.band];
  const R = 64;
  const C = 2 * Math.PI * R;
  const filled = (Math.max(0, Math.min(100, hscore.score)) / 100) * C;

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg viewBox="0 0 160 160" className="h-40 w-40 -rotate-90" role="img" aria-label={`Score ${hscore.score} of 100`}>
          <circle cx="80" cy="80" r={R} fill="none" strokeWidth="12" className="stroke-zinc-200 dark:stroke-zinc-800" />
          <circle
            cx="80"
            cy="80"
            r={R}
            fill="none"
            strokeWidth="12"
            strokeLinecap="round"
            stroke={provisional ? "#9AA0A6" : style.ring}
            strokeDasharray={`${filled} ${C - filled}`}
            opacity={provisional ? 0.45 : 1}
            style={{ transition: "stroke-dasharray 600ms ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-display text-4xl font-bold tabular-nums ${provisional ? "text-zinc-400" : ""}`}>
            {hscore.score}
          </span>
          <span className="text-xs text-zinc-400">/ 100</span>
        </div>
      </div>

      <p className={`mt-3 font-display text-lg font-semibold ${provisional ? "text-zinc-400" : style.text}`}>
        {provisional ? tr("hscore.provisional") : tr(`hscore.band.${hscore.band}`)}
      </p>
      {!provisional && (
        <p className="mt-0.5 max-w-xs text-center text-xs text-zinc-500">{tr(`hscore.band.${hscore.band}.sub`)}</p>
      )}
    </div>
  );
}

/** The honest answer to "how do you score without bank links": say what's missing. */
function ProvisionalNotice({ hscore, tr }: { hscore: HScore; tr: Tr }) {
  if (hscore.confidence.ok) return null;
  return (
    <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="font-medium">{tr("hscore.provisional.why")}</p>
      <ul className="mt-2 space-y-1 text-zinc-500">
        {hscore.confidence.missing.map((m) => (
          <li key={m} className="flex gap-2">
            <span aria-hidden>•</span>
            <span>{tr(`hscore.missing.${m}`, { n: MIN_TXNS_30D, have: hscore.confidence.txns30d })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── 2. the five bars ────────────────────────────────────────────────────────

function measureLabel(s: SubScore, tr: Tr): string {
  if (s.key === "privacyDiscipline") return tr("hscore.c.monthsOf3", { n: Math.round(s.measure) });
  if (s.key === "emergencyBuffer") return tr("hscore.c.months", { n: Math.round(s.measure * 10) / 10 });
  return `${Math.round(s.measure * 100)}%`;
}

function SubScoreBars({ subScores, tr }: { subScores: SubScore[]; tr: Tr }) {
  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold">{tr("hscore.sub.title")}</h3>
      <ul className="mt-3 space-y-3">
        {subScores.map((s) => {
          const pct = s.max > 0 ? (s.points / s.max) * 100 : 0;
          return (
            <li key={s.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{tr(`hscore.c.${s.key}`)}</span>
                <span className="tabular-nums text-zinc-500">
                  {s.points}<span className="text-zinc-400">/{s.max}</span>
                </span>
              </div>
              <div
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                role="meter"
                aria-valuenow={s.points}
                aria-valuemin={0}
                aria-valuemax={s.max}
                aria-label={tr(`hscore.c.${s.key}`)}
              >
                <div
                  className="h-full rounded-full bg-amber-500"
                  style={{ width: `${pct}%`, transition: "width 600ms ease-out" }}
                />
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                {tr(`hscore.c.${s.key}.hint`)} · {measureLabel(s, tr)}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── 3. what moved (deterministic — never an LLM) ────────────────────────────

function WhatMoved({ moved, tr }: { moved: ScoreMovement | null; tr: Tr }) {
  // "rose 1 points" is the kind of detail that makes a generated sentence read
  // as generated, so the unit is a variable rather than baked into the template.
  const points = Number(moved?.vars.points ?? 0);
  const sentence = moved
    ? tr(moved.key, {
        ...moved.vars,
        unit: tr(points === 1 ? "hscore.points.one" : "hscore.points.many"),
        component: moved.vars.component ? tr(String(moved.vars.component)) : "",
      })
    : tr("hscore.moved.none");

  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-semibold">{tr("hscore.moved.title")}</h3>
      <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">{sentence}</p>
      <p className="mt-2 text-xs text-zinc-400">{tr("hscore.moved.deterministic")}</p>
    </section>
  );
}

// ── 4. tier engagement — the register has to match the tier ─────────────────
// Confetti at the bottom tier is condescending, so Building gets a named
// ringgit gap and a streak count instead of applause, and only Thriving
// animates.

function nextBandName(score: number, tr: Tr): string {
  const next = BANDS.find((b) => b.min > score);
  return next ? tr(`hscore.band.${next.band}`) : tr("hscore.band.thriving");
}

function BuildingCard({ score, gap, streak, tr }: { score: number; gap: number | null; streak: number; tr: Tr }) {
  const band = nextBandName(score, tr);
  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-semibold">{tr("hscore.nba.title")}</h3>
      <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
        {gap
          ? tr("hscore.nba.savings", { amount: rm(gap).replace("RM", ""), band })
          : tr("hscore.nba.generic", { points: pointsToNextBand(score), band })}
      </p>
      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium tabular-nums dark:bg-zinc-800">
          {streak === 1 ? tr("hscore.streak.one") : tr("hscore.streak", { n: streak })}
        </span>
        <span className="text-zinc-400">{tr("hscore.streak.hint")}</span>
      </div>
    </section>
  );
}

function BufferMeter({ months, tr }: { months: number; tr: Tr }) {
  const TICKS = [1, 3, 6];
  const pct = Math.min(100, (months / 6) * 100);
  const nextTick = TICKS.find((t) => months < t);
  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-semibold">{tr("hscore.buffer.title")}</h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
        {tr("hscore.buffer.have", { n: Math.round(months * 10) / 10 })}
      </p>
      <div className="relative mt-3 h-3 rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-sky-500"
          style={{ width: `${pct}%`, transition: "width 900ms cubic-bezier(.2,.8,.2,1)" }}
        />
        {TICKS.map((t) => (
          <span
            key={t}
            className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 bg-white/90 dark:bg-zinc-950/90"
            style={{ left: `${(t / 6) * 100}%` }}
            aria-hidden
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
        {TICKS.map((t) => (
          <span key={t}>{t}mo</span>
        ))}
      </div>
      <p className="mt-2 text-sm text-zinc-500">
        {nextTick
          ? tr("hscore.buffer.toGo", { n: Math.round((nextTick - months) * 10) / 10, target: nextTick })
          : tr("hscore.buffer.done")}
      </p>
    </section>
  );
}

/** Five-axis radar — which component is dragging, at a glance. */
function Radar({ subScores, tr }: { subScores: SubScore[]; tr: Tr }) {
  const N = subScores.length;
  const cx = 110;
  const cy = 100;
  const R = 70;
  const pt = (i: number, r: number) => {
    const a = (Math.PI * 2 * i) / N - Math.PI / 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
  };
  const poly = subScores
    .map((s, i) => {
      const [x, y] = pt(i, R * (s.max > 0 ? s.points / s.max : 0));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const grid = [0.25, 0.5, 0.75, 1].map((f) =>
    subScores.map((_, i) => pt(i, R * f).map((v) => v.toFixed(1)).join(",")).join(" "),
  );

  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-semibold">{tr("hscore.radar.title")}</h3>
      <div className="overflow-x-auto">
        <svg viewBox="0 0 220 200" className="mx-auto h-52 w-full max-w-xs" role="img" aria-label={tr("hscore.radar.title")}>
          {grid.map((g, i) => (
            <polygon key={i} points={g} fill="none" className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" />
          ))}
          <polygon points={poly} fill="#2E8B57" fillOpacity="0.22" stroke="#2E8B57" strokeWidth="2" />
          {subScores.map((s, i) => {
            const [x, y] = pt(i, R + 16);
            return (
              <text
                key={s.key}
                x={x}
                y={y}
                textAnchor={x > cx + 4 ? "start" : x < cx - 4 ? "end" : "middle"}
                dominantBaseline="middle"
                fontSize="8"
                className="fill-zinc-500"
              >
                {tr(`hscore.c.${s.key}`)}
              </text>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

function StrongRecap({ subScores, tr }: { subScores: SubScore[]; tr: Tr }) {
  const ratio = (s: SubScore) => (s.max > 0 ? s.points / s.max : 0);
  const sorted = [...subScores].sort((a, b) => ratio(a) - ratio(b));
  return (
    <>
      <section className="mt-6 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 className="text-sm font-semibold">{tr("hscore.recap.title")}</h3>
        <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
          {tr("hscore.recap.dragging", { component: tr(`hscore.c.${sorted[0].key}`) })}
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          {tr("hscore.recap.leading", { component: tr(`hscore.c.${sorted[sorted.length - 1].key}`) })}
        </p>
      </section>
      <Radar subScores={subScores} tr={tr} />
    </>
  );
}

/** The only animation in the whole score screen, and it fires once. */
function ThrivingStars({ tr }: { tr: Tr }) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <div className="flex items-center gap-1.5" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="text-lg"
            style={{ animation: `hm-star 1.4s ease-in-out ${i * 0.12}s 3`, display: "inline-block" }}
          >
            ⭐
          </span>
        ))}
      </div>
      <h3 className="mt-2 font-display text-base font-semibold text-amber-700 dark:text-amber-300">
        {tr("hscore.thriving.title")}
      </h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{tr("hscore.thriving.body")}</p>
      <style>{`@keyframes hm-star{0%,100%{transform:translateY(0)}45%{transform:translateY(-7px)}}
        @media (prefers-reduced-motion: reduce){[style*="hm-star"]{animation:none !important}}`}</style>
    </section>
  );
}

// ── 5. goals → the directory ────────────────────────────────────────────────

function Goals({
  subScores,
  onOpen,
  tr,
}: {
  subScores: SubScore[];
  onOpen: (category: string) => void;
  tr: Tr;
}) {
  // Weakest first — a goal list that opens with what you're already good at is
  // a list nobody acts on.
  const ranked = [...subScores].sort(
    (a, b) => (a.max ? a.points / a.max : 0) - (b.max ? b.points / b.max : 0),
  );

  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold">{tr("hscore.goals.title")}</h3>
      <p className="mt-1 text-xs text-zinc-500">{tr("hscore.goals.hint")}</p>
      <ul className="mt-3 space-y-2">
        {ranked.slice(0, 3).map((s) => {
          const cat = categoryFor(s.key as ComponentKey);
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => cat && onOpen(cat.key)}
                disabled={!cat}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-zinc-200 px-4 py-3 text-left text-sm transition hover:border-amber-400 hover:bg-amber-50/50 disabled:cursor-default disabled:opacity-60 dark:border-zinc-800 dark:hover:border-amber-600 dark:hover:bg-amber-950/20"
              >
                <span className="font-medium">{tr(`hscore.goal.${s.key}`)}</span>
                {cat ? <span aria-hidden className="text-zinc-400">›</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── the tab ─────────────────────────────────────────────────────────────────

export default function HScoreView({
  hscore,
  movement,
  savingsGap,
  inputs,
  streakMonths,
  tr,
}: {
  hscore: HScore;
  /** Pre-computed by the caller — deterministic, never LLM-written. */
  movement: ScoreMovement | null;
  savingsGap: number | null;
  inputs: ScoreInputs;
  streakMonths: number;
  tr: Tr;
}) {
  const [category, setCategory] = useState<string | null>(null);

  if (category) {
    return <DirectoryView category={category} onBack={() => setCategory(null)} tr={tr} />;
  }

  const bufferMonths = inputs.mustPaidMonthly > 0 ? inputs.liquidSavings / inputs.mustPaidMonthly : 0;

  return (
    <div className="pb-4">
      <ScoreRing hscore={hscore} tr={tr} />
      <ProvisionalNotice hscore={hscore} tr={tr} />

      <SubScoreBars subScores={hscore.subScores} tr={tr} />
      {hscore.confidence.ok && <WhatMoved moved={movement} tr={tr} />}

      {/* Tier engagement only once the score is trustworthy. Firing the Thriving
          stars under a greyed ring that has just said "we don't have enough to
          be honest yet" congratulates someone on a number we disclaimed in the
          line above — and the provisional notice already names the next best
          action, which is to finish telling us what we're missing. */}
      {hscore.confidence.ok && (
        <>
          {hscore.band === "building" && (
            <BuildingCard score={hscore.score} gap={savingsGap} streak={streakMonths} tr={tr} />
          )}
          {hscore.band === "steady" && <BufferMeter months={bufferMonths} tr={tr} />}
          {hscore.band === "strong" && <StrongRecap subScores={hscore.subScores} tr={tr} />}
          {hscore.band === "thriving" && <ThrivingStars tr={tr} />}
        </>
      )}

      <Goals subScores={hscore.subScores} onOpen={setCategory} tr={tr} />

      <p className="mt-6 text-xs leading-relaxed text-zinc-400">{tr("hscore.window")}</p>
    </div>
  );
}
