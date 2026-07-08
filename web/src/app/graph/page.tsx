import Link from "next/link";
import { isDatabaseConfigured, config } from "@/lib/config";
import { getGraphView, type GNode } from "@/lib/graphView";

export const dynamic = "force-dynamic";

// Branch layout: expenses (vendors) on the LEFT, the household's structure
// (buckets, goals, obligations) in the MIDDLE, income sources on the RIGHT.
// Money visually flows right → middle → left.
const COL_X = { expense: 40, middle: 380, income: 720 } as const;
const NODE_W = 190;
const NODE_H = 46;
const ROW_GAP = 66;
const TOP = 70;

const REL_STYLE: Record<string, { stroke: string; dash?: string }> = {
  ALLOCATES_FIXED: { stroke: "#E09112" },
  ALLOCATES_PCT: { stroke: "#E09112", dash: "6 3" },
  FUNDS: { stroke: "#E09112" },
  SPENT_AT: { stroke: "#C94F4F" },
  CONTRIBUTES_TO: { stroke: "#3E9C5C", dash: "4 4" },
  OWES: { stroke: "#8A7A5E", dash: "2 4" },
};

const KIND_BADGE: Record<string, string> = {
  income_source: "💰",
  bucket: "🪣",
  goal: "🎯",
  vendor: "🏪",
  obligation: "📄",
  wallet: "👛",
};

function columnOf(n: GNode): keyof typeof COL_X {
  if (n.kind === "income_source") return "income";
  if (n.kind === "vendor") return "expense";
  return "middle"; // buckets, wallets, goals, obligations = household context
}

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
}) {
  if (!isDatabaseConfigured()) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm">
          PocketBase isn&apos;t configured — start it with <code>npm run pb:start</code>, then reload.
        </p>
      </main>
    );
  }

  const params = await searchParams;
  const tenantId = params.tenantId || config.demoTenantId;
  const { nodes, edges } = await getGraphView(tenantId);

  // assign rows per column
  const cols: Record<string, GNode[]> = { expense: [], middle: [], income: [] };
  for (const n of nodes) cols[columnOf(n)].push(n);
  for (const key of Object.keys(cols)) cols[key].sort((a, b) => a.label.localeCompare(b.label));

  const pos = new Map<string, { x: number; y: number }>();
  const maxRows = Math.max(cols.expense.length, cols.middle.length, cols.income.length, 1);
  const height = TOP + maxRows * ROW_GAP + 40;
  for (const [col, list] of Object.entries(cols)) {
    // vertically center shorter columns
    const offset = TOP + ((maxRows - list.length) * ROW_GAP) / 2;
    list.forEach((n, i) => {
      pos.set(n.id, { x: COL_X[col as keyof typeof COL_X], y: offset + i * ROW_GAP });
    });
  }

  const maxFlow = Math.max(...edges.map((e) => e.flow), 1);
  const width = COL_X.income + NODE_W + 40;

  const otherTenant =
    tenantId === "hhrahman1111111" ? "bizsedap2222222" : "hhrahman1111111";
  const otherLabel = tenantId === "hhrahman1111111" ? "business ☕" : "household 🏠";

  return (
    <main className="mx-auto min-h-full max-w-5xl px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">🕸️ Knowledge Graph</h1>
          <p className="text-sm text-zinc-500">
            {nodes.length} nodes · {edges.length} edges · money as a living structure
          </p>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href={`/graph?tenantId=${otherTenant}`} className="text-amber-600 hover:underline">
            View {otherLabel}
          </Link>
          <Link href="/dashboard" className="text-zinc-500 hover:underline">Dashboard →</Link>
        </nav>
      </header>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ minWidth: 760 }} role="img" aria-label="Money flow graph">
          {/* column headers */}
          <text x={COL_X.expense + NODE_W / 2} y={34} textAnchor="middle" className="fill-zinc-400" fontSize="12" fontWeight="600">EXPENSES ← </text>
          <text x={COL_X.middle + NODE_W / 2} y={34} textAnchor="middle" className="fill-zinc-400" fontSize="12" fontWeight="600">HOUSEHOLD (buckets · goals · obligations)</text>
          <text x={COL_X.income + NODE_W / 2} y={34} textAnchor="middle" className="fill-zinc-400" fontSize="12" fontWeight="600"> → INCOME</text>

          {/* edges — anchors adapt to flow direction (right→left) and same-column arcs */}
          {edges.map((e, i) => {
            const a = pos.get(e.src);
            const b = pos.get(e.dst);
            if (!a || !b) return null;
            const style = REL_STYLE[e.rel] ?? { stroke: "#999" };
            const w = 1.5 + (e.flow / maxFlow) * 7;

            let d: string;
            let lx: number;
            let ly: number;
            if (a.x === b.x) {
              // same column (e.g. bucket → goal): arc out to the right
              const x = a.x + NODE_W;
              const y1 = a.y + NODE_H / 2;
              const y2 = b.y + NODE_H / 2;
              const bow = x + 70;
              d = `M ${x} ${y1} C ${bow} ${y1}, ${bow} ${y2}, ${x} ${y2}`;
              lx = bow + 4;
              ly = (y1 + y2) / 2;
            } else {
              // source anchors on the side facing the destination
              const leftward = b.x < a.x;
              const x1 = leftward ? a.x : a.x + NODE_W;
              const x2 = leftward ? b.x + NODE_W : b.x;
              const y1 = a.y + NODE_H / 2;
              const y2 = b.y + NODE_H / 2;
              const mx = (x1 + x2) / 2;
              d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
              lx = mx;
              ly = (y1 + y2) / 2 - 6;
            }
            return (
              <g key={i}>
                <path d={d} fill="none" stroke={style.stroke} strokeWidth={w} strokeDasharray={style.dash} opacity="0.65" />
                <text x={lx} y={ly} textAnchor={a.x === b.x ? "start" : "middle"} fontSize="10" className="fill-zinc-500">
                  {e.label}
                </text>
              </g>
            );
          })}

          {/* nodes */}
          {nodes.map((n) => {
            const p = pos.get(n.id);
            if (!p) return null;
            const isPrivate = Boolean(n.props?.private);
            const monthly = n.props?.monthly_amount ? `RM ${Number(n.props.monthly_amount).toLocaleString()}/mo` : "";
            const goal = n.props?.target ? `RM ${Number(n.props.current ?? 0).toLocaleString()} / ${Number(n.props.target).toLocaleString()}` : "";
            return (
              <g key={n.id}>
                <rect
                  x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={10}
                  className={n.kind === "income_source" ? "fill-amber-100 stroke-amber-400 dark:fill-amber-950" : n.kind === "goal" ? "fill-emerald-50 stroke-emerald-400 dark:fill-emerald-950" : "fill-zinc-50 stroke-zinc-300 dark:fill-zinc-800 dark:stroke-zinc-600"}
                  strokeWidth="1.2"
                />
                <text x={p.x + 12} y={p.y + 20} fontSize="12.5" fontWeight="600" className="fill-zinc-800 dark:fill-zinc-100">
                  {KIND_BADGE[n.kind] ?? "•"} {n.label}{isPrivate ? " 🔒" : ""}
                </text>
                <text x={p.x + 12} y={p.y + 36} fontSize="10.5" className="fill-zinc-500">
                  {monthly || goal || n.kind}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-500">
        <span><span className="mr-1 inline-block h-1 w-6 rounded bg-[#E09112] align-middle" />allocation (solid = fixed RM, dashed = %)</span>
        <span><span className="mr-1 inline-block h-1 w-6 rounded bg-[#C94F4F] align-middle" />spending (month-to-date)</span>
        <span><span className="mr-1 inline-block h-1 w-6 rounded bg-[#3E9C5C] align-middle" />contributes to goal</span>
        <span>edge thickness ∝ RM flow</span>
      </div>

      <p className="mt-6 max-w-2xl text-sm text-zinc-500">
        This is the same graph the AI reasons over: when the red spending edges thicken faster
        than their bucket&apos;s amber allocation, Honey can see — structurally — which green goal
        edge gets squeezed, and warns the household <em>before</em> it happens.
      </p>
    </main>
  );
}
