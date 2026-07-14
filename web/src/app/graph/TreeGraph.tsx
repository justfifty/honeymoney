"use client";

import { useMemo, useState } from "react";
import { fmtMoney } from "@/lib/format";

// Tidy hierarchical "tree branch": Household → spending tier → bucket → vendor.
// A genuine tree (single parent per node), laid out left→right with the classic
// leaf-packing algorithm: leaves take successive rows, each parent centers on its
// children. Distinct from the force-directed "organic" view. Dependency-free.

export interface TreeBucket {
  id: string;
  label: string;
  tier: number;
  allocated: number;
  projected: number;
  status: "on_track" | "at_risk" | "over_budget" | "unfunded";
}
export interface TreeVendor {
  bucketId: string;
  vendorId: string;
  vendorLabel: string;
  amount: number;
}

interface TNode {
  id: string;
  label: string;
  badge: string;
  sub?: string;
  color: string;
  depth: number;
  children: TNode[];
  y: number;
  w: number;
}

const STATUS_COLOR: Record<string, string> = {
  on_track: "#248A54",
  at_risk: "#E8A012",
  over_budget: "#C94F4F",
  unfunded: "#9AA0A6",
};
// Fallback only — the server passes real labels from moneyView.CATEGORY_META.
// Keep these two in step.
const DEFAULT_TIER_META: Record<number, { label: string; badge: string }> = {
  1: { label: "Must-paid", badge: "🏠" },
  2: { label: "Savings", badge: "🎯" },
  3: { label: "Spendings", badge: "🛍️" },
};

const ROW = 30;
const COL_W = 214;
const MARGIN_X = 24;
const TOP = 40;
const NODE_H = 24;
const widthOf = (label: string, sub?: string) =>
  Math.max(64, 22 + Math.max(label.length, (sub?.length ?? 0)) * 6.4);

export default function TreeGraph({
  rootLabel,
  buckets,
  vendors,
  tierMeta = DEFAULT_TIER_META,
  ccy = "MYR",
}: {
  rootLabel: string;
  buckets: TreeBucket[];
  vendors: TreeVendor[];
  tierMeta?: Record<number, { label: string; badge: string }>;
  ccy?: string;
}) {
  const [focus, setFocus] = useState<string | null>(null);

  const { root, width, height, parentOf } = useMemo(() => {
    const rm0 = (n: number) => fmtMoney(n, ccy, { round: true });
    const vendorsByBucket = new Map<string, TreeVendor[]>();
    for (const v of vendors) {
      (vendorsByBucket.get(v.bucketId) ?? vendorsByBucket.set(v.bucketId, []).get(v.bucketId)!).push(v);
    }
    for (const arr of vendorsByBucket.values()) arr.sort((a, b) => b.amount - a.amount);

    const tiers = [1, 2, 3]
      .filter((t) => buckets.some((b) => b.tier === t))
      .map((t) => {
        const meta = tierMeta[t] ?? DEFAULT_TIER_META[t];
        const kids = buckets
          .filter((b) => b.tier === t)
          .sort((a, b) => b.allocated - a.allocated)
          .map<TNode>((b) => ({
            id: b.id,
            label: b.label,
            badge: "🪣",
            sub: `${rm0(b.allocated)}${b.projected > 0 ? ` · ${rm0(b.projected)} proj` : ""}`,
            color: STATUS_COLOR[b.status] ?? STATUS_COLOR.unfunded,
            depth: 2,
            y: 0,
            w: 0,
            children: (vendorsByBucket.get(b.id) ?? []).map<TNode>((v) => ({
              id: `${b.id}:${v.vendorId}`,
              label: v.vendorLabel,
              badge: "🏪",
              sub: rm0(v.amount),
              color: "#C94F4F",
              depth: 3,
              y: 0,
              w: 0,
              children: [],
            })),
          }));
        return {
          id: `tier-${t}`,
          label: meta.label,
          badge: meta.badge,
          color: "#5B7DB1",
          depth: 1,
          y: 0,
          w: 0,
          children: kids,
        } as TNode;
      });

    const root: TNode = {
      id: "__root__",
      label: rootLabel,
      badge: "💠",
      color: "#9B6BB3",
      depth: 0,
      y: 0,
      w: 0,
      children: tiers,
    };

    // leaf-packing layout
    let leaf = 0;
    const parentOf = new Map<string, string>();
    const assign = (node: TNode, parentId: string | null) => {
      if (parentId) parentOf.set(node.id, parentId);
      node.w = widthOf(node.label, node.sub);
      if (node.children.length === 0) {
        node.y = TOP + leaf * ROW;
        leaf++;
      } else {
        node.children.forEach((c) => assign(c, node.id));
        node.y = (node.children[0].y + node.children[node.children.length - 1].y) / 2;
      }
    };
    assign(root, null);

    const leaves = Math.max(1, leaf);
    const maxDepth = 3;
    const height = TOP + leaves * ROW + 8;
    const width = MARGIN_X * 2 + maxDepth * COL_W + 190;
    return { root, width, height, parentOf };
  }, [rootLabel, buckets, vendors, tierMeta, ccy]);

  const flat = useMemo(() => {
    const out: TNode[] = [];
    const walk = (n: TNode) => {
      out.push(n);
      n.children.forEach(walk);
    };
    walk(root);
    return out;
  }, [root]);

  // ancestor path for hover highlight
  const onPath = (id: string): boolean => {
    if (focus === null) return true;
    let cur: string | undefined = focus;
    const chain = new Set<string>();
    while (cur) {
      chain.add(cur);
      cur = parentOf.get(cur);
    }
    // also highlight descendants of focus
    if (chain.has(id)) return true;
    let c: string | undefined = id;
    while (c) {
      if (c === focus) return true;
      c = parentOf.get(c);
    }
    return false;
  };

  const xOf = (depth: number) => MARGIN_X + depth * COL_W;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ minWidth: 640 }} role="img" aria-label="Spending tree: household to tier to bucket to vendor">
      {/* links */}
      {flat.map((n) =>
        n.children.map((c) => {
          const x1 = xOf(n.depth) + n.w;
          const x2 = xOf(c.depth);
          const y1 = n.y + NODE_H / 2;
          const y2 = c.y + NODE_H / 2;
          const mx = (x1 + x2) / 2;
          const active = onPath(c.id);
          return (
            <path
              key={`${n.id}-${c.id}`}
              d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke={c.color}
              strokeWidth={1.6}
              opacity={active ? 0.55 : 0.12}
            />
          );
        }),
      )}
      {/* nodes */}
      {flat.map((n) => {
        const x = xOf(n.depth);
        const active = onPath(n.id);
        return (
          <g
            key={n.id}
            opacity={active ? 1 : 0.28}
            onMouseEnter={() => setFocus(n.id)}
            onMouseLeave={() => setFocus(null)}
            style={{ cursor: "pointer" }}
          >
            <rect x={x} y={n.y} width={n.w} height={NODE_H} rx={7} className="fill-white dark:fill-zinc-900" stroke={n.color} strokeWidth={1.4} />
            <rect x={x} y={n.y} width={4} height={NODE_H} rx={2} fill={n.color} />
            <text x={x + 10} y={n.y + (n.sub ? 11 : 16)} fontSize="10.5" fontWeight="600" className="fill-zinc-800 dark:fill-zinc-100">
              {n.badge} {n.label}
            </text>
            {n.sub && (
              <text x={x + 10} y={n.y + 20} fontSize="8.5" className="fill-zinc-500">
                {n.sub}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
