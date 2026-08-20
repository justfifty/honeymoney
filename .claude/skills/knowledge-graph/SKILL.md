---
name: knowledge-graph
description: >-
  Work on HoneyMoney's financial knowledge graph — the nodes/edges/transactions model in
  PocketBase, its invariants (append-only hash-chained ledger, void-not-delete, open vs
  closed edges), the derived money views, and how to render a graph so a non-expert
  understands it instead of seeing a hairball. Use whenever adding a node kind or relation,
  changing allocation/projection maths, touching /graph's six views or the focus lens,
  writing graph queries, or explaining "why a knowledge graph" to a judge. Triggers on:
  "knowledge graph", "graph schema", "node kind", "relation/edge", "sankey", "treemap",
  "focus lens", "allocation", "projection", "ledger", "audit trail", "graph view",
  "why a graph not a table".
---

Base directory: `.claude/skills/knowledge-graph`

# HoneyMoney — Knowledge graph skill

The graph is the product's technical differentiator. A budgeting app stores rows; HoneyMoney
stores **a household's money as a connected structure** — who earns, into which envelope it is
allocated, what that envelope owes, where it actually got spent, and what goal it starves when
it overspends. Every claim in the pitch about "knowledge graph" has to be true in the schema,
not just in the slides.

## When to use
- Adding or changing a **node kind**, **relation**, or the props bag on either.
- Changing **allocation / projection / status** maths (`lib/projection.ts`, `lib/moneyView.ts`).
- Working on **`/graph`** — the six views (sankey · treemap · tree · organic · bars · flow),
  the focus lens (`lib/focusView.ts`), legends, captions, empty states.
- Writing PocketBase queries against `nodes` / `edges` / `transactions`.
- Explaining the graph to a judge, in the deck, or in `/guide`.

## When NOT to use
- Chart colour/axis/legend specifics inside a view → **dataviz** skill.
- Page layout, spacing, conversion, a11y of `/graph` as a *page* → **web-design** skill.
- How a spend gets *into* the graph (forms, voice, photo, import, Telegram) →
  **expense-capture** skill.
- Who may see or write what across personal/couple/family → **money-model** skill.

## The model (verified against `web/src/lib/graph.ts`)

Three PocketBase collections carry everything:

| Collection | Shape | Notes |
|---|---|---|
| `nodes` | `{tenant, kind, label, props}` | `props` is a free JSON bag — new concepts need **no migration** |
| `edges` | `{tenant, src_node, dst_node, rel, amount \| percentage, cadence, valid_to}` | `valid_to = ''` means **open/current**; closing an edge preserves history |
| `transactions` | `{tenant, edge, wallet_node, vendor_node, member, amount, currency, occurred_at, source, direction, voided, parse_confidence, raw, note}` | a transaction **realizes** an edge |

**Node kinds:** `income_source` 💰 · `bucket` 🪣 · `goal` 🎯 · `vendor` 🏪 · `obligation` 📄 ·
`wallet` 👛. **Relations:** `ALLOCATES_FIXED` · `ALLOCATES_PCT` · `FUNDS` · `SPENT_AT` ·
`CONTRIBUTES_TO` · `OWES`.

Read `references/graph-model.md` before changing any of it — it documents the invariants and
the extension rules.

## Invariants — do not break these
1. **Tenant-scoped, always.** Every query filters `tenant = <id>`. A missing tenant filter is a
   privacy bug, not a perf bug. Anonymous visitors may only reach seeded demo personas.
2. **Append-only truth.** Every mutation calls `append()` (`lib/ledger.ts`) into a hash-chained
   ledger. A record can be **corrected** or **voided**, never quietly rewritten.
3. **Void, don't delete.** `setTransactionVoided` keeps the row and records the act of voiding.
   `/records?voided=1` shows them struck through, restorable.
4. **Find-or-create, don't duplicate.** Vendors are matched case-insensitively per tenant;
   `SPENT_AT` edges are found-or-created. Re-pointing a transaction re-points its edge.
5. **Money is auditable.** A foreign-currency entry keeps what the user actually typed plus the
   rate and rate source in `raw.entered`. RM 42.10 with no memory of "S$12.00 at BNM's rate that
   day" is unauditable.
6. **`props`, not new columns.** New subject matter goes in the props bag. This is what lets one
   engine serve personal, family and business without a schema fork.

## Rendering rules (the part users actually see)
Research is blunt about node-link diagrams: non-experts are confused by the "ball of yarn",
**trust results less** when shown as a raw graph, and disengage past a complexity threshold. So:

1. **Never open on the hairball.** Default `mode=sankey` (flow with quantities), not `organic`.
   The organic network view is the "look, it really is a graph" exhibit, not the daily driver.
2. **Answer a question per view.** Sankey = *where did the money go?* Treemap = *which envelope
   is biggest / in trouble?* Tree = *how is the household structured?* Bars = *am I within
   budget?* Flow = *income → envelope → vendor.* Organic = *everything is connected.* Every view
   carries a one-line caption saying which question it answers.
3. **Progressive disclosure, not more pixels.** The focus lens (income · bucket · vendor ·
   category · person) is the primary complexity control — filter down, then expand. Prefer
   collapse/expand and filter over zoom-and-pray.
4. **Colour encodes entity or status, never rank.** Status: on_track `#248A54` · at_risk
   `#E8A012` · over_budget `#C94F4F` · unfunded `#9AA0A6`.
5. **Every mark carries a text label** — that's the accessible secondary encoding, and it is why
   the charts are hand-rolled deterministic SVG (server render == client render) with no chart
   library.
6. **Empty states are a view, too.** A focused view with no nodes must explain the filter and
   offer one tap back to the whole graph.

## Workflow
1. **Read the model first** — `references/graph-model.md`, then the actual code in
   `lib/graph.ts` / `lib/moneyView.ts` / `lib/focusView.ts`. Don't infer the schema.
2. **Locate the change**: is it *structure* (node/edge), *derivation* (projection/status), or
   *presentation* (a view)? Keep them separate; presentation must not invent numbers.
3. **Extend via `props` + a new `rel`** where possible. A new column is a last resort and needs
   a migration in `pocketbase/pb_migrations/`.
4. **Preserve the ledger contract.** Any new write path calls `append()` with before/after and
   an actor. No exceptions — the audit trail is a judged feature.
5. **Verify:** demo persona *and* a fresh empty household; each of the six views; focused *and*
   unfocused; light + dark; a longer-language string; a non-MYR currency.

## Reference files
- `references/graph-model.md` — collections, kinds, relations, invariants, extension recipes,
  the derived money views and status rules.
- `references/graph-ux.md` — the researched evidence on graph comprehension for non-experts,
  the per-view question map, progressive-disclosure ladder, and the anti-patterns.

## Related skills
**expense-capture** (how data arrives) · **money-model** (who may see it) · **dataviz** (inside a
chart) · **web-design** (the page around it) · **finance-content** (the words).
