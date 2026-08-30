"use client";

import { useMemo, useState } from "react";
import { limitFor } from "@/lib/chartData";
import { CHART_VARS } from "@/lib/chartPalette";

// Force-directed node-link view of the knowledge graph (classic KG look).
// Dependency-free: a small deterministic force simulation (golden-angle seed,
// fixed iteration count) so server render and client render agree.

export interface NetNode {
  id: string;
  kind: string;
  label: string;
  sub?: string;
}

export interface NetEdge {
  src: string;
  dst: string;
  rel: string;
  flow: number;
  label: string;
}

const KIND_FILL: Record<string, string> = {
  income_source: CHART_VARS.income,
  bucket: CHART_VARS.bucket,
  wallet: CHART_VARS.bucket,
  vendor: CHART_VARS.spend,
  goal: CHART_VARS.saved,
  obligation: CHART_VARS.obligation,
  member: CHART_VARS.member,
};

const REL_STROKE: Record<string, { stroke: string; dash?: string }> = {
  ALLOCATES_FIXED: { stroke: CHART_VARS.income },
  ALLOCATES_PCT: { stroke: CHART_VARS.income, dash: "6 3" },
  FUNDS: { stroke: CHART_VARS.income },
  SPENT_AT: { stroke: CHART_VARS.spend },
  CONTRIBUTES_TO: { stroke: CHART_VARS.saved, dash: "4 4" },
  OWES: { stroke: CHART_VARS.obligation, dash: "2 4" },
};

const W = 900;
const H = 640;

function simulate(nodes: NetNode[], edges: NetEdge[]) {
  const n = nodes.length;
  const idx = new Map(nodes.map((node, i) => [node.id, i]));
  // deterministic initial placement on a golden-angle spiral
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = i * 2.399963;
    const r = 60 + 16 * Math.sqrt(i);
    x[i] = W / 2 + r * Math.cos(a);
    y[i] = H / 2 + r * Math.sin(a);
  }
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  const links = edges
    .map((e) => ({ a: idx.get(e.src), b: idx.get(e.dst) }))
    .filter((l): l is { a: number; b: number } => l.a !== undefined && l.b !== undefined);

  for (let step = 0; step < 320; step++) {
    // pairwise repulsion
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = x[i] - x[j];
        let dy = y[i] - y[j];
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) d2 = 1;
        const f = 16000 / d2;
        const d = Math.sqrt(d2);
        dx /= d;
        dy /= d;
        vx[i] += dx * f;
        vy[i] += dy * f;
        vx[j] -= dx * f;
        vy[j] -= dy * f;
      }
    }
    // springs along edges
    for (const { a, b } of links) {
      const dx = x[b] - x[a];
      const dy = y[b] - y[a];
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const f = 0.025 * (d - 130);
      vx[a] += (dx / d) * f;
      vy[a] += (dy / d) * f;
      vx[b] -= (dx / d) * f;
      vy[b] -= (dy / d) * f;
    }
    // gravity to center + integrate with damping
    for (let i = 0; i < n; i++) {
      vx[i] += (W / 2 - x[i]) * 0.012;
      vy[i] += (H / 2 - y[i]) * 0.012;
      x[i] += Math.max(-14, Math.min(14, vx[i] * 0.08));
      y[i] += Math.max(-14, Math.min(14, vy[i] * 0.08));
      vx[i] *= 0.6;
      vy[i] *= 0.6;
      x[i] = Math.max(60, Math.min(W - 60, x[i]));
      y[i] = Math.max(46, Math.min(H - 40, y[i]));
    }
  }
  return { x, y, idx };
}

/**
 * Keep the most CONNECTED nodes. In a knowledge graph the interesting nodes are
 * the ones with edges — an isolated vendor with a single link tells nobody
 * anything — and a force-directed layout becomes a hairball long before it runs
 * out of pixels, which is the honest reason this is the weakest of the three
 * hierarchy views.
 *
 * Applied BEFORE the simulation, which is O(n²) per tick: capping afterwards
 * would still pay the full cost and then throw the result away.
 */
function capByDegree(nodes: NetNode[], edges: NetEdge[], cap: number) {
  if (nodes.length <= cap + 1) return { shownNodes: nodes, shownEdges: edges };
  const deg = new Map<string, number>();
  for (const e of edges) {
    deg.set(e.src, (deg.get(e.src) ?? 0) + 1);
    deg.set(e.dst, (deg.get(e.dst) ?? 0) + 1);
  }
  const keep = new Set(
    [...nodes].sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0)).slice(0, cap).map((n) => n.id),
  );
  return {
    shownNodes: nodes.filter((n) => keep.has(n.id)),
    // An edge to a dropped node would draw a line into empty space.
    shownEdges: edges.filter((e) => keep.has(e.src) && keep.has(e.dst)),
  };
}

export default function NetworkGraph({ nodes, edges }: { nodes: NetNode[]; edges: NetEdge[] }) {
  const [focus, setFocus] = useState<string | null>(null);

  // Capped BEFORE the force simulation, not after. A node-link diagram becomes a
  // hairball long before it runs out of pixels — which is the honest reason it
  // is the weakest of the three hierarchy views — and the simulation is O(n²)
  // per tick, so drawing 200 nodes costs both legibility and a visible pause.
  //
  // Kept by DEGREE: in a knowledge graph the interesting nodes are the connected
  // ones, and an isolated vendor with a single edge tells nobody anything.
  const { shownNodes, shownEdges } = useMemo(
    () => capByDegree(nodes, edges, limitFor("organic", 900)),
    [nodes, edges],
  );

  const { x, y, idx } = useMemo(() => simulate(shownNodes, shownEdges), [shownNodes, shownEdges]);

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of edges) {
      d.set(e.src, (d.get(e.src) ?? 0) + 1);
      d.set(e.dst, (d.get(e.dst) ?? 0) + 1);
    }
    return d;
  }, [edges]);

  const maxFlow = Math.max(...edges.map((e) => e.flow), 1);
  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!m.has(e.src)) m.set(e.src, new Set());
      if (!m.has(e.dst)) m.set(e.dst, new Set());
      m.get(e.src)!.add(e.dst);
      m.get(e.dst)!.add(e.src);
    }
    return m;
  }, [edges]);

  const dimmed = (id: string) =>
    focus !== null && id !== focus && !(neighbors.get(focus)?.has(id) ?? false);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 700 }} role="img" aria-label="Knowledge graph network view">
      {edges.map((e, i) => {
        const a = idx.get(e.src);
        const b = idx.get(e.dst);
        if (a === undefined || b === undefined) return null;
        const s = REL_STROKE[e.rel] ?? { stroke: "#999" };
        const active = focus === e.src || focus === e.dst;
        const faded = focus !== null && !active;
        return (
          <g key={`e${i}`} opacity={faded ? 0.12 : 0.6}>
            <line
              x1={x[a]} y1={y[a]} x2={x[b]} y2={y[b]}
              stroke={s.stroke}
              strokeWidth={1 + (e.flow / maxFlow) * 6}
              strokeDasharray={s.dash}
            />
            {active && e.label && (
              <text x={(x[a] + x[b]) / 2} y={(y[a] + y[b]) / 2 - 5} textAnchor="middle" fontSize="10" className="fill-zinc-500">
                {e.label}
              </text>
            )}
            <title>{`${e.rel}: ${e.label}`}</title>
          </g>
        );
      })}
      {nodes.map((n) => {
        const i = idx.get(n.id);
        if (i === undefined) return null;
        const r = 10 + Math.min((degree.get(n.id) ?? 1) * 2.2, 16);
        return (
          <g
            key={n.id}
            opacity={dimmed(n.id) ? 0.18 : 1}
            onMouseEnter={() => setFocus(n.id)}
            onMouseLeave={() => setFocus(null)}
            style={{ cursor: "pointer" }}
          >
            <circle cx={x[i]} cy={y[i]} r={r} fill={KIND_FILL[n.kind] ?? "#888"} opacity="0.88" stroke="white" strokeWidth="1.5" />
            <text x={x[i]} y={y[i] + r + 12} textAnchor="middle" fontSize="10.5" fontWeight="600" className="fill-zinc-700 dark:fill-zinc-200">
              {n.label}
            </text>
            {n.sub && (
              <text x={x[i]} y={y[i] + r + 24} textAnchor="middle" fontSize="9" className="fill-zinc-400">
                {n.sub}
              </text>
            )}
            <title>{`${n.kind}: ${n.label}`}</title>
          </g>
        );
      })}
    </svg>
  );
}
