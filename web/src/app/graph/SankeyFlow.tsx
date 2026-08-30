"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtMoney } from "@/lib/format";
import { t as translate, type Locale } from "@/lib/i18n";
import { topNWithOther, limitFor, otherLabel } from "@/lib/chartData";
import { CHART_VARS } from "@/lib/chartPalette";

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
const OTHER_ID = "__other__";
// Past this many landing nodes the Sankey stops being a Sankey and becomes a
// barcode. The tail vendors render as unlabelled hairlines, and — worse — the
// GAP under each of them steals height from the shared scale, squeezing every
// bucket bar in the MIDDLE column below the height its own label needs. So the
// tail folds into one honest "Other" node: the column total is unchanged, and
// so is every ribbon width. Real households have far more vendors than the demo
// personas, so this is a legibility floor, not a demo tweak.
const MAX_DESTS = 12;

const ALLOC = new Set(["ALLOCATES_FIXED", "ALLOCATES_PCT", "FUNDS"]);
const AMBER = CHART_VARS.income;
const RED = CHART_VARS.spend;
const GREEN = CHART_VARS.saved;

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

function build(nodes: SankNode[], edges: SankEdge[], ccy: string, lang: Locale, boxWidth = 900) {
  const rm0 = (n: number) => fmtMoney(n, ccy, { round: true });
  const tr = (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars);

  // Cap the THIRD column before anything else. A Sankey's readability is set by
  // its thinnest band, and the vendor column is where the long tail lives — a
  // household with 200 merchants gets 200 slivers a pixel high, none of them
  // labelled, which is worse than not drawing them. Income sources and buckets
  // are left alone: households have a handful of each by construction, and they
  // are the structure the diagram exists to show.
  //
  // Ranked by the flow reaching each node, so the merchants that survive are the
  // ones actually carrying money.
  const byIdRaw = new Map(nodes.map((n) => [n.id, n]));
  const vendorFlow = new Map<string, number>();
  for (const e of edges) vendorFlow.set(e.dst, (vendorFlow.get(e.dst) ?? 0) + e.flow);

  // The real measured width, so a phone folds the long tail far harder than a
  // laptop does — six bands instead of twelve.
  const cap = limitFor("sankey", boxWidth);
  const thirdCol = nodes.filter((n) => n.kind !== "income_source" && n.kind !== "bucket");
  const fold = topNWithOther(thirdCol, cap, (n) => vendorFlow.get(n.id) ?? 0);

  // Buckets are capped too, at a more generous limit. A household has a handful
  // by construction — the seeded one has thirteen — but they are user-created and
  // nothing stops a household making sixty, at which point the middle column is
  // as unreadable as the vendor column was. Folding is the same operation; only
  // the threshold differs, because the middle column is the STRUCTURE the
  // diagram exists to show and deserves more room before it is summarised.
  const bucketFlow = new Map<string, number>();
  for (const e of edges) {
    bucketFlow.set(e.dst, (bucketFlow.get(e.dst) ?? 0) + e.flow);
    bucketFlow.set(e.src, (bucketFlow.get(e.src) ?? 0) + e.flow);
  }
  const bucketCol = nodes.filter((n) => n.kind === "bucket");
  const bucketFold = topNWithOther(bucketCol, cap * 2, (n) => bucketFlow.get(n.id) ?? 0);

  let workingNodes = nodes;
  let workingEdges = edges;
  if (fold.other || bucketFold.other) {
    const dropped = new Set([
      ...(fold.other?.items ?? []).map((n) => n.id),
      ...(bucketFold.other?.items ?? []).map((n) => n.id),
    ]);
    const OTHER_ID = "__sankey_other__";
    workingNodes = [
      ...nodes.filter((n) => !dropped.has(n.id)),
      ...(fold.other ? [{ id: OTHER_ID, kind: "vendor", label: otherLabel(fold.other.count) }] : []),
      ...(bucketFold.other
        ? [{ id: "__sankey_other_bucket__", kind: "bucket", label: otherLabel(bucketFold.other.count) }]
        : []),
    ];
    // Edges to folded nodes are REPOINTED at the aggregate rather than dropped,
    // so every ringgit still lands somewhere and the diagram continues to
    // balance. A Sankey that silently loses flow is worse than a cluttered one:
    // it shows money disappearing.
    const BUCKET_OTHER = "__sankey_other_bucket__";
    const aggregateOf = (id: string) => {
      const kind = byIdRaw.get(id)?.kind;
      return kind === "bucket" ? BUCKET_OTHER : OTHER_ID;
    };
    // BOTH ends are repointed, not just the destination: a folded bucket is the
    // SOURCE of its spending edges as well as the target of its allocations, and
    // rewriting only one end would leave edges dangling into a node that is no
    // longer drawn.
    const merged = new Map<string, number>();
    workingEdges = [];
    for (const e of edges) {
      const srcGone = dropped.has(e.src);
      const dstGone = dropped.has(e.dst);
      if (!srcGone && !dstGone) {
        workingEdges.push(e);
        continue;
      }
      const src = srcGone ? aggregateOf(e.src) : e.src;
      const dst = dstGone ? aggregateOf(e.dst) : e.dst;
      // A flow whose two ends both folded into the same node would be a loop —
      // money leaving a box and arriving back in it — so it is dropped rather
      // than drawn as a meaningless self-edge.
      if (src === dst) continue;
      const key = `${src}|${dst}|${e.rel}`;
      merged.set(key, (merged.get(key) ?? 0) + e.flow);
    }
    for (const [key, flow] of merged) {
      const [src, dst, rel] = key.split("|");
      workingEdges.push({ src, dst, rel, flow });
    }
  }

  nodes = workingNodes;
  edges = workingEdges;

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

  // A bucket belongs in the middle column if money moves through it in EITHER
  // direction. This used to be built from bucketIn alone — buckets that receive
  // an ALLOCATES edge — and ALLOCATES edges only exist once income is declared
  // on this page. A household that types spends but never declares income (which
  // is every real signup so far; income for scoring is a node, not a transaction)
  // had an empty middle column while its SPENT_AT ribbons still pointed at those
  // buckets: placed.get(src) came back undefined and the DEFAULT graph view
  // crashed with a 500 for exactly the users with real data. The demo personas
  // all declare income, which is why no persona ever reproduced it.
  const bucketIds = [...new Set([...bucketIn.keys(), ...bucketOut.keys()])];
  const buckets = bucketIds
    .map((id) => {
      const inV = bucketIn.get(id) ?? 0;
      const spent = bucketOut.get(id) ?? 0;
      return { id, label: byId.get(id)?.label ?? id, col: 1, value: Math.max(inV, spent), color: CHART_VARS.bucket, inV, spent };
    })
    .sort((a, b) => b.value - a.value);

  const vendors = [...vendorIn.entries()]
    .map(([id, v]) => ({ id, label: byId.get(id)?.label ?? id, col: 2, value: v, color: RED }))
    .sort((a, b) => b.value - a.value);

  // Fold the long tail of vendors into a single node (see MAX_DESTS). destOf
  // records the redirect so the spend ribbons follow their vendor.
  const destOf = new Map<string, string>();
  let landing = vendors;
  if (vendors.length > MAX_DESTS) {
    const tail = vendors.slice(MAX_DESTS - 1);
    for (const n of tail) destOf.set(n.id, OTHER_ID);
    landing = [
      ...vendors.slice(0, MAX_DESTS - 1),
      {
        id: OTHER_ID,
        label: tr("g.sankey.other", { n: tail.length }),
        col: 2,
        value: tail.reduce((s, n) => s + n.value, 0),
        color: RED,
      },
    ];
  }

  const savedTotal = buckets.reduce((s, b) => s + Math.max(0, b.inV - b.spent), 0);
  const dests = [...landing];
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
  // A folded vendor's spend follows it into "Other", and the redirected flows
  // merge so one bucket never draws two ribbons to the same landing node.
  const spendMerged = new Map<string, number>();
  for (const [k, flow] of spend) {
    const [src, dst] = k.split(" ");
    const key = `${src} ${destOf.get(dst) ?? dst}`;
    spendMerged.set(key, (spendMerged.get(key) ?? 0) + flow);
  }
  for (const [k, flow] of spendMerged) {
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
    // Belt to the braces above: a link whose endpoint was never laid out is
    // dropped, not drawn from undefined. Losing one ribbon is a display gap;
    // throwing here is a blank 500 over the whole page.
    const s = placed.get(l.src);
    const t = placed.get(l.dst);
    if (!s || !t) return;
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

  // ── NARROW WIDTHS ────────────────────────────────────────────────────────
  //
  // The brief singles this out — "Sankey at 375px is the risk to design for" —
  // and offers three strategies in preference order. The first is taken,
  // **aggregate harder at narrow widths**, split across two mechanisms because
  // they solve different halves and only one of them can wait for hydration:
  //
  //   LAYOUT is CSS (`min-w-0 sm:min-w-[680px]` on the svg below). It has to be
  //     right in the server-rendered HTML — a JS-applied width lands after
  //     hydration, so the first paint on a phone overflows and the page jumps.
  //     THE BUG THIS FIXED: `min-width: 680px` on a 375px phone dragged the whole
  //     page to 738px, header and nav scrolling sideways with it, because <main>
  //     lacked `w-full` and grew to fit rather than letting the chart container
  //     clip. Measured at 320/375/768 before and after; the page is now exactly
  //     the viewport width at all three.
  //
  //   DATA is JS (below). Folding twelve bands to six is a re-render, not a
  //     layout shift, so it can safely arrive after hydration — and it is what
  //     actually makes the chart readable. Scrolling alone never was: a user is
  //     not helped by being able to pan across slivers they still cannot read.
  //
  // matchMedia on the VIEWPORT, deliberately not a ResizeObserver on the chart's
  // own box. The observer was tried first and fed back on itself — it measured
  // the element `minWidth` was inflating, so the box always reported ≥640 and the
  // floor never came off. The viewport cannot be affected by what the chart does,
  // which is the whole property required.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Starts false so the first client render matches the server's, then updates —
  // the standard way to avoid a hydration mismatch while still adapting.
  const boxWidth = narrow ? 375 : 900;

  const { placed, ribbons } = useMemo(
    () => build(nodes, edges, ccy, lang, boxWidth),
    [nodes, edges, ccy, lang, boxWidth],
  );
  const rm0 = (n: number) => fmtMoney(n, ccy, { round: true });
  const tr = (k: string) => translate(lang, k);

  const dim = (id: string) => focus !== null && id !== focus;

  // The brief requires the treatment of transfers to be STATED on the chart, not
  // merely implemented — a reader has no way to tell whether a missing flow is a
  // deliberate choice or a bug. Shown only when the diagram actually contains
  // one: a standing caption about transfers on a household that has never made
  // one is noise, and noise is how captions stop being read.
  // Read from the incoming edges rather than the drawn ribbons: Ribbon carries
  // only geometry, and threading `rel` through the layout purely to decide
  // whether to show a caption would put presentation concerns into the maths.
  const hasTransfer = edges.some((e) => e.rel === "SAVED_INTO");
  const labelFits = (h: number) => h >= 13;

  return (
    <div>
    <svg
      viewBox={`0 0 ${W} ${H}`}
      /* The 680px floor is applied in CSS at the `sm` breakpoint, NOT from JS.
         Two reasons, both learned the hard way here:
           • it must be right in the SERVER-rendered HTML. A JS-applied width
             arrives after hydration, so the first paint on a phone overflows and
             the page jumps — and on this page the overflow itself inflated the
             layout viewport (innerWidth read 688 inside a 375px device), so the
             measurement was downstream of the bug it was meant to fix.
           • a ResizeObserver on the chart's own box fed back on itself: it
             measured the element `minWidth` was inflating, so the box always
             reported ≥640 and the floor never came off.
         CSS has neither problem: the breakpoint resolves before paint and cannot
         be influenced by what the chart does. Below `sm` the diagram simply
         scales down inside its viewBox. */
      className="w-full min-w-0 sm:min-w-[680px]" 
      role="img"
      aria-label="Sankey money flow: income to buckets to spending and savings"
    >
      {/* column captions */}
      <text x={64} y={26} fontSize="12" fontWeight="700" className="fill-zinc-400">{tr("g.sankey.income")}</text>
      <text x={W / 2} y={26} textAnchor="middle" fontSize="12" fontWeight="700" className="fill-zinc-400">{tr("g.sankey.buckets")}</text>
      <text x={W - 64} y={26} textAnchor="end" fontSize="12" fontWeight="700" className="fill-zinc-400">{tr("g.sankey.landing")}</text>

      {ribbons.map((r, i) => {
        const active = focus === null || focus === r.src || focus === r.dst;
        return (
          <g key={r.key}>
            <path
              d={r.d}
              fill="none"
              stroke={r.color}
              strokeWidth={r.width}
              opacity={active ? 0.5 : 0.08}
            >
              <title>{r.label}</title>
            </path>
            {/* The flow, as a second stroke along the SAME path.
                A Sankey drawn once is a picture of where money went; the eye
                reads a still diagram as a structure rather than as movement,
                and "your money is flowing somewhere you did not choose" is the
                whole argument this chart exists to make. Dashes travelling
                left-to-right say it without a legend.

                Deliberately a sibling rather than a filter or a gradient on the
                ribbon itself: the ribbon keeps its exact geometry, colour and
                hover target, so nothing about the readable chart depends on the
                decoration. Remove this element and the diagram is unchanged.

                Only ACTIVE ribbons move. When a focus lens dims the rest,
                animating the dimmed ones would make the thing you are not
                looking at the busiest part of the frame.

                The stagger is per-ribbon and derived from the index, not
                random: this component renders on the server and again on the
                client and the two must agree exactly. */}
            {active && (
              <path
                d={r.d}
                fill="none"
                stroke={r.color}
                // CAPPED, not simply proportional. Ribbon width is the RM
                // amount, so a salary ribbon is enormous and 34% of enormous is
                // a row of lozenges the size of the dashes' own gaps — it reads
                // as beads on a string, not as flow. A floor keeps the thinnest
                // ribbons from losing their dash entirely; the ceiling is what
                // keeps the widest ones looking like movement.
                strokeWidth={Math.min(5, Math.max(1.5, r.width * 0.3))}
                strokeLinecap="round"
                className="hm-sankey-flow"
                style={{ animationDelay: `${-(i % 7) * 0.34}s` }}
                aria-hidden="true"
                pointerEvents="none"
              />
            )}
          </g>
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
    {hasTransfer && (
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
        {tr("g.sankey.transferNote")}
      </p>
    )}
    </div>
  );
}
