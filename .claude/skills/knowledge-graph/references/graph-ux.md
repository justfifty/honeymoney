# Rendering a knowledge graph for people who don't like graphs

The evidence, the per-view question map, and the anti-patterns. This is the file to read before
touching anything in `web/src/app/graph/`.

---

## 1. What the research actually says

Three findings should govern every decision here:

1. **Non-experts are confused by node-link diagrams.** The "ball of yarn" / hairball is the
   canonical failure. Users hit a complexity threshold and simply disengage.
2. **Users trust graph-rendered results *less* than the same facts in a familiar form.** For a
   money app this is fatal — trust is the product. An entity–relation *table* often reads as more
   credible to a non-expert than the same relationships drawn.
3. **The most effective way for non-technical people to engage with a knowledge graph is through
   an application powered by it — not by looking at it.** The graph should be the engine; the
   visual is an exhibit.

The practical consequence for HoneyMoney: **the graph earns its place by answering questions,
and the node-link view is the last view a new user should meet, not the first.**

Progressive disclosure is the named remedy in the literature — collapse/expand, filter by node
type, search-then-expand-neighbours, detail on demand. Tools routinely aim for a comprehensive
overview and under-serve disclosure; don't repeat that.

---

## 2. The six views and the question each one answers

`/graph` ships six modes. Each must state its question in one line (the `g.caption.*` strings)
and must be reachable in one tap.

| mode | icon | The question it answers | Use when |
|---|---|---|---|
| `sankey` | 🌊 | **Where did the money actually go?** | **Default.** Quantities + flow, legible at a glance |
| `treemap` | 🟦 | **Which envelope is biggest, and which is in trouble?** | Comparing magnitude + status together |
| `tree` | 🌳 | **How is this household structured?** | Explaining tiers: household → bucket → vendor |
| `bars` | 📊 | **Am I inside budget?** | The most boring and most used check |
| `flow` | ⇄ | **Income → envelope → vendor, left to right.** | Teaching the model; the pitch shot |
| `organic` | 🕸️ | **Everything really is connected.** | The exhibit. Never the default |

Ordering in the switcher should follow *frequency of use*, not visual impressiveness. `sankey`
first, `organic` last.

**Layout convention in `flow`:** expenses (vendors) LEFT · household structure (buckets, goals,
obligations) MIDDLE · income sources RIGHT. Money flows right → middle → left. Keep it; the
demo narration depends on it.

---

## 3. The progressive-disclosure ladder

Climb only as far as the user asks:

```
Rung 0  A sentence.        "You're RM 320 over on Wants this month."   ← Honey insight
Rung 1  A status chip.     🪣 Wants  [at risk]                          ← bucket cards
Rung 2  One quantity.      projected RM 1,520 of RM 1,200
Rung 3  A shaped view.     bars → treemap → sankey
Rung 4  The lens.          focus: this vendor / this person / this envelope
Rung 5  The network.       organic node-link — "and here's the whole graph"
```

Most users stop at rung 1. The dashboard's job is rungs 0–2; `/graph`'s job is rungs 3–5. A
design that forces a user to rung 4 to learn something they needed at rung 0 has failed,
regardless of how good it looks.

**The focus lens is the disclosure control.** `lib/focusView.ts` supports lenses on income,
bucket, vendor, category and person. Filtering down beats zooming in: a focused sankey of one
vendor is comprehensible; the whole graph zoomed to 300% is not.

---

## 4. Rules for the SVG itself

The charts are **hand-rolled, deterministic SVG** — no chart library, server render must equal
client render. That constraint is deliberate (no hydration mismatch, no 200 KB dependency, full
control of the accessible layer). Honour it:

- **Every mark carries a text label.** The label is the accessible secondary encoding; it is why
  these charts pass without ARIA gymnastics. Never rely on colour alone.
- **Colour encodes entity or status, never rank.** Status palette: on_track `#248A54` · at_risk
  `#E8A012` · over_budget `#C94F4F` · unfunded `#9AA0A6`. Relation palette: allocation `#FF7518`
  · spending `#C94F4F` · goal `#248A54` · obligation `#8A7A5E` (dashed) · bucket `#5B7DB1`.
- **Dash encodes kind, not emphasis.** `ALLOCATES_PCT` is dashed because it is a *percentage*;
  `OWES` is dashed because it is a *commitment*. Don't dash for decoration.
- **Stroke width encodes flow magnitude**, normalized to the largest flow in view
  (`1.5 + (flow/maxFlow) * 7`). Re-normalize per view, or a single big vendor flattens everything.
- **`role="img"` + a real `aria-label`** on every `<svg>`, plus the caption paragraph below it.
- **No animation on load** for data marks; respect `prefers-reduced-motion`.
- **Horizontal scroll belongs to the chart container**, never the page body. Wide SVGs sit in an
  `overflow-x-auto` wrapper with a sensible `minWidth`.
- **Deterministic sort** on every node list (`localeCompare`) — otherwise row order drifts
  between server and client.

---

## 5. Legends, captions, empty states

- **Legend must match the mode.** Status legend for treemap/tree/bars; relation legend for
  sankey/flow/organic. Showing a legend for marks that aren't on screen teaches the wrong model.
- **Caption is mandatory** — one line, plain language, says what the view answers, sits directly
  under the chart.
- **Empty state is a designed view.** A focused lens with no nodes must (a) name the filter, (b)
  say why it might be empty, (c) offer one tap back to the whole graph. Never render a blank box.
- **Zero is not empty.** A bucket with RM 0 spent is `unfunded` or `on_track`, not missing.

---

## 6. Anti-patterns

| Don't | Because |
|---|---|
| Open on the organic/network view | Hairball; measured trust *drop* for non-experts |
| Render every node "for completeness" | Past a threshold users disengage entirely |
| Rely on hover to convey a value | Dead on touch, invisible to keyboard and screen readers |
| Colour nodes by degree/rank | Colour is reserved for entity & status; rank reads as importance |
| Add a chart library for one view | Breaks the deterministic-SVG contract and the a11y layer |
| Put the "why" only in the caption | The insight sentence at rung 0 is what most users read |
| Let a view compute its own totals | Two views disagreeing about one number destroys trust |
| Show `props.private` amounts in an aggregate a partner can see | Privacy is a **money-model** invariant, enforced in every view |

---

## 7. Verify before calling it done

- All six modes, focused **and** unfocused.
- The demo persona **and** a brand-new empty household.
- Light + dark, mobile + desktop.
- A longer-language string (BM/ta) and a non-MYR currency — labels must not overflow or truncate money.
- Keyboard-only: every mode switch and lens reachable and visibly focused.
- View source: server-rendered SVG matches what the client paints.

---

## Sources
- [Knowledge Graphs in Practice: Characterizing their Users, Challenges, and Visualization Opportunities (arXiv 2304.01311)](https://arxiv.org/pdf/2304.01311)
- [The Role of Visualization in LLM-Assisted Knowledge Graph Systems: Effects on User Trust, Exploration, and Workflows (arXiv 2505.21512)](https://arxiv.org/pdf/2505.21512)
- [Graph visualization UX: Designing intuitive data experiences — Cambridge Intelligence](https://cambridge-intelligence.com/blog/designing-intuitive-data-experiences-with-graph-visualizations/)
- [Deigmata: A User-Centered Visualization Tool for Knowledge Graph Exploration](https://www.imrpress.com/journal/KO/52/8/10.31083/KO46137)
- [Guide to Creating Knowledge Graph Visualizations — yFiles](https://www.yfiles.com/resources/how-to/guide-to-visualizing-knowledge-graphs)
- [What is Progressive Disclosure? — Interaction Design Foundation](https://ixdf.org/literature/topics/progressive-disclosure)
