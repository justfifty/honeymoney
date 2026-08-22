// Does every chart survive 0, 1, 2 and 200+ items?
//
//   npm run check:charts
//
// Task 7: "No chart may break, blank out or disappear at any item count — which
// is not the same as rendering every item. Report the current failure mode first
// (hidden below a threshold? overflowing its container? erroring on empty?),
// then handle all three regimes for EVERY chart type."
//
// This is the reporting half, and it is deliberately a pure render test rather
// than a browser one: every failure it looks for is a property of the component's
// own maths — a division by zero, an empty domain, a scale with no range, an
// unbounded width — and those show up in the returned markup without needing a
// viewport.
//
// Renders each chart to static markup through React's server renderer, then
// asserts three things that a screenshot would not catch:
//
//   • it produced SOMETHING (not an empty string, not a zero-height SVG)
//   • no NaN reached an attribute — the classic symptom of dividing by a total
//     of zero, and one that draws nothing while throwing nothing
//   • at 200 items it does not emit 200 rows, because "renders every item" is
//     not the requirement and a 200-row Sankey is unreadable anyway

import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import * as SankeyMod from "../src/app/graph/SankeyFlow.tsx";
import * as TreemapMod from "../src/app/graph/Treemap.tsx";
import * as TreeMod from "../src/app/graph/TreeGraph.tsx";
import * as NetworkMod from "../src/app/graph/NetworkGraph.tsx";
import * as BarsMod from "../src/app/graph/BudgetBars.tsx";

// tsx's ESM/CJS interop double-wraps a default export from a "use client"
// module, so `import X from` yields { default: { default: fn } } and every
// render throws "Element type is invalid" — identically, for every chart and
// every item count. The first run of this script did exactly that and reported
// 20 failures that were all the harness. A check that fails the same way
// everywhere is testing itself, so unwrap explicitly rather than trusting the
// import.
function comp(mod: unknown): never {
  let c = mod as Record<string, unknown>;
  while (c && typeof c !== "function" && "default" in c) c = c.default as Record<string, unknown>;
  if (typeof c !== "function") throw new Error("not a component");
  return c as never;
}

const SankeyFlow = comp(SankeyMod);
const Treemap = comp(TreemapMod);
const TreeGraph = comp(TreeMod);
const NetworkGraph = comp(NetworkMod);
const BudgetBars = comp(BarsMod);

let failures = 0;
const report: string[] = [];

function probe(name: string, n: number, render: () => string) {
  let html = "";
  let threw: string | null = null;
  try {
    html = render();
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e);
  }

  const problems: string[] = [];
  if (threw) problems.push(`THREW: ${threw.slice(0, 90)}`);
  else {
    if (!html || html.length < 40) problems.push("rendered nothing");
    if (/NaN/.test(html)) problems.push("NaN in output");
    if (/(width|height)="0"/.test(html)) problems.push("zero-sized element");
    if (/height="-|width="-/.test(html)) problems.push("negative dimension");

    // ZERO. Not throwing is not the same as being usable. The brief is explicit:
    // "zero → a real empty state with a route to Record, not a blank panel or a
    // zero-height SVG". An SVG containing only its own axes is a blank panel,
    // and it reads to a new user as "this app is broken" rather than "you
    // haven't logged anything yet".
    if (n === 0) {
      const words = (html.replace(/<[^>]+>/g, " ").match(/[A-Za-z]{3,}/g) ?? []).length;
      if (words < 3) problems.push("no empty state — renders a blank panel");
    }

    // MANY. "No chart may break at any item count" is not "render every item".
    // 200 rows is unreadable on any screen and, at a quarter-megabyte of markup,
    // expensive to ship over mobile data — which is the connection this app is
    // designed for. The requirement is top-N plus one inspectable Other.
    if (n === 200) {
      // COUNT the distinct items drawn, rather than looking for high-numbered
      // labels. The first version of this assertion searched for "Bucket 1xx"
      // and kept failing after the fix landed — because topNWithOther sorts by
      // VALUE, and the fixture's largest values are its highest indices. The
      // assertion was measuring the fixture, not the behaviour.
      const drawn = new Set(html.match(/(?:Thing|Bucket|Vendor) \d+/g) ?? []).size;
      const cap = 42; // the loosest per-chart limit, plus the Other row and slack
      if (drawn > cap) {
        problems.push(`no aggregation — draws ${drawn} items (${Math.round(html.length / 1024)}KB)`);
      }
    }
  }

  if (problems.length) {
    failures++;
    report.push(`  FAIL  ${name} @ ${n} items — ${problems.join("; ")}`);
  } else {
    report.push(`  ok    ${name} @ ${n} items (${html.length} bytes)`);
  }
}

// ── fixtures ───────────────────────────────────────────────────────────────

function nodes(n: number) {
  const out = [{ id: "inc", kind: "income_source", label: "Salary" }];
  for (let i = 0; i < n; i++) {
    out.push({ id: `b${i}`, kind: i % 3 === 0 ? "bucket" : "vendor", label: `Thing ${i}` });
  }
  return out;
}

function edges(n: number) {
  const out: { src: string; dst: string; rel: string; flow: number }[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ src: "inc", dst: `b${i}`, rel: "ALLOCATES_FIXED", flow: 100 + i });
  }
  return out;
}

// Each chart takes its own shape. Written out per chart rather than shared,
// because a fixture that has to be coerced to fit is one that stops resembling
// what the app actually passes.
function cells(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    label: `Bucket ${i}`,
    tier: (i % 3) + 1,
    allocated: 1000 + i,
    projected: 900 + i,
    status: "on_track" as const,
  }));
}

function bars(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    label: `Bucket ${i}`,
    tier: (i % 3) + 1,
    allocated: 1000 + i,
    projected: 900 + i,
    status: "on_track" as const,
  }));
}

function treeBuckets(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    label: `Bucket ${i}`,
    tier: (i % 3) + 1,
    allocated: 1000 + i,
    projected: 900 + i,
    status: "on_track" as const,
  }));
}

function treeVendors(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    bucketId: `b${i % Math.max(1, n)}`,
    vendorId: `v${i}`,
    vendorLabel: `Vendor ${i}`,
    amount: 50 + i,
  }));
}

const COUNTS = [0, 1, 2, 200];

console.log("\nEvery chart, at every item count that matters\n");

for (const n of COUNTS) {
  probe("Sankey", n, () =>
    renderToStaticMarkup(
      createElement(SankeyFlow, {
        nodes: nodes(n),
        edges: edges(n),
        width: 760,
        height: 420,
      } as never),
    ),
  );
}

for (const n of COUNTS) {
  probe("Treemap", n, () =>
    renderToStaticMarkup(createElement(Treemap, { cells: cells(n) } as never)),
  );
}

for (const n of COUNTS) {
  probe("BudgetBars", n, () =>
    renderToStaticMarkup(createElement(BudgetBars, { rows: bars(n) } as never)),
  );
}

for (const n of COUNTS) {
  probe("TreeGraph", n, () =>
    renderToStaticMarkup(
      createElement(TreeGraph, {
        rootLabel: "Household",
        buckets: treeBuckets(n),
        vendors: treeVendors(n),
      } as never),
    ),
  );
}

for (const n of COUNTS) {
  probe("NetworkGraph", n, () =>
    renderToStaticMarkup(
      createElement(NetworkGraph, { nodes: nodes(n), edges: edges(n) } as never),
    ),
  );
}

console.log(report.join("\n"));
console.log(
  failures
    ? `\n${failures} chart/count combination(s) fail. These are the current failure modes.`
    : "\nEvery chart renders at 0, 1, 2 and 200 items.",
);
// Now a GATE. It began as a reporting run — the brief asks for the current
// failure modes to be measured before anything is changed — and those were:
// five charts drawing all 200 items (47KB to 230KB of markup) and three drawing
// a blank panel at zero. All fixed, so a regression should fail the build.
process.exit(failures ? 1 : 0);
