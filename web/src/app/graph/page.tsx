import Link from "next/link";
import { isDatabaseConfigured, config } from "@/lib/config";
import { type GNode } from "@/lib/graphView";
import { getFocusedView, parseFocus, focusToParam } from "@/lib/focusView";
import NetworkGraph from "./NetworkGraph";
import SankeyFlow from "./SankeyFlow";
import Treemap from "./Treemap";
import TreeGraph from "./TreeGraph";
import BudgetBars from "./BudgetBars";
import FocusBar from "./FocusBar";
import FlexibleInput from "./FlexibleInput";
import LanguageSwitcher from "./LanguageSwitcher";
import CurrencySwitcher from "./CurrencySwitcher";
import { normalizeLocale, t as translate } from "@/lib/i18n";
import { normalizeCurrency, fmtMoney } from "@/lib/format";

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

type Mode = "sankey" | "treemap" | "tree" | "organic" | "bars" | "flow";
const MODES: { key: Mode; label: string; icon: string }[] = [
  { key: "sankey", label: "Sankey", icon: "🌊" },
  { key: "treemap", label: "Treemap", icon: "🟦" },
  { key: "tree", label: "Tree", icon: "🌳" },
  { key: "organic", label: "Organic", icon: "🕸️" },
  { key: "bars", label: "Budget", icon: "📊" },
  { key: "flow", label: "Flow", icon: "⇄" },
];

const CAPTION: Record<Mode, string> = {
  sankey: "Every ringgit, traced: income splits into buckets, then into real spending (red) versus what stays saved (green). Ribbon width ∝ RM.",
  treemap: "Budget composition at a glance: cell area ∝ monthly allocation, colour ∝ status, and the solid fill rises with projected spend.",
  tree: "The household budget as a branching structure — spending tier → bucket → vendor. Hover a node to trace its lineage.",
  organic: "The raw knowledge graph, force-relaxed. Node size ∝ connections; hover to focus a node and its neighbours.",
  bars: "Budget vs actual on one shared RM scale, so every bucket is directly comparable. Dashed line = the allocation cap.",
  flow: "The classic branch view — expenses on the left, household structure in the middle, income on the right.",
};

function columnOf(n: GNode): keyof typeof COL_X {
  if (n.kind === "income_source") return "income";
  if (n.kind === "vendor") return "expense";
  return "middle"; // buckets, wallets, goals, obligations = household context
}


export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string; mode?: string; focus?: string; lang?: string; ccy?: string }>;
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
  const mode: Mode = MODES.some((m) => m.key === params.mode) ? (params.mode as Mode) : "sankey";
  const focus = parseFocus(params.focus);
  const focusParam = focusToParam(focus);
  const lang = normalizeLocale(params.lang);
  const tr = (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars);
  const ccy = normalizeCurrency(params.ccy);
  const sticky = `&focus=${focusParam}&lang=${lang}&ccy=${ccy}`;
  const rm0 = (n: number) => fmtMoney(n, ccy, { round: true });
  const view = await getFocusedView(tenantId, focus);
  const { nodes, edges } = view.graph;
  const money = view.money;

  // assign rows per column (flow view)
  const cols: Record<string, GNode[]> = { expense: [], middle: [], income: [] };
  for (const n of nodes) cols[columnOf(n)].push(n);
  for (const key of Object.keys(cols)) cols[key].sort((a, b) => a.label.localeCompare(b.label));

  const pos = new Map<string, { x: number; y: number }>();
  const maxRows = Math.max(cols.expense.length, cols.middle.length, cols.income.length, 1);
  const height = TOP + maxRows * ROW_GAP + 40;
  for (const [col, list] of Object.entries(cols)) {
    const offset = TOP + ((maxRows - list.length) * ROW_GAP) / 2;
    list.forEach((n, i) => {
      pos.set(n.id, { x: COL_X[col as keyof typeof COL_X], y: offset + i * ROW_GAP });
    });
  }

  const maxFlow = Math.max(...edges.map((e) => e.flow), 1);
  const width = COL_X.income + NODE_W + 40;

  const isBiz = view.tenantKind === "business";
  const rootLabel = isBiz ? "Business" : "Household";
  const personaIcon = (kind: string, name: string) =>
    kind === "business" ? "🏢" : /solo|freelance/i.test(name) ? "🧑‍💻" : "🏠";

  return (
    <main className="mx-auto min-h-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">🕸️ {tr("app.title")}</h1>
          <p className="text-sm text-zinc-500">
            {focusParam === "all"
              ? tr("app.subtitle", { nodes: nodes.length, edges: edges.length })
              : tr("app.focusedOn", { label: `${view.focusBadge} ${view.focusLabel}`, nodes: nodes.length, edges: edges.length })}
          </p>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <CurrencySwitcher current={ccy} />
          <LanguageSwitcher current={lang} />
          <Link href="/records" className="text-zinc-500 hover:underline">🧾 Records</Link>
          <Link href="/guide" className="text-zinc-500 hover:underline">ℹ️ Guide</Link>
          <Link href="/dashboard" className="text-zinc-500 hover:underline">{tr("nav.dashboard")} →</Link>
        </nav>
      </header>

      {/* persona switcher — personal · family · business on one engine */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{tr("persona.label")}</span>
        {view.personas.map((p) => (
          <Link
            key={p.id}
            href={`/graph?tenantId=${p.id}&mode=${mode}&focus=all&lang=${lang}&ccy=${ccy}`}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              p.id === tenantId
                ? "border-amber-500 bg-amber-500 text-white"
                : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            {personaIcon(p.kind, p.name)} {p.name}
          </Link>
        ))}
      </div>

      <FocusBar
        tenantId={tenantId}
        mode={mode}
        focusParam={focusParam}
        groups={view.groups}
        focusLabel={view.focusLabel}
        focusBadge={view.focusBadge}
        roleOptions={view.roleOptions}
        categoryBadge={view.tierMeta[1]?.badge ?? "🗂️"}
        lang={lang}
        labels={{
          lens: tr("lens.label"),
          income: tr("lens.income"),
          bucket: tr("lens.bucket"),
          vendor: tr("lens.vendor"),
          category: tr("lens.category"),
          wholeGraph: tr("lens.wholeGraph"),
          clear: tr("lens.clear"),
        }}
      />

      {/* monitoring headline — adapts to a person lens */}
      <section className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {view.scope === "person" ? (
          (() => {
            const used = money.buckets.filter((b) => b.mtd_spend > 0);
            const top = used.slice().sort((a, b) => b.mtd_spend - a.mtd_spend)[0];
            return (
              <>
                <Stat label={`Spent by ${view.focusLabel} (mtd)`} value={rm0(money.totalSpent)} tone="spend" />
                <Stat label="Envelopes used" value={String(used.length)} tone="alloc" />
                <Stat label="Vendors" value={String(money.vendorSpend.length)} tone="alloc" />
                <Stat label="Top envelope" value={top ? top.bucket_label : "—"} tone="income" />
              </>
            );
          })()
        ) : (
          <>
            <Stat label={tr("stat.incomeMo")} value={rm0(money.totalIncome)} tone="income" />
            <Stat label={tr("stat.allocatedMo")} value={rm0(money.totalAllocated)} tone="alloc" />
            <Stat label={tr("stat.spentMtd")} value={rm0(money.totalSpent)} tone="spend" />
            <Stat
              label={tr("stat.unallocated")}
              value={rm0(money.totalIncome - money.totalAllocated)}
              tone={money.totalIncome - money.totalAllocated >= 0 ? "save" : "spend"}
            />
          </>
        )}
      </section>

      {/* view switcher */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <Link
            key={m.key}
            href={`/graph?tenantId=${tenantId}&mode=${m.key}${sticky}`}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === m.key
                ? "border-amber-500 bg-amber-500 text-white"
                : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            {m.icon} {tr(`mode.${m.key}`)}
          </Link>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        {nodes.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-2 py-12 text-center">
            <span className="text-3xl">{view.focusBadge}</span>
            <p className="text-sm font-medium">No spend attributed to {view.focusLabel} this month.</p>
            <p className="max-w-xs text-xs text-zinc-500">
              Their transactions may be in earlier months — clear the lens to see the whole graph.
            </p>
            <Link href={`/graph?tenantId=${tenantId}&mode=${mode}&focus=all`} className="mt-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600">
              🌐 Whole graph
            </Link>
          </div>
        ) : (
          <>
        {mode === "sankey" && (
          <SankeyFlow
            ccy={ccy}
            nodes={nodes.map((n) => ({ id: n.id, kind: n.kind, label: n.label }))}
            edges={edges.map((e) => ({ src: e.src, dst: e.dst, rel: e.rel, flow: e.flow }))}
          />
        )}

        {mode === "treemap" && (
          <Treemap
            ccy={ccy}
            cells={money.buckets.map((b) => ({
              id: b.bucket_id,
              label: b.bucket_label,
              allocated: b.allocated,
              projected: b.projected_spend,
              status: b.status,
              tier: b.tier,
            }))}
          />
        )}

        {mode === "tree" && (
          <TreeGraph
            ccy={ccy}
            rootLabel={rootLabel}
            tierMeta={view.tierMeta}
            buckets={money.buckets.map((b) => ({
              id: b.bucket_id,
              label: b.bucket_label,
              tier: b.tier,
              allocated: b.allocated,
              projected: b.projected_spend,
              status: b.status,
            }))}
            vendors={money.vendorSpend.map((v) => ({
              bucketId: v.bucketId,
              vendorId: v.vendorId,
              vendorLabel: v.vendorLabel,
              amount: v.amount,
            }))}
          />
        )}

        {mode === "organic" && (
          <NetworkGraph
            nodes={nodes.map((n) => ({
              id: n.id,
              kind: n.kind,
              label: n.label,
              sub: n.props?.monthly_amount
                ? `${rm0(Number(n.props.monthly_amount))}/mo`
                : n.props?.target
                  ? `${rm0(Number(n.props.current ?? 0))} / ${rm0(Number(n.props.target))}`
                  : undefined,
            }))}
            edges={edges}
          />
        )}

        {mode === "bars" && (
          <BudgetBars
            ccy={ccy}
            rows={money.buckets.map((b) => ({
              id: b.bucket_id,
              label: b.bucket_label,
              allocated: b.allocated,
              projected: b.projected_spend,
              status: b.status,
            }))}
          />
        )}

        {mode === "flow" && (
          <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ minWidth: 760 }} role="img" aria-label="Money flow graph">
            <text x={COL_X.expense + NODE_W / 2} y={34} textAnchor="middle" className="fill-zinc-400" fontSize="12" fontWeight="600">EXPENSES ← </text>
            <text x={COL_X.middle + NODE_W / 2} y={34} textAnchor="middle" className="fill-zinc-400" fontSize="12" fontWeight="600">HOUSEHOLD (buckets · goals · obligations)</text>
            <text x={COL_X.income + NODE_W / 2} y={34} textAnchor="middle" className="fill-zinc-400" fontSize="12" fontWeight="600"> → INCOME</text>

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
                const x = a.x + NODE_W;
                const y1 = a.y + NODE_H / 2;
                const y2 = b.y + NODE_H / 2;
                const bow = x + 70;
                d = `M ${x} ${y1} C ${bow} ${y1}, ${bow} ${y2}, ${x} ${y2}`;
                lx = bow + 4;
                ly = (y1 + y2) / 2;
              } else {
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

            {nodes.map((n) => {
              const p = pos.get(n.id);
              if (!p) return null;
              const isPrivate = Boolean(n.props?.private);
              const monthly = n.props?.monthly_amount ? `${rm0(Number(n.props.monthly_amount))}/mo` : "";
              const goal = n.props?.target ? `${rm0(Number(n.props.current ?? 0))} / ${rm0(Number(n.props.target))}` : "";
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
        )}
          </>
        )}
      </div>

      {/* per-mode caption + legend */}
      <p className="mt-3 max-w-3xl text-xs text-zinc-500">{CAPTION[mode]}</p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
        {(mode === "treemap" || mode === "tree" || mode === "bars") && (
          <>
            <LegendDot color="#3E9C5C" label="on track" />
            <LegendDot color="#E0A312" label="at risk" />
            <LegendDot color="#C94F4F" label="over budget" />
            <LegendDot color="#9AA0A6" label="unfunded" />
          </>
        )}
        {(mode === "sankey" || mode === "flow" || mode === "organic") && (
          <>
            <LegendDot color="#E09112" label="allocation" />
            <LegendDot color="#C94F4F" label="spending" />
            <LegendDot color="#3E9C5C" label="saved / goal" />
          </>
        )}
        {mode === "organic" && <LegendDot color="#5B7DB1" label="bucket" />}
      </div>

      <FlexibleInput
        tenantId={tenantId}
        lang={lang}
        ccy={ccy}
        buckets={money.buckets.map((b) => ({ id: b.bucket_id, label: b.bucket_label }))}
        incomes={money.incomes.map((i) => ({ id: i.id, label: i.label }))}
        members={view.groups.member.map((m) => ({ id: m.value.split(":")[1], label: m.label }))}
        categoryLabels={[1, 2, 3].map((t) => ({ tier: t, label: view.tierMeta[t]?.label ?? `Tier ${t}` }))}
      />

      <p className="mt-4 max-w-2xl text-sm text-zinc-500">
        This is the same graph the AI reasons over: when the red spending edges thicken faster
        than their bucket&apos;s amber allocation, Honey can see — structurally — which green goal
        edge gets squeezed, and warns the household <em>before</em> it happens.
      </p>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "income" | "alloc" | "spend" | "save" }) {
  const ring: Record<string, string> = {
    income: "border-amber-300 dark:border-amber-800",
    alloc: "border-zinc-200 dark:border-zinc-800",
    spend: "border-rose-300 dark:border-rose-900",
    save: "border-emerald-300 dark:border-emerald-900",
  };
  return (
    <div className={`rounded-xl border bg-white px-3 py-2 dark:bg-zinc-900 ${ring[tone]}`}>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center">
      <span className="mr-1.5 inline-block h-3 w-3 rounded-full align-middle" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
