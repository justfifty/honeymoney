# The HoneyMoney financial knowledge graph — model reference

Verified against `web/src/lib/graph.ts`, `web/src/lib/moneyView.ts`, `web/src/lib/focusView.ts`,
`web/src/lib/ledger.ts` and `pocketbase/pb_migrations/`. When code and this file disagree, the
code wins — and this file should be corrected.

---

## 1. Why a graph at all

A ledger table answers *what did I spend?* A graph answers the questions a household actually
argues about:

- "If we raise the car loan payment, **which goal slips?**" — traverse `OWES` → `bucket` →
  competing `CONTRIBUTES_TO` edges.
- "**Who** spent at this vendor, out of **whose** envelope?" — `transaction.member` +
  `wallet_node` + `vendor_node` on one edge.
- "What happens to the family if **this income stops?**" — cut one `income_source` node and
  re-run allocation; every downstream bucket and goal reprices.

Those are *path* questions. In a relational schema each one is a bespoke join; in the graph they
are the same traversal with a different starting node. That is the honest technical answer to
"why a knowledge graph" — not "graphs are trendy".

The second reason is **schema-free extension**. `props` is a JSON bag on every node and the
relation set is data, not columns. Personal, couple, family and business tenants all run on one
engine because a business's `obligation` and a family's `goal` are the same shape.

---

## 2. Collections

### `nodes`
```
{ tenant, kind, label, props }
```

| kind | badge | meaning | typical props |
|---|---|---|---|
| `income_source` | 💰 | salary, freelance, rental, business revenue | `monthly_amount`, `cadence`, `owner` |
| `bucket` | 🪣 | an envelope — the unit of budgeting | `bucket` (tier 1/2/3), `default_spend`, `private` |
| `goal` | 🎯 | a target being saved toward | `target`, `current`, `by` |
| `vendor` | 🏪 | where money left the household | (usually empty; created on demand) |
| `obligation` | 📄 | a recurring commitment — loan, subscription, bill | `amount`, `cadence`, `next_due` |
| `wallet` | 👛 | an account/instrument holding money | `institution` |

**Bucket tiers** are the 3-bucket model: **tier 1 = Needs**, **tier 2 = Wants**, **tier 3 =
Savings/Goals**, stored as `props.bucket`. See the **money-model** skill for the tier semantics
and the **finance-content** skill for how to word them.

`props.private = true` marks a node the rest of the household should not see in detail — the
autonomy affordance. Renderers show it 🔒 and must not leak its amounts.

### `edges`
```
{ tenant, src_node, dst_node, rel, amount | percentage, cadence, valid_to }
```

| rel | direction | carries | meaning |
|---|---|---|---|
| `ALLOCATES_FIXED` | income → bucket | `amount` | "RM 1,200/mo of this income goes to this envelope" |
| `ALLOCATES_PCT` | income → bucket | `percentage` | "20% of this income goes to this envelope" |
| `FUNDS` | bucket → bucket | `amount` | envelope tops up another envelope |
| `SPENT_AT` | bucket → vendor | — | this envelope has spending at this vendor |
| `CONTRIBUTES_TO` | bucket → goal | `amount` | envelope feeds a goal |
| `OWES` | bucket → obligation | `amount` | envelope carries a commitment |

**`valid_to = ''` means the edge is open (current).** Closing an edge by stamping `valid_to`
retires it *without* destroying the history that depended on it. Every read of "current
structure" must filter `valid_to = ''`; every historical read must not.

`SPENT_AT` is **structural, not quantitative** — it says a relationship exists. The money lives
in the transactions that realize it. This is why re-pointing a transaction to a different bucket
or vendor also re-points its `edge` (see `updateTransaction`).

### `transactions`
```
{ tenant, edge, wallet_node, vendor_node, member, amount, currency, occurred_at,
  source, direction, voided, parse_confidence, raw, note }
```

- `direction`: `"out"` = debit/spend (default) · `"in"` = credit/money-in.
- `source`: provenance — `manual`, `telegram`, `import`, `voice`, `photo`. Surfaced as a chip in
  the UI so a user can always see *how* a number got there.
- `parse_confidence`: `1` for typed, `<1` for AI-parsed. **Anything below the confidence
  threshold must be shown for confirmation, never silently committed.**
- `raw.entered`: `{amount, currency, perMYR, rateSource}` when the user typed a non-MYR figure.
  Amounts are stored in the tenant base currency (MYR); this preserves what they actually typed.
- `voided`: soft-delete flag. The row survives, struck through and restorable.

### `channel_links`
`{tenant, channel, external_id}` — maps an external identity (e.g. a Telegram chat id) to a
tenant. Unique on `channel + external_id`; `linkChannel` is idempotent.

### The ledger
`lib/ledger.ts` `append({tenantId, op, collection, recordId, before, after, actorId, actorEmail})`
writes a **hash-chained** entry per mutation. Ops: `create` · `update` · `void` · `restore`.
Chain integrity is what lets the app claim a tamper-evident audit trail — a judged, demonstrable
feature at `/ledger`.

---

## 3. Derived views (never stored, always computed)

`getBucketProjection(tenantId)` → per bucket: `allocated`, `projected_spend`, `status`.

**Status rules** (`lib/format.ts` `STATUS_STYLE` + projection):

| status | colour | meaning |
|---|---|---|
| `on_track` | `#248A54` green | projected spend comfortably within allocation |
| `at_risk` | `#E8A012` amber | projected to breach allocation this period |
| `over_budget` | `#C94F4F` red | already past allocation |
| `unfunded` | `#9AA0A6` grey | bucket exists but nothing allocates to it |

`unfunded` is a *first-class* state, not an error — a newly created envelope is legitimately
unfunded, and saying so is more useful than showing 0%.

Other derivations:
- `getRecentSpend(tenantId, n)` — the recent-activity strip.
- `detectRecurring(tenantId)` (`lib/radar.ts`) — subscription/bill radar: cadence + next likely date.
- `getHoneyInsight(projection, locale)` — the natural-language read of the projection. Falls back
  to deterministic rules when no AI provider is configured; the badge tells the user which.
- `getFocusedView(tenantId, focus, lang, personaIds)` (`lib/focusView.ts`) — the lens.

**Presentation must never invent numbers.** If a view needs a figure, it comes from a derivation
function so every view agrees.

---

## 4. Extension recipes

**Add a concept that is a thing** → new `kind` + entries in `KIND_BADGE` (graph page) and the
lens groups. Put its attributes in `props`. No migration.

**Add a concept that is a link** → new `rel` + an entry in `REL_STYLE` (stroke/dash) and the
legend. Decide up front whether it is structural (like `SPENT_AT`) or quantitative (like
`ALLOCATES_FIXED`), and if quantitative, whether it carries `amount` or `percentage`.

**Add an attribute** → `props`, always. A new column requires a migration in
`pocketbase/pb_migrations/` and forks the schema for every tenant kind; earn it first.

**Add a write path** → it must (a) filter by tenant, (b) find-or-create rather than duplicate,
(c) `append()` to the ledger with before/after and an actor, (d) set `source` and
`parse_confidence` honestly.

**Retire something** → stamp `valid_to` on the edge or `voided` on the transaction. Never
`DELETE`.

---

## 5. Query hygiene

- `pbStr()` every interpolated value. Filters are strings; unescaped input is injection.
- `pbFirst` for find-or-create, `pbList` with an explicit `sort` for anything rendered — implicit
  ordering makes server and client SVG disagree and breaks hydration.
- Batch independent reads with `Promise.all` (the dashboard reads projection + recent + vendors +
  radar concurrently).
- `perPage` explicitly on anything unbounded (vendors are capped at 80 on the dashboard).

---

## Sources
- [Knowledge Graphs in Practice: Characterizing their Users, Challenges, and Visualization Opportunities (arXiv 2304.01311)](https://arxiv.org/pdf/2304.01311)
- [Graph visualization UX: Designing intuitive data experiences — Cambridge Intelligence](https://cambridge-intelligence.com/blog/designing-intuitive-data-experiences-with-graph-visualizations/)
- [Guide to Creating Knowledge Graph Visualizations — yFiles](https://www.yfiles.com/resources/how-to/guide-to-visualizing-knowledge-graphs)
