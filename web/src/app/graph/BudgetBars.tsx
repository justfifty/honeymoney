"use client";

import { useMemo, useState } from "react";
import { fmtMoney } from "@/lib/format";
import { topNWithOther, limitFor, otherLabel } from "@/lib/chartData";
import ChartEmpty from "./ChartEmpty";
import { CHART_VARS } from "@/lib/chartPalette";

// Budget vs Actual — one shared RM scale across every bucket, so bar lengths are
// directly comparable (unlike the dashboard's per-bucket % bars). Each row shows
// the allocation track (recessive) with the projected-spend bar on top, colored
// by status. The single most direct "are we on plan?" monitoring read.

export interface BarRow {
  id: string;
  label: string;
  allocated: number;
  projected: number;
  status: "on_track" | "at_risk" | "over_budget" | "unfunded";
}

const STATUS_COLOR: Record<string, string> = {
  on_track: CHART_VARS.saved,
  at_risk: CHART_VARS.atRisk,
  over_budget: CHART_VARS.spend,
  unfunded: CHART_VARS.neutral,
};

const W = 900;
const ROW = 40;
const TOP = 34;
const LABEL_W = 150;
const RIGHT = 60;

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const ticks: number[] = [];
  for (let t = 0; t <= max + step * 0.5; t += step) ticks.push(t);
  return ticks;
}

export default function BudgetBars({ rows, ccy = "MYR" }: { rows: BarRow[]; ccy?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const rm0 = (n: number) => fmtMoney(n, ccy, { round: true });
  // Top N by allocation, with the rest folded into one inspectable row rather
  // than 200 unreadable ones. See lib/chartData.ts for why the cap exists and
  // why it sorts by value.
  const data = useMemo(() => {
    const { shown, other } = topNWithOther(rows, limitFor("bars", 900), (r) => r.allocated);
    const sorted = shown.slice().sort((a, b) => b.allocated - a.allocated);
    if (!other) return sorted;
    return [
      ...sorted,
      {
        id: "__other__",
        label: otherLabel(other.count),
        tier: 3,
        allocated: other.value,
        projected: other.items.reduce((s, r) => s + r.projected, 0),
        status: "on_track" as const,
      },
    ];
  }, [rows]);

  if (!rows.length) {
    return (
      <ChartEmpty
        title="Nothing to compare yet"
        body="Budget versus actual needs at least one bucket with money in it."
        cta="Record a spend"
      />
    );
  }

  const max = Math.max(...data.map((r) => Math.max(r.allocated, r.projected)), 1);
  const ticks = niceTicks(max);
  const plotMax = ticks[ticks.length - 1] || max;
  const plotW = W - LABEL_W - RIGHT;
  const xOf = (v: number) => LABEL_W + (v / plotMax) * plotW;
  const H = TOP + data.length * ROW + 24;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 620 }} role="img" aria-label="Budget versus actual spending by bucket">
      {/* gridlines + x axis */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={xOf(t)} y1={TOP - 8} x2={xOf(t)} y2={TOP + data.length * ROW} className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth={1} />
          <text x={xOf(t)} y={TOP - 14} textAnchor="middle" fontSize="9.5" className="fill-zinc-400">
            {t >= 1000 ? `${Math.round(t / 100) / 10}k` : Math.round(t)}
          </text>
        </g>
      ))}

      {data.map((r, i) => {
        const y = TOP + i * ROW;
        const cy = y + ROW / 2;
        const color = STATUS_COLOR[r.status] ?? STATUS_COLOR.unfunded;
        const allocW = xOf(r.allocated) - LABEL_W;
        const projW = xOf(Math.min(r.projected, plotMax)) - LABEL_W;
        const active = hover === null || hover === r.id;
        const over = r.projected > r.allocated;
        return (
          <g key={r.id} opacity={active ? 1 : 0.4} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
            <text x={LABEL_W - 10} y={cy + 3.5} textAnchor="end" fontSize="11.5" fontWeight="600" className="fill-zinc-700 dark:fill-zinc-200">
              {r.label.length > 22 ? r.label.slice(0, 21) + "…" : r.label}
            </text>
            {/* allocation track */}
            <rect x={LABEL_W} y={cy - 9} width={Math.max(0, allocW)} height={18} rx={5} className="fill-zinc-200 dark:fill-zinc-800" />
            {/* projected spend */}
            <rect x={LABEL_W} y={cy - 9} width={Math.max(2, projW)} height={18} rx={5} fill={color} opacity={0.9} />
            {/* allocation cap marker */}
            <line x1={xOf(r.allocated)} y1={cy - 12} x2={xOf(r.allocated)} y2={cy + 12} stroke={color} strokeWidth={over ? 2 : 1.4} strokeDasharray="2 2" opacity={0.85} />
            <text x={xOf(Math.max(r.allocated, Math.min(r.projected, plotMax))) + 8} y={cy + 3.5} fontSize="10" className="fill-zinc-500">
              {rm0(r.projected)}{over ? ` · ${rm0(r.projected - r.allocated)} over` : ` / ${rm0(r.allocated)}`}
            </text>
            <title>{`${r.label}: projected ${rm0(r.projected)} of ${rm0(r.allocated)} allocated`}</title>
          </g>
        );
      })}
    </svg>
  );
}
