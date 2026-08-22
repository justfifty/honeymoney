"use client";

// Server components can't hand a function across the boundary, and HScoreView
// needs a `tr`. So the locale crosses instead and the translator is rebuilt on
// this side — the same thing DemoApp does, which is why both callers can share
// one set of presentational components.

import { useCallback } from "react";
import { t as translate, type Locale } from "@/lib/i18n";
import type { HScore, ScoreInputs, ScoreMovement } from "@/lib/hscore";
import HScoreView from "./HScoreView";

export default function HScoreClient({
  lang,
  hscore,
  movement,
  savingsGap,
  inputs,
  streakMonths,
  unscoredCount,
}: {
  lang: Locale;
  hscore: HScore;
  movement: ScoreMovement | null;
  savingsGap: number | null;
  inputs: ScoreInputs;
  streakMonths: number;
  unscoredCount?: number;
}) {
  const tr = useCallback(
    (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars),
    [lang],
  );

  return (
    <HScoreView
      hscore={hscore}
      movement={movement}
      savingsGap={savingsGap}
      inputs={inputs}
      streakMonths={streakMonths}
      unscoredCount={unscoredCount}
      tr={tr}
    />
  );
}
