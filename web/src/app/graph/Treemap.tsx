"use client";

import { useMemo, useState } from "react";
import { fmtMoney } from "@/lib/format";

// Squarified treemap of buckets: cell AREA ∝ monthly allocation (where the plan
// commits money), cell COLOR ∝ status, and a solid fill rising from the baseline
// ∝ projected-spend / allocation (how hot the bucket is running). Dependency-free.

export interface TreemapCell {
  id: string;
  label: string;
  allocated: number;
  projected: number;
  status: "on_track" | "at_risk" | "over_budget" | "unfunded";
  tier: number;
}

const STATUS: Record<string, { solid: string; label: string }> = {
  on_track: { solid: "#248A54", label: "On track" },
  at_risk: { solid: "#E8A012", label: "At risk" },
  over_budget: { solid: "#C94F4F", label: "Over budget" },
  unfunded: { solid: "#9AA0A6", label: "Unfunded" },
};

const W = 920;
const H = 470;
const PAD = 3; // surface gap between cells

interface Rect {
  cell: TreemapCell;
  area: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

function worst(row: { area: number }[], side: number): number {
  if (row.length === 0) return Infinity;
  let sum = 0;
  let max = -Infinity;
  let min = Infinity;
  for (const r of row) {
    sum += r.area;
    if (r.area > max) max = r.area;
    if (r.area < min) min = r.area;
  }
  const s2 = sum * sum;
  const side2 = side * side;
  return Math.max((side2 * max) / s2, s2 / (side2 * min));
}

function squarify(items: { cell: TreemapCell; area: number }[]): Rect[] {
  const out: Rect[] = [];
  let rest = items.slice().sort((a, b) => b.area - a.area);
  let x = 0;
  let y = 0;
  let w = W;
  let h = H;

  while (rest.length) {
    const row: { cell: TreemapCell; area: number }[] = [rest[0]];
    let i = 1;
    const side = Math.min(w, h);
    while (i < rest.length && worst(row, side) >= worst([...row, rest[i]], side)) {
      row.push(rest[i]);
      i++;
    }
    const rowArea = row.reduce((s, d) => s + d.area, 0);
    if (w >= h) {
      const dw = rowArea / h || 0;
      let cy = y;
      for (const d of row) {
        const dh = dw > 0 ? d.area / dw : 0;
        out.push({ ...d, x, y: cy, w: dw, h: dh });
        cy += dh;
      }
      x += dw;
      w -= dw;
    } else {
      const dh = rowArea / w || 0;
      let cx = x;
      for (const d of row) {
        const dw = dh > 0 ? d.area / dh : 0;
        out.push({ ...d, x: cx, y, w: dw, h: dh });
        cx += dw;
      }
      y += dh;
      h -= dh;
    }
    rest = rest.slice(i);
  }
  return out;
}

export default function Treemap({ cells, ccy = "MYR" }: { cells: TreemapCell[]; ccy?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const rm0 = (n: number) => fmtMoney(n, ccy, { round: true });

  const rects = useMemo(() => {
    const total = cells.reduce((s, c) => s + Math.max(c.allocated, 0), 0) || 1;
    const scale = (W * H) / total;
    const items = cells
      .filter((c) => c.allocated > 0)
      .map((c) => ({ cell: c, area: Math.max(c.allocated, 0) * scale }));
    return squarify(items);
  }, [cells]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 640 }} role="img" aria-label="Budget treemap: bucket allocation and spend health">
      {rects.map((r) => {
        const c = r.cell;
        const s = STATUS[c.status] ?? STATUS.unfunded;
        const ratio = c.allocated > 0 ? Math.min(1.15, c.projected / c.allocated) : 0;
        const ix = r.x + PAD;
        const iy = r.y + PAD;
        const iw = Math.max(0, r.w - PAD * 2);
        const ih = Math.max(0, r.h - PAD * 2);
        const fillH = Math.min(ih, ih * ratio);
        const active = hover === c.id;
        const roomy = iw > 74 && ih > 40;
        return (
          <g
            key={c.id}
            onMouseEnter={() => setHover(c.id)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: "default" }}
          >
            {/* base tint */}
            <rect x={ix} y={iy} width={iw} height={ih} rx={7} fill={s.solid} opacity={0.16} />
            {/* projected-spend fill rising from the baseline */}
            <clipPath id={`clip-${c.id}`}>
              <rect x={ix} y={iy} width={iw} height={ih} rx={7} />
            </clipPath>
            <rect
              x={ix}
              y={iy + ih - fillH}
              width={iw}
              height={fillH}
              fill={s.solid}
              opacity={active ? 0.72 : 0.5}
              clipPath={`url(#clip-${c.id})`}
            />
            <rect
              x={ix}
              y={iy}
              width={iw}
              height={ih}
              rx={7}
              fill="none"
              stroke={s.solid}
              strokeWidth={active ? 2.4 : 1.2}
              opacity={0.9}
            />
            {roomy && (
              <>
                <text x={ix + 10} y={iy + 20} fontSize="12.5" fontWeight="700" className="fill-zinc-800 dark:fill-zinc-100">
                  {c.label}
                </text>
                <text x={ix + 10} y={iy + 37} fontSize="11" className="fill-zinc-600 dark:fill-zinc-300">
                  {rm0(c.allocated)}
                </text>
                {ih > 58 && (
                  <text x={ix + 10} y={iy + ih - 10} fontSize="10" className="fill-zinc-500 dark:fill-zinc-400">
                    {rm0(c.projected)} proj · {Math.round((c.projected / (c.allocated || 1)) * 100)}%
                  </text>
                )}
              </>
            )}
            {!roomy && iw > 30 && ih > 16 && (
              <text x={ix + 5} y={iy + 13} fontSize="9.5" fontWeight="600" className="fill-zinc-700 dark:fill-zinc-200">
                {c.label.length > Math.floor(iw / 6) ? c.label.slice(0, Math.floor(iw / 6)) + "…" : c.label}
              </text>
            )}
            <title>{`${c.label} — allocated ${rm0(c.allocated)}, projected ${rm0(c.projected)} (${s.label})`}</title>
          </g>
        );
      })}
    </svg>
  );
}
