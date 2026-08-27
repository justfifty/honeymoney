import Link from "next/link";
import { isDatabaseConfigured, config } from "@/lib/config";
import { type GNode } from "@/lib/graphView";
import { CHARTS, CHART_LIST, chartFromParam, type ChartId } from "@/lib/charts";
import { getFocusedView, parseFocus, focusToParam } from "@/lib/focusView";
import NetworkGraph from "./NetworkGraph";
import SankeyFlow from "./SankeyFlow";
import Treemap from "./Treemap";
import TreeGraph from "./TreeGraph";
import BudgetBars from "./BudgetBars";
import FocusBar from "./FocusBar";
import FlexibleInput from "./FlexibleInput";
import CurrencySwitcher from "./CurrencySwitcher";
import RatesNote from "../RatesNote";
import { t as translate } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { normalizeCurrency, fmtMoney } from "@/lib/format";
import { can, resolveViewTenant, listHouseholdsFor } from "@/lib/household";
import LocalOverlay from "../LocalOverlay";

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
  ALLOCATES_FIXED: { stroke: "#FF7518" },
  ALLOCATES_PCT: { stroke: "#FF7518", dash: "6 3" },
  FUNDS: { stroke: "#FF7518" },
  SPENT_AT: { stroke: "#C94F4F" },
  CONTRIBUTES_TO: { stroke: "#248A54", dash: "4 4" },
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

// Names, order and captions come from lib/charts.ts — see Task 11. The array
// that used to live here also carried a `label` field that nothing ever read
// (the switcher renders `mode.<id>`), which is precisely how a duplicate goes
// unnoticed: a wrong value in it would have looked fine forever.
type Mode = ChartId;

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
      <LocalOverlay where="the graph" />
        <p className="text-sm">
          PocketBase isn&apos;t configured — start it with <code>npm run pb:start</code>, then reload.
        </p>
      </main>
    );
  }

  const params = await searchParams;
  // Signed in, you see YOUR household — the ?tenantId= switcher is a showcase
  // affordance for anonymous visitors browsing the demo personas, and must not
  // be able to point a logged-in user at somebody else's books.
  const { ctx, isDemo } = await resolveViewTenant();
  // Anonymous visitors may only view the seed demo personas — never an arbitrary
  // (real) household passed via ?tenantId. Signed in, you're locked to your own.
  const tenantId = ctx
    ? ctx.tenant.id
    : params.tenantId && config.demoPersonaIds.includes(params.tenantId)
      ? params.tenantId
      : config.demoTenantId;
  // The persona switcher lists the viewer's OWN households, or the demo personas
  // for anonymous visitors — never every consumer's private household.
  const personaIds = ctx
    ? (await listHouseholdsFor(ctx.user.id)).map((h) => h.id)
    : config.demoPersonaIds;
  const canWrite = Boolean(ctx) && can(ctx!.accessRole, "add_record");
  const canManageGraph = Boolean(ctx) && can(ctx!.accessRole, "manage_graph");
  const mode: Mode = chartFromParam(params.mode);
  const focus = parseFocus(params.focus);
  const focusParam = focusToParam(focus);
  const lang = await getLocale();
  const tr = (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars);
  const ccy = normalizeCurrency(params.ccy);
  const sticky = `&focus=${focusParam}&lang=${lang}&ccy=${ccy}`;
  const rm0 = (n: number) => fmtMoney(n, ccy, { round: true });
  // Redaction is for real households only: the seeded personas are fictional,
  // and their vendor breakdown is the whole point of this page.
  const view = await getFocusedView(tenantId, focus, lang, personaIds, {
    viewerMemberId: ctx?.memberId,
    redact: !isDemo,
  });
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
  // Charts need something to draw, not merely something to list. An edge with a
  // zero flow is as unchartable as no edge at all.
  const hasFlow = edges.some((e) => e.flow > 0);
  const width = COL_X.income + NODE_W + 40;

  const rootLabel = "Household";
  const personaIcon = (name: string) =>
    /solo|freelance|individual/i.test(name) ? "🧑" : /couple|partner/i.test(name) ? "👫" : "👪";

  // `w-full min-w-0` on <main> below is load-bearing, not tidying. It is a flex
  // item of the body column, and `mx-auto` suppresses cross-axis stretch — so
  // without a definite width it sizes to fit-content, takes the min-content width
  // of its widest child, and the Sankey's `min-width: 680px` dragged the WHOLE
  // PAGE to 738px on a 375px phone: header, nav and all scrolled sideways. The
  // chart container's own `overflow-x-auto` never got a chance to clip, because
  // the box it would have clipped inside grew instead. Measured at 320/375/768
  // before and after. Same bug as the demo column in DemoApp.
  return (
    <main className="mx-auto min-h-full w-full min-w-0 max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">🕸️ {tr("app.title")}</h1>
          <p className="text-sm text-zinc-500">
            {focusParam === "all"
              ? tr("app.subtitle", { nodes: nodes.length, edges: edges.length })
              : tr("app.focusedOn", { label: `${view.focusBadge} ${view.focusLabel}`, nodes: nodes.length, edges: edges.length })}
          </p>
        </div>
        {/* Currency only. Records, Guide and Dashboard used to sit here too, and
            all three are already permanent chrome: Dashboard is a top-bar tab and
            a bottom-nav tab, Records and Guide are in the More menu. Repeating
            them beside the title made the busiest page in the app open with four
            competing links above the graph it exists to show. */}
        <nav className="flex items-center gap-3 text-sm">
          <CurrencySwitcher current={ccy} />
        </nav>
      </header>

      {/* persona switcher — individual · couple · family on one engine.
          Only for anonymous visitors touring the demo; a signed-in user is
          always looking at their own household. */}
      {isDemo ? (
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
              {personaIcon(p.name)} {p.name}
            </Link>
          ))}
          <Link href="/login" className="ml-auto text-xs text-amber-600 hover:underline">
            {tr("demo.signInToAdd")}
          </Link>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span className="rounded-lg bg-amber-100 px-2 py-1 font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            🏠 {ctx!.tenant.name}
          </span>
          <span className="text-zinc-400">{ctx!.accessRole}</span>
          <Link href="/household" className="text-zinc-500 hover:underline">
            👥 {tr("nav.household")}
          </Link>
        </div>
      )}

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
                <Stat label={tr("g.person.spentBy", { name: view.focusLabel })} value={rm0(money.totalSpent)} tone="spend" />
                <Stat label={tr("g.person.envelopesUsed")} value={String(used.length)} tone="alloc" />
                <Stat label={tr("g.person.vendors")} value={String(money.vendorSpend.length)} tone="alloc" />
                <Stat label={tr("g.person.topEnvelope")} value={top ? top.bucket_label : "—"} tone="income" />
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
        {CHART_LIST.map((c) => (
          <Link
            key={c.id}
            href={`/graph?tenantId=${tenantId}&mode=${c.id}${sticky}`}
            title={tr(c.oneLineKey)}
            aria-current={mode === c.id ? "true" : undefined}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === c.id
                ? "border-amber-500 bg-amber-500 text-white"
                : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            {c.icon} {tr(c.nameKey)}
          </Link>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        {nodes.length > 0 && !hasFlow ? (
          // Nodes but nothing moving through them. Distinct from "no nodes":
          // nothing is hidden by a filter here, the household simply has not
          // recorded anything yet — so the honest thing to show is the way in,
          // not a "clear the lens" hint that would send them looking for a
          // filter that is not the problem.
          <div className="flex min-h-56 flex-col items-center justify-center gap-2 py-12 text-center">
            <span className="text-3xl">🌱</span>
            <p className="text-sm font-medium">{tr("g.noflow.title")}</p>
            <p className="max-w-xs text-xs text-zinc-500">{tr("g.noflow.hint")}</p>
            {!isDemo && (
              <Link
                href="/record"
                className="mt-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
              >
                ➕ {tr("g.noflow.cta")}
              </Link>
            )}
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-2 py-12 text-center">
            <span className="text-3xl">{view.focusBadge}</span>
            <p className="text-sm font-medium">{tr("g.empty.title", { label: view.focusLabel })}</p>
            <p className="max-w-xs text-xs text-zinc-500">
              {tr("g.empty.hint")}
            </p>
            <Link href={`/graph?tenantId=${tenantId}&mode=${mode}&focus=all`} className="mt-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600">
              🌐 {tr("g.empty.wholeGraph")}
            </Link>
          </div>
        ) : (
          <>
        {mode === "sankey" && (
          <SankeyFlow
            ccy={ccy}
            lang={lang}
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
            <text x={COL_X.expense + NODE_W / 2} y={34} textAnchor="middle" className="fill-zinc-400" fontSize="12" fontWeight="600">{tr("g.flow.expenses")} </text>
            <text x={COL_X.middle + NODE_W / 2} y={34} textAnchor="middle" className="fill-zinc-400" fontSize="12" fontWeight="600">{tr("g.flow.household")}</text>
            <text x={COL_X.income + NODE_W / 2} y={34} textAnchor="middle" className="fill-zinc-400" fontSize="12" fontWeight="600"> {tr("g.flow.income")}</text>

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
      {/* The one-line explanation, reachable from the chart itself rather than
          only from the Gallery. The brief singles the Sankey out: it is the
          default view and the least familiar diagram type to a general
          audience, and a user meeting it cold with no explanation bounces off
          the app's strongest visualisation. `open` on the Sankey for that
          reason; the rest are a tap away. */}
      <details className="mt-3 max-w-3xl" open={mode === "sankey"}>
        <summary className="cursor-pointer text-xs font-medium text-amber-700 hover:underline">
          {tr("chart.explainOpen")}
        </summary>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{tr(CHARTS[mode].oneLineKey)}</p>
        <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          {tr("chart.whenToUse")}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">{tr(CHARTS[mode].whenToUseKey)}</p>
      </details>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
        {(mode === "treemap" || mode === "tree" || mode === "bars") && (
          <>
            <LegendDot color="#248A54" label={tr("status.on_track")} />
            <LegendDot color="#E8A012" label={tr("status.at_risk")} />
            <LegendDot color="#C94F4F" label={tr("status.over_budget")} />
            <LegendDot color="#9AA0A6" label={tr("status.unfunded")} />
          </>
        )}
        {(mode === "sankey" || mode === "flow" || mode === "organic") && (
          <>
            <LegendDot color="#FF7518" label={tr("g.legend.allocation")} />
            <LegendDot color="#C94F4F" label={tr("g.legend.spending")} />
            <LegendDot color="#248A54" label={tr("g.legend.savedGoal")} />
          </>
        )}
        {mode === "organic" && <LegendDot color="#5B7DB1" label={tr("g.legend.bucket")} />}
      </div>

      <RatesNote ccy={ccy} />

      {canWrite ? (
        <FlexibleInput
          lang={lang}
          ccy={ccy}
          canManageGraph={canManageGraph}
          knownVendors={view.groups.vendor.map((v) => v.label)}
          buckets={money.buckets.map((b) => ({ id: b.bucket_id, label: b.bucket_label }))}
          incomes={money.incomes.map((i) => ({ id: i.id, label: i.label }))}
          members={view.groups.member.map((m) => ({ id: m.value.split(":")[1], label: m.label }))}
          categoryLabels={[1, 2, 3].map((t) => ({ tier: t, label: view.tierMeta[t]?.label ?? `Tier ${t}` }))}
        />
      ) : (
        <p className="mt-8 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          {isDemo ? (
            <>
              {tr("demo.readOnly")}{" "}
              <Link href="/signup" className="font-medium text-amber-600 hover:underline">
                {tr("demo.createHousehold")}
              </Link>
            </>
          ) : (
            tr("role.readOnly")
          )}
        </p>
      )}

      <p className="mt-4 max-w-2xl text-sm text-zinc-500">
        {tr("g.closing")}
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
