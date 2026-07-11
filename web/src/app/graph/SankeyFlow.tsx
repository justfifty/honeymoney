"use client";

import { useMemo, useState } from "react";
import { fmtMoney } from "@/lib/format";
import { t as translate, type Locale } from "@/lib/i18n";

// Sankey money-flow: Income → Buckets → where it lands (Spending vs Saved).
// Node height ∝ RM throughput, ribbon width ∝ RM flow. Everything is derived
// from the graph edges: a bucket's allocation is the sum of amber inflows, its
// spend is the sum of red SPENT_AT outflows, and the rest is "Saved" (green).
// Dependency-free; deterministic layout so server & client renders agree.

export interface SankNode {
  id: string;
  kind: string;
  label: string;
}
export interface SankEdge {
  src: string;
  dst: string;
  rel: string;
  flow: number;
}

const W = 920;
const H = 500;
const NW = 16; // node bar width
const GAP = 12; // vertical gap between nodes in a column
const TOP = 44;
const BOT = 24;
const SAVED_ID = "__saved__";

const ALLOC = new Set(["ALLOCATES_FIXED", "ALLOCATES_PCT", "FUNDS"]);
const AMBER = "#E8A012";
const RED = "#C94F4F";
const GREEN = "#248A54";

interface Placed {
  id: string;
  label: string;
  col: number;
  value: number;
  x: number;
  y: number;
  h: number;
  color: string;
}
interface Ribbon {
  key: string;
  d: string;
  width: number;
  color: string;
  src: string;
  dst: string;
  label: string;
}

function build(nodes: SankNode[], edges: SankEdge[], ccy: string, lang: Locale) {
  const rm0 = (n: number) => fmtMoney(n, ccy, { round: true });
  const tr = (k: string) => translate(lang, k);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const col = (id: string): number => {
    const k = byId.get(id)?.kind;
    if (k === "income_source") return 0;
    if (k === "bucket") return 1;
    return 2; // vendor / goal / obligation
  };

  // aggregate flows
  const alloc = new Map<string, number>(); // `${income} ${bucket}`
  const spend = new Map<string, number>(); // `${bucket} ${vendor}`
  const bucketIn = new Map<string, number>();
  const bucketOut = new Map<string, number>();
  const incomeOut = new Map<string, number>();
  const vendorIn = new Map<string, number>();

  for (const e of edges) {
    if (!byId.has(e.src) || !byId.has(e.dst) || e.flow <= 0) continue;
    if (ALLOC.has(e.rel) && col(e.src) === 0 && col(e.dst) === 1) {
      alloc.set(`${e.src} ${e.dst}`, (alloc.get(`${e.src} ${e.dst}`) ?? 0) + e.flow);
      bucketIn.set(e.dst, (bucketIn.get(e.dst) ?? 0) + e.flow);
      incomeOut.set(e.src, (incomeOut.get(e.src) ?? 0) + e.flow);
    } else if (e.rel === "SPENT_AT" && col(e.src) === 1) {
      spend.set(`${e.src} ${e.dst}`, (spend.get(`${e.src} ${e.dst}`) ?? 0) + e.flow);
      bucketOut.set(e.src, (bucketOut.get(e.src) ?? 0) + e.flow);
      vendorIn.set(e.dst, (vendorIn.get(e.dst) ?? 0) + e.flow);
    }
  }

  // build placed nodes per column
  const incomes = [...incomeOut.entries()]
    .map(([id, v]) => ({ id, label: byId.get(id)?.label ?? id, col: 0, value: v, color: AMBER }))
    .sort((a, b) => b.value - a.value);

  const buckets = [...bucketIn.entries()]
    .map(([id, inV]) => {
      const spent = bucketOut.get(id) ?? 0;
      return { id, label: byId.get(id)?.label ?? id, col: 1, value: Math.max(inV, spent), color: "#5B7DB1", inV, spent };
    })
    .sort((a, b) => b.value - a.value);

  const vendors = [...vendorIn.entries()]
    .map(([id, v]) => ({ id, label: byId.get(id)?.label ?? id, col: 2, value: v, color: RED }))
    .sort((a, b) => b.value - a.value);

  const savedTotal = buckets.reduce((s, b) => s + Math.max(0, b.inV - b.spent), 0);
  const dests = [...vendors];
  if (savedTotal > 0.5) dests.push({ id: SAVED_ID, label: tr("g.sankey.saved"), col: 2, value: savedTotal, color: GREEN });

  const columns = [incomes, buckets, dests];
  const availH = H - TOP - BOT;
  let scale = Infinity;
  for (const c of columns) {
    const sum = c.reduce((s, n) => s + n.value, 0);
    if (sum <= 0) continue;
    const s = (availH - GAP * Math.max(0, c.length - 1)) / sum;
    scale = Math.min(scale, s);
  }
  if (!isFinite(scale) || scale <= 0) scale = 1;

  const colX = [64, (W - NW) / 2, W - 64 - NW];
  const placed = new Map<string, Placed>();
  columns.forEach((c, ci) => {
    const colH = c.reduce((s, n) => s + n.value * scale, 0) + GAP * Math.max(0, c.length - 1);
    let y = TOP + (availH - colH) / 2;
    for (const n of c) {
      const h = n.value * scale;
      placed.set(n.id, { id: n.id, label: n.label, col: ci, value: n.value, x: colX[ci], y, h, color: n.color });
      y += h + GAP;
    }
  });

  // ribbons — stack at each endpoint, ordered by the opposite node's y to reduce crossings
  const outCursor = new Map<string, number>();
  const inCursor = new Map<string, number>();
  const ribbons: Ribbon[] = [];

  const links: Array<{ src: string; dst: string; flow: number; color: string; label: string }> = [];
  for (const [k, flow] of alloc) {
    const [src, dst] = k.split(" ");
    links.push({ src, dst, flow, color: AMBER, label: tr("g.sankey.allocation") });
  }
  for (const [k, flow] of spend) {
    const [src, dst] = k.split(" ");
    links.push({ src, dst, flow, color: RED, label: tr("g.sankey.spend") });
  }
  for (const b of buckets) {
    const saved = Math.max(0, b.inV - b.spent);
    if (saved > 0.5) links.push({ src: b.id, dst: SAVED_ID, flow: saved, color: GREEN, label: tr("g.sankey.savedRibbon") });
  }

  const yOf = (id: string) => placed.get(id)?.y ?? 0;
  links.sort((a, b) => yOf(a.dst) - yOf(b.dst) || yOf(a.src) - yOf(b.src));
  // order outgoing by dst y, incoming by src y
  const bySrc = new Map<string, typeof links>();
  const byDst = new Map<string, typeof links>();
  for (const l of links) {
    (bySrc.get(l.src) ?? bySrc.set(l.src, []).get(l.src)!).push(l);
    (byDst.get(l.dst) ?? byDst.set(l.dst, []).get(l.dst)!).push(l);
  }
  for (const arr of bySrc.values()) arr.sort((a, b) => yOf(a.dst) - yOf(b.dst));
  for (const arr of byDst.values()) arr.sort((a, b) => yOf(a.src) - yOf(b.src));

  const emitted = new Set<typeof links[number]>();
  const emit = (l: typeof links[number]) => {
    if (emitted.has(l)) return;
    emitted.add(l);
    const s = placed.get(l.src)!;
    const t = placed.get(l.dst)!;
    const w = l.flow * scale;
    const so = outCursor.get(l.src) ?? 0;
    const to = inCursor.get(l.dst) ?? 0;
    outCursor.set(l.src, so + w);
    inCursor.set(l.dst, to + w);
    const x1 = s.x + NW;
    const x2 = t.x;
    const y1 = s.y + so + w / 2;
    const y2 = t.y + to + w / 2;
    const mx = (x1 + x2) / 2;
    ribbons.push({
      key: `${l.src}-${l.dst}-${l.label}`,
      d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
      width: Math.max(1, w),
      color: l.color,
      src: l.src,
      dst: l.dst,
      label: `${rm0(l.flow)} · ${l.label}`,
    });
  };
  // emit in a stable order that respects both cursors: walk columns left→right
  for (const b of bySrc.values()) for (const l of b) emit(l);

  return { placed: [...placed.values()], ribbons };
}

export default function SankeyFlow({ nodes, edges, ccy = "MYR", lang = "en" }: { nodes: SankNode[]; edges: SankEdge[]; ccy?: string; lang?: Locale }) {
  const [focus, setFocus] = useState<string | null>(null);
  const { placed, ribbons } = useMemo(() => build(nodes, edges, ccy, lang), [nodes, edges, ccy, lang]);
  const rm0 = (n: number) => fmtMoney(n, ccy, { round: true });
  const tr = (k: string) => translate(lang, k);

  const dim = (id: string) => focus !== null && id !== focus;
  const labelFits = (h: number) => h >= 13;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 680 }} role="img" aria-label="Sankey money flow: income to buckets to spending and savings">
      {/* column captions */}
      <text x={64} y={26} fontSize="12" fontWeight="700" className="fill-zinc-400">{tr("g.sankey.income")}</text>
      <text x={W / 2} y={26} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-zinc-400">{tr("g.sankey.buckets")}</text>
      <text x={W - 64} y={26} textAnchor="end" fontSize="12" fontWeight="700" className="fill-zinc-400">{tr("g.sankey.landing")}</text>

      {ribbons.map((r) => {
        const active = focus === null || focus === r.src || focus === r.dst;
        return (
          <path
            key={r.key}
            d={r.d}
            fill="none"
            stroke={r.color}
            strokeWidth={r.width}
            opacity={active ? 0.5 : 0.08}
          >
            <title>{r.label}</title>
          </path>
        );
      })}

      {placed.map((n) => {
        const right = n.col === 2;
        const lx = right ? n.x - 8 : n.x + NW + 8;
        const anchor = right ? "end" : "start";
        return (
          <g
            key={n.id}
            opacity={dim(n.id) ? 0.35 : 1}
            onMouseEnter={() => setFocus(n.id)}
            onMouseLeave={() => setFocus(null)}
            style={{ cursor: "pointer" }}
          >
            <rect x={n.x} y={n.y} width={NW} height={Math.max(2, n.h)} rx={3} fill={n.color} />
            {labelFits(n.h) && (
              <text x={lx} y={n.y + n.h / 2 - 1} textAnchor={anchor} fontSize="11" fontWeight="600" className="fill-zinc-700 dark:fill-zinc-200">
                {n.label}
              </text>
            )}
            {labelFits(n.h) && n.h >= 26 && (
              <text x={lx} y={n.y + n.h / 2 + 12} textAnchor={anchor} fontSize="9.5" className="fill-zinc-400">
                {rm0(n.value)}
              </text>
            )}
            <title>{`${n.label} — ${rm0(n.value)}`}</title>
          </g>
        );
      })}
    </svg>
  );
}
