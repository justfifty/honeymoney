# HoneyMoney — Implementation Brief

**Target:** Claude Code (VS Code)
**Scope:** Eleven changes across the Record flow, H-Score, Goals, Import, Dashboard, the Graph Gallery, receipt handling, and primary navigation.

---

## How to use this brief

Work in this order: **Task 5 → Task 3 → Task 4 → Tasks 1 + 6 together → Task 8 → Task 9 → Task 11 → Task 7 → Task 10 → Task 2.**

**Tasks 1 and 6 both change the Record data model and must be designed and migrated as a single change.** Doing them separately means writing two migrations over the same records and reconciling them afterwards. Read both sections fully before writing either.

**Task 8 (H-Score) comes before Task 7 (Dashboard)** because the Dashboard and Ask Honey both display H-Score figures and must not disagree with it.

**Task 9 (Goals) is split.** Its data model, linking rules and the `More` screen belong to Task 9; its Dashboard and chart surfaces are built as part of Task 7. Design the Goals schema before starting Task 7, because the Sankey needs somewhere for savings transfers to terminate.

**Task 11 (chart naming registry) comes before Task 7** so the Dashboard is built against the canonical names rather than renamed afterwards.

**Task 10's photo import half depends on Task 2** and is deferred with it. The file and folder import half is not, and ships in this release.

Tasks 5, 3, 4, 1, 6, 7, 8, 9, 10 and 11 should ship together as one release. **Task 2 is a multi-week feature with its own data model — do not start coding it until the Open Decisions at the end of that section are resolved.** If you reach Task 2 in the same session, stop and produce a written spec instead of an implementation.

Before writing code for any task, read the existing implementation and report back what you found if it contradicts an assumption in this brief. Several tasks below make assumptions about the current architecture that need verification.

**Standing constraints for all tasks:**

- Thin-server / fat-client. Computation belongs in the browser; PocketBase stores and serves.
- No new server-side runtime dependencies on DOM Cloud.
- No paid third-party services. Anything AI-powered runs on the user's own key or their own machine.
- H-Score is computed client-side. Do not modify H-Score computation as a side effect of any task here — if a change appears to require it, stop and flag it.
- Existing records must continue to load and display correctly. Any schema change needs a migration path.

---

## Task 5 — Primary navigation must stay visible at all widths

**Problem:** `Record`, `Dashboard`, `H-Score` and `More` disappear when the window narrows. These are the app's four primary destinations; losing them at small widths is the highest-severity issue in this brief, because it breaks the app for exactly the phone-sized viewport most users are on.

**Step 1 — Diagnose before fixing.** Find the actual cause and report it. Likely candidates:

- A responsive utility hiding the nav below a breakpoint (`hidden md:flex` or similar)
- A no-wrap flex row overflowing its container, with items pushed outside the visible area
- A hamburger/overflow menu that is supposed to take over at narrow widths but is broken, mispositioned, or rendering behind another element
- A fixed-width logo or account control consuming the space the nav needs

Do not apply a fix until you can state which of these it is.

**Step 2 — Implement.** Requirements:

- All four destinations are reachable at every viewport width down to **320px**. None of the four may ever be collapsed into an overflow menu — `More` is already the overflow menu.
- Degrade gracefully rather than hiding: icon + label at wide widths, icon-only with an accessible label at narrow widths. Labels may shrink; destinations may not disappear.
- Minimum 44×44px touch target per item.
- Active destination is visually distinct by more than colour alone (weight, underline, or fill).
- Respect PWA safe-area insets (`env(safe-area-inset-*)`) so the bar isn't clipped on notched devices or behind the iOS home indicator.
- Keyboard focus is visible on each item; the bar is a `<nav>` with the active item marked `aria-current="page"`.

**Step 3 — Verify** at 320px, 375px, 768px, 1024px and 1440px, and confirm the bar survives a mid-session resize (not just a fresh load at that width) — a CSS-only solution will, a JS-measured one may not.

**Consider and report, don't unilaterally implement:** for a PWA used one-handed on a phone, a bottom tab bar at narrow widths reaches the thumb far better than a top bar. If the codebase makes this a contained change, say so and estimate it; the decision is the user's.

---

## Task 3 — Remove the Speak function

Remove it entirely rather than hiding it behind a flag.

**Rationale (for the changelog):** the Web Speech API handles Manglish and BM/English code-switching poorly. This is a structural limitation of the browser API, not a tuning problem, so the feature cannot be improved in place.

**Checklist:**

- Remove the Speak control from the Record flow and any other entry points.
- Remove the microphone permission request. Users should stop being prompted entirely — verify no permission prompt fires anywhere in the app after this change.
- Remove the speech recognition service/hook and any state it owned.
- **Check for hidden coupling:** confirm nothing else in the record flow reads from a transcript field, assumes an active mic stream, or branches on a "voice input" mode. Grep for the feature's identifiers before deleting, not after.
- Remove now-dead dependencies, polyfills, and type definitions.
- If any stored record carries a voice-input flag or transcript field, leave the stored data intact and stop reading it — do not write a destructive migration.

**Note for future work:** if voice returns, the correct shape is record audio → send to the user's own AI key (Gemini accepts audio natively) → structured transaction. That reuses the Task 2 BYO-key infrastructure rather than the browser API. Do not build this now.

---

## Task 4 — Viewable attachments

**Problem:** uploaded receipt scans and photos can't be opened. Users need to read the details.

**Requirements:**

- Thumbnail in the record list and record detail. Use PocketBase's built-in thumb generation (`?thumb=100x100`) — do not generate thumbnails client-side.
- Tapping the thumbnail opens a full-screen viewer. Load the full-resolution original **only** when the viewer opens.
- Viewer must support:
  - **Pinch-zoom and double-tap-to-zoom** — non-negotiable, receipt text is unreadable at fit-to-screen
  - **Rotate** — people photograph receipts sideways constantly
  - **Swipe between attachments** when a record has more than one
  - Pan while zoomed, and a clear close affordance
- Loading and error states: a spinner while the original loads, and a real message with a retry if it fails. Not a blank frame.
- Keyboard: `Esc` closes, arrow keys move between attachments.

**Forward compatibility with Task 2:** structure the viewer so extracted line items can later render alongside the image (side-by-side on wide viewports, stacked on narrow) without a rewrite. Verification is a glance-between, not a memory test. Build the layout seam now; leave the panel empty.

---

## Task 1 — Sign-based record categorisation

**Problem:** the `From bucket` field is redundant data entry and the category list is long. Replace with a `+` / `−` toggle.

- `+` → Income, Savings, Others
- `−` → Must-paid, Spendings, Others

### Before implementing — three things to verify and resolve

**1. Savings is a transfer, not income.** Money moved from a current account into savings is not new money. If `+ Savings RM500` increments cash the same way `+ Income RM500` does, the ledger double-counts and H-Score inflates on nothing.

Model **three internal record kinds — `inflow`, `outflow`, `transfer`** — while the UI still shows only two buttons. `Savings` under `+` routes to `transfer`, with the destination inferred rather than asked. Check what H-Score currently does with savings-categorised records before changing the input shape, and report what you find.

**2. "Others" appears on both sides and must not merge.** Use distinct persisted keys (`income_other` and `expense_other`, or equivalent). Never a shared `other`. Cheap now, painful to migrate later.

**3. Removing "From bucket" is only safe if category → bucket is deterministic.** Verify this. If any bucket can receive from more than one category, removing the field moves the ambiguity rather than eliminating it — stop and report before proceeding.

### Visual treatment

- `+` → orange theme. `−` → dark grey theme.
- Deliberately not green/red: red-green colour deficiency is the common one, and orange/grey sidesteps it. Do not "correct" this back to conventional colours.
- **Hue must not be load-bearing.** Always render the `+` / `−` glyph alongside the colour. The record type must be identifiable in greyscale.
- Use a darker orange (around `#B45309`) for text and thin strokes to clear WCAG AA contrast on light backgrounds. Reserve the bright brand orange for fills, chips and large blocks.
- Target 4.5:1 for text, 3:1 for interactive boundaries. Verify, don't assume.

### Migration

Existing records must map cleanly onto the new kinds. Write the migration, state your mapping assumptions explicitly, and flag any record that can't be mapped deterministically rather than guessing.

---

## Task 6 — Persona context and attribution at the top of Record

**Goal:** before any other input, the Record flow establishes whose money this is — individual, couple, or family — and the user's inflow/outflow preference follows from it.

This is the feature that makes HoneyMoney a *household* app rather than a personal one. It is also the easiest place in the product to create a data model that cannot answer the questions couples actually ask. Read all of the below before designing the schema.

### Separate the two concepts first

"Persona" is doing two jobs in the request, and they belong in different places:

- **Household composition** — individual / couple / family. This is a **setting, established once at onboarding and editable later.** It is not a per-record input. Nobody should re-declare that they are married on every transaction.
- **Attribution** — whose this particular record is. This *is* the per-record field, and its options are derived from the household composition.

At the top of Record, display the household composition as **context, not a control** (a compact chip or label). What the user actually touches is the attribution control beneath it, which renders differently per composition:

| Composition | Attribution control |
|---|---|
| Individual | Not rendered at all |
| Couple | Mine / Partner's / Joint |
| Family | Mine / Partner's / Joint / per-dependant |

**Solo users must pay no tax for this feature.** If composition is `individual`, the attribution control does not render, does not occupy space, and does not add a tap.

### The decision that determines the schema

Attribution has **two independent axes**, and collapsing them into one field is the failure mode here:

- **Who paid** — the source of funds
- **Who benefited** — the allocation

One partner pays for the family's groceries from her own account: source is her, benefit is the household. With a single field you can answer *either* "are we splitting fairly?" *or* "what does the household spend on groceries?" — never both.

For v1, **one axis is acceptable — but choose it deliberately and name the field for what it actually holds.** The recommendation is **who paid**: it's objective, the user knows it at entry time without thinking, and benefit can be inferred from category in most cases. Do not name the field something ambiguous like `persona` or `owner` that will later be read as whichever axis is convenient.

Whichever is chosen, leave a schema seam for the second axis. Adding a nullable field later is easy; splitting one overloaded field into two after a year of records is not.

### Privacy — decide before writing collection rules

In a shared-household app, **can partner A see records partner B tagged as individual?** Many Malaysian households run yours/mine/ours account structures deliberately, and getting this wrong has consequences well beyond the software.

Pick a stance explicitly and state it in the PR:

1. Fully transparent — all records visible to all household members
2. Individual records private by default, joint records shared
3. Per-record visibility toggle

Recommendation is (2) with an explicit, non-hidden indicator on private records — surprise is the thing to avoid, in both directions.

**Enforce this in PocketBase collection rules, server-side.** Client-side filtering is not privacy; it is a rendering choice that anyone with the API endpoint can bypass. This is not negotiable regardless of which stance is chosen.

### Inflow/outflow preference

The user's preference is a **remembered default, not a required choice.** Persist the last-used combination of attribution and `+`/`−` per user and pre-select it on the next Record. The common case — one person logging their own routine spending — should be zero extra taps versus today.

Allow the default to be overridden in settings for users whose most common entry isn't their most recent one.

### Interaction with Task 1

- Attribution applies to all three record kinds, not just `outflow`.
- **Partner-to-partner transfers are a real and common case** — "I paid you back RM200." That is a `transfer` with source = A and destination = B, and it must net to zero at household level. Confirm the model handles this without double-counting before implementing.
- A `+ Savings` record in a couple household needs both attribution *and* a savings destination. Verify these don't collide in the UI.

### Flag, don't implement

**Does H-Score compute at household level or per person?** Once composition is a first-class concept, H-Score needs a stated scope, and a couple with one high earner and one low earner will read very differently under the two interpretations. Report what the current implementation does. Do not change it as part of this task.

### Migration

Existing records predate attribution. Map them to the recording user as source, mark them explicitly as migrated-default rather than user-asserted, and do not backfill a guess about joint versus individual. If the household later needs those records reclassified, that's a user action, not an inference.

---

## Task 8 — H-Score: show where the number came from

**Depends on Tasks 1 and 6.**

**Problem:** users see a score without knowing what produced it. An unexplained composite number is either ignored or mistrusted, and neither is useful. Every part of H-Score must be traceable back to the user's own records.

### 8.1 Traceability, all the way down to records

Three levels, each reachable by tapping the one above:

1. **The score** — with the period it covers and how many records it's based on.
2. **Each of the five criteria** — its own sub-score, its weight, the actual figure behind it, and the arithmetic in one line. *"Savings rate 12% → 14 of 20 points."* Show the number, the threshold it was measured against, and the result. Not just a bar.
3. **The records** — tapping a criterion lists the specific records that fed it, filtered and ready to inspect. This is the level that turns the score from an opinion into something the user can check.

Additional requirements:

- **State what would move it.** *"Reducing must-paid by RM150/month would move this criterion from 14 to 17."* Descriptive and computed, in the same register as Ask Honey — the consequence, not an instruction to act.
- **Say what's missing.** If a criterion can't be computed properly — too little history, no income recorded, a month with no records — say so on that criterion rather than scoring it as if the data were complete. A criterion scoring low because of missing data must be visually distinct from one scoring low because of the user's finances. These are completely different situations and the current display probably conflates them.
- **A score is an opinion expressed as a number.** The weights encode a view of what a healthy household looks like. Make the methodology readable in-app — thresholds, weights, period — rather than leaving users to infer it.

### 8.2 Rename "Privacy discipline" — and check the other four

`Privacy discipline` fails the basic test: a user cannot guess from the name what it measures or what would change it.

**First, read the computation and report what this criterion actually measures.** Do not rename it from the current label — rename it from the code. If it turns out the name doesn't match the computation, that's a finding to surface, not to paper over.

Naming rules for all five criteria:

- Name it after **what the user does or has**, in words they'd use themselves. Not an abstract noun paired with `discipline`, `hygiene`, `health`, or `index`.
- The test: *could a user guess what moves this, from the name alone?* If not, it's not ready.
- Each criterion gets a one-line plain description beneath the name. Sentence case, active voice, no jargon.
- **Check all five, not just this one.** If one label drifted into jargon, others likely did too.
- **Verify they translate.** Abstract English compounds translate badly into BM, Chinese and Tamil — often into something more obscure than the English. Any name that can't be rendered plainly in every supported language is the wrong name. Test this before settling on it, not after Task 7.6 exposes it.

### 8.3 How inflows map onto the five criteria

Document and display the mapping explicitly — for each criterion, which record kinds and categories feed it, and which are ignored.

Resolve these before implementing:

- **Transfers are not income.** A `+ Savings` record from Task 1 is a `transfer`. If a savings-rate criterion counts it as both income and saving, the score inflates on a single movement of money. Verify what the current implementation does — this is the most likely existing bug in H-Score.
- **Irregular income needs a stated smoothing rule.** Bonuses, freelance payments, festive gifts and commission are normal in Malaysian households, and a lumpy month should not spike or crater the score. State the averaging window on the criterion, and prefer a trailing multi-month view over a single-month snapshot. Whatever the rule, the user should be able to see it.
- **Report the scope, do not choose it alone.** Household-level or per-person, following Task 6. A couple with one high and one low earner reads completely differently under the two interpretations. Report what the current implementation does and stop for a decision.
- **Uncategorised and `Others` records must not silently vanish.** If a record doesn't map to any criterion, it still exists and the user should know it was excluded. Show a count of unscored records with a route to categorise them.

### 8.4 One source of truth

The Dashboard (Task 7) and Ask Honey (7.7) both display H-Score figures. All three read from the same computation, called the same way. No parallel implementation, no rounding differences. If the number on the H-Score page and the number in the chatbox ever disagree, users will trust neither.

---

## Task 9 — Goals under `More`

**Depends on Task 1. Its Dashboard surfaces are built in Task 7.**

### 9.1 Editable goal details

Users can create and adjust a goal's name, target amount, target date, and progress.

**The decision that shapes everything else: is progress derived from records, or entered by hand?**

Recommendation is **derived by default** — a goal's progress is the sum of `transfer` records linked to it, so it stays true without maintenance. Manual-only progress drifts from the ledger and quietly makes the Dashboard wrong.

But allow a **manual adjustment** for savings that happened outside the app — an existing balance, a gift, an account the user doesn't track. Store manual adjustments as a separate, visibly-labelled component rather than folding them into the derived total. The user should always be able to see *"RM8,000 tracked + RM2,000 you added manually."* Silently mixing the two produces a number nobody can reconcile later.

Editing rules:

- Changing a target must not retroactively alter recorded progress. Targets are forward-looking; the record history is fixed.
- Keep a light history of target changes. A goal repeatedly revised downward is meaningful information for the user.
- Handle goal completion and over-achievement explicitly — progress past 100% is a success state, not an overflow bug.
- Deleting a goal must not delete the linked records. Unlink them, warn clearly what will happen, and confirm.

### 9.2 Linking savings to goals

- A `transfer` record from Task 1 can be assigned to a goal at entry time. Optional — an unassigned savings transfer is valid and lands in general savings.
- A goal can be reached by more than one route; a record belongs to at most one goal.
- **Goals need attribution too, following Task 6.** In a couple household, is this goal joint or individual? Who can edit it, and who can see it? Reuse the Task 6 stance rather than inventing a second one — and a shared goal that one partner can silently retarget is a product problem before it's a technical one.

### 9.3 Surfacing in the Dashboard and charts

Built during Task 7, specified here.

- **Progress Bars** (chart 2 in the Task 7 order) is the natural home — target, achieved, and the derived/manual split visible.
- **Sankey**: goals are the clean answer to where savings transfers terminate. Income → savings → named goal keeps money inside the diagram instead of appearing to leak out of the household. This resolves the open point in 7.4.
- Show pace against the target date, not just amount: *"on track"*, *"RM120/month behind"* — computed, descriptive, no instruction attached.
- All Task 7 rules apply: goals must render at zero, one, and many; every label translated; the persona filter respected.

### 9.4 Flag, do not implement

**Does goal progress feed H-Score?** There's an argument it should — consistent saving toward a target is exactly what a household health score ought to reward. There's also a double-counting risk with any existing savings-rate criterion. Report how the two would interact and stop for a decision.

---

## Task 11 — Chart names and explanations: one source, used everywhere

**Comes before Task 7.**

The `Graph Gallery`'s names and explanations are the strongest writing in the app — clear, useful, and doing real work for the user. The problem is they exist only there, while the Dashboard and demo use their own labels.

### 11.1 The Gallery is canonical

**Extract the Gallery's content into a single shared chart registry** — one module, one entry per chart type, holding: stable id, display name, one-line description, the longer "when to use this" explanation, and the icon.

Every surface consumes the registry: Dashboard, chart switcher, demo showcase, settings, and the translation catalogue. A chart's name must be defined in exactly one place. Without this, they drift apart again within a few releases, which is how they got here.

**The Gallery's existing names win.** Where anything disagrees, change the other surface, not the Gallery.

**Note on this brief:** the names in Task 7.4 — Sankey, Progress Bars, Tree Diagram, Treemap, Node-Link Diagram, Horizontal Bar Chart, Summary Metrics — came from the change request, not from the Gallery. **Reconcile them against the Gallery and use the Gallery's wording.** The *priority order* in 7.4 stands regardless of what the charts end up being called. If a chart in 7.4 has no Gallery entry, or the Gallery holds a type not in 7.4, report the discrepancy rather than resolving it silently.

### 11.2 Carry the explanations, not just the names

The explanations are the valuable part and shouldn't stay locked in the Gallery. On every chart surface, make the one-line description reachable — an info affordance on the chart header, opening the Gallery entry.

This matters most on the Sankey. It's the default view and the least familiar diagram type to a general audience; a user meeting it cold with no explanation will bounce off the app's strongest visualisation.

### 11.3 Translation

Registry entries are translation keys, not literal strings. Both the names and the explanations go into the catalogue, and Task 7.6's live-switching requirement covers them. Chart descriptions are prose and will be the most awkward strings to translate well — flag any that don't render naturally in BM, Chinese or Tamil rather than shipping a literal translation.

### 11.4 Demo: add the Graph Showcase

The public demo is missing the showcase entirely. It's the pitch surface, and the graph range with its explanations is the most persuasive thing in the product.

- **Reuse the Gallery component and the registry.** Do not build a demo-specific copy — that recreates the drift problem this task exists to fix.
- All chart types render with the seeded data from 7.5. No empty states, no placeholders.
- Include the explanations. They are the reason the showcase is worth having.
- **Works with no login.** Nothing in the showcase may prompt for signup to view.
- **Deep-linkable per chart** — a URL that opens the demo on the Sankey is directly useful when pitching or sharing.
- **Test it on a phone over mobile data.** The demo is a first impression, often on a 375px screen on 4G. Lazy-load chart libraries per view rather than shipping all seven renderers up front.

---

## Task 7 — Dashboard

**Depends on Tasks 1, 6, 8 and 9, and on 5. Do not start before those land.** The charts read the record kinds from Task 1 and the attribution from Task 6, display figures owned by Task 8, render the goals defined in Task 9, and removing the Dashboard's own entry point is only safe once Task 5 guarantees `Record` is always reachable.

### 7.1 Persona filtering, consistent with Record

The Dashboard's persona control is a **filter**, while Record's is **data entry**. They must look and read as the same concept — same labels, same colours, same ordering — but they are not the same control and must not share the same state.

- Use one shared component and one shared label vocabulary, so `Partner's` means the same thing and looks the same in both places.
- Dashboard needs an option Record does not have: **All / Household**, which is the sensible default view.
- If household composition is `individual`, the filter does not render, exactly as in Task 6.

**Do not let the Dashboard filter write back to Record's default.** The failure case is concrete: a user filters the Dashboard to `Partner's` to review their spending, taps `Record`, and logs their own coffee against their partner. Silent mis-attribution in a couples app is worse than an extra tap. If a carry-over is wanted for convenience, the carried-over value must be visibly and unmistakably pre-selected on the Record screen, not quietly applied.

### 7.2 Viewing first, editing available

**Remove `Add a spend` from the Dashboard.** `Record` is a primary destination in the top bar and, after Task 5, always reachable — the duplicate entry point earns nothing.

Editing stays, with one hard requirement: **an edit opens the same record editor component the Record flow uses.** Do not build an inline mini-form. A parallel lightweight edit path will bypass the Task 1 record-kind rules and the Task 6 attribution and privacy rules, and will drift further from them with every subsequent change.

- Editing a record must recompute H-Score and refresh affected charts. If optimistic updates are used, reconcile against the server result and handle failure visibly.
- Deleting from the Dashboard needs a confirm step; charts make it easy to mis-tap.
- Respect Task 6 privacy: a user cannot edit a record they cannot see, and the collection rules — not the UI — enforce that.

### 7.3 Charts must never fail on item count

"Graph view for any amount of items" means **no chart may break, blank out, or disappear at any item count.** It does not mean rendering every item. Handle three regimes explicitly, for every chart type:

- **Zero items** — a real empty state with a route to `Record`. Not a blank panel, not a zero-height SVG.
- **One or two items** — must render. A Sankey with a single flow is visually thin but must not crash or collapse; give it a sensible minimum geometry.
- **Many items** — aggregate rather than cram. Show top N by value and roll the remainder into a single `Other` node, with N tuned per chart type and per viewport. A Sankey with 200 nodes is not a visualisation. Make `Other` inspectable so nothing is truly hidden.

Report the current failure mode before fixing — whether charts are being hidden below a threshold, overflowing their container, or erroring on empty data.

### 7.4 Chart types and priority order

Default order, first to last:

1. **Sankey** (default view)
2. Progress Bars
3. Tree Diagram
4. Treemap
5. Node-Link Diagram
6. Horizontal Bar Chart
7. Summary Metrics

**Sankey has one prerequisite that will otherwise produce a wrong picture:** it must consume the three record kinds from Task 1 correctly. A `transfer` — money moved to savings, or repaid between partners — is *not* an outflow. If transfers render as flows leaving the household, the diagram shows money disappearing that never left, which is precisely the misreading a household finance app cannot afford. Transfers either terminate at an in-household node or are excluded, and the choice must be stated on the chart.

**Sankey at 375px is the risk to design for.** It's the right default for the money-flow story on a wide screen, and it is the hardest of the seven to render legibly on a phone: labels collide and thin flows vanish. Options in preference order — reduce to two levels and aggregate hard at narrow widths; allow horizontal scroll with a pinned label column; or fall back to Horizontal Bar with Sankey one tap away. Pick one, and verify at 320px before considering this done.

**Worth reporting back on:** Tree Diagram, Treemap, and Node-Link are three renderings of the same hierarchy, and Node-Link in particular is high build cost for low household-finance insight. Seven chart types is a large surface to maintain and translate. Add lightweight local instrumentation of which views actually get opened so this can be pruned on evidence later rather than argued about.

### 7.5 Demo must exercise every chart type

Seed the demo with data sufficient for all seven charts to render meaningfully — not just without error.

- Enough category depth for the hierarchy charts to show more than one level.
- At least one inflow, one outflow and one **transfer**, so the Sankey demonstrates the distinction rather than hiding it.
- A `couple` household with records across both partners and joint, so the Task 6 attribution is visible.
- Plausible Malaysian household figures and merchant names — the demo is the pitch surface.
- No chart in the demo may show an empty state.

### 7.6 Translation must be live across all pages

Changing language must re-render the current view immediately. No reload, no navigation away and back.

Check each of these — the last two are the ones usually missed:

- Strings resolved reactively at render, not captured once at mount
- Every user-visible string in the catalogue, including error, empty and loading states
- Language choice persisted, and `<html lang>` updated on change
- Currency via `Intl.NumberFormat` with `MYR`, dates via `Intl.DateTimeFormat` — not hand-formatted
- **Chart labels, axis ticks, legends and tooltips**, including text rendered into SVG. Charts commonly draw once and never re-translate; verify by switching language with a chart open.
- **Category and persona names**, which may be stored values rather than translated keys. Decide whether these translate at all — a user-created category probably should not — and be consistent.

Verify with the app's full language set, not just English and one other.

### 7.7 "Ask Honey — what if?"

**Problem:** the chatbox cannot answer the question users most want to ask — *can I afford this?* Today it doesn't reach the user's own financial data, so it can't say anything specific about their situation.

This is the highest-value feature in this brief and the one with the most ways to go wrong. Read all of it before designing.

#### The architectural rule: the model never does arithmetic

**Deterministic code computes; the model parses intent and narrates the result.** The failure mode to design out is an LLM confidently stating a wrong number about someone's money — a hallucinated affordability figure is worse than no answer, because it will be believed and acted on.

Three-stage pipeline:

1. **Intent parsing (model).** Natural language → a structured query. `"can I afford a TV?"` → `{type: one_off_purchase, amount: null, category: null}`. The model's output here is a small typed object, validated before use.
2. **Computation (deterministic, client-side).** The structured query runs against the same engine that computes H-Score. Same inputs, same rules, same numbers — the chatbox must never disagree with the Dashboard.
3. **Narration (model).** Computed figures → a plain-language answer. The model is given the numbers and told to explain them, never to derive them.

This restates the invariant that governs your other projects: the model may interpret and phrase, but never silently converts inference into truth. Any number in the output must be traceable to stage 2.

**The deterministic layer must work with no model at all.** If the user hasn't configured a key, stage 2 still runs and the answer renders from a template. Less conversational, equally correct. AI improves the phrasing; it is not load-bearing.

#### Handling "a TV" — the unknown amount

`"Can I afford a TV?"` contains no price. Ask for one. Do not guess a typical TV price, and **do not look up TV prices** — that turns a budgeting tool into a product recommender, which is a different product with a different risk profile.

The good flow: *"What's the price you're looking at?"* → user says RM3,000 → deterministic answer.

#### Answer with consequence, not verdict

The `what if?` framing is the right one and should be leaned into. The answer shows **what happens**, and the user decides:

> Over your last 3 months, after must-paid commitments you have around RM480/month uncommitted. An RM3,000 purchase is about 6 months of that. Paying it in one go would take your emergency buffer from 2.4 months to 1.6 months, and your H-Score from 72 to 64.

That is arithmetic on the user's own records — a calculator that talks. It is not *"you should buy it"*, *"you can't afford it"*, or *"finance it over 12 months instead"*.

#### Scope limits — hold these firmly

The line between household budgeting arithmetic and regulated financial advice matters here, and an LLM's output cannot be pre-vetted the way the curated product directory can. Constrain both the system prompt and the intent parser's allowed types:

**In scope:** affordability arithmetic, spending pattern summaries, budget scenario projection, savings-goal timing, H-Score explanation — all computed from the user's own records.

**Out of scope — decline and route, don't attempt:** which loan, insurance, or investment product to choose; whether to invest, and in what; debt restructuring strategy; tax positions; anything requiring knowledge of products the user doesn't already hold. Hand these to the existing regulatory-safe product directory rather than answering.

Add a persistent, visible line that Honey does arithmetic on the user's own records and is not financial advice. Not buried in settings — in the chat surface.

#### Privacy — the leak is easy to write by accident

The chatbox must see **only the records the logged-in user is permitted to see under Task 6.** The natural implementation passes "the household's data" to the model, and in a couples app that quietly exposes a partner's private records through a conversational side channel. Reuse the same permission filter that governs the record list. Verify by having partner B ask Honey a question that would only be answerable using partner A's private records, and confirm it cannot answer.

#### Minimise what leaves the device

Do not send raw transaction logs with merchant names to a third-party model. Stage 2 needs aggregates, not the ledger:

- Monthly income, must-paid total, average discretionary
- Savings rate, emergency buffer in months
- H-Score and its components
- Category-level totals, no merchant detail

Smaller payload, far less sensitive, and sufficient for every in-scope question. Where a specific record genuinely matters, send that one — not the file.

**Consent and BYO key**, consistent with Task 2: the user's own Gemini key or local Ollama, no cost to them and no key held by you. First use requires an explicit, specific consent screen naming what gets sent and where. Ollama is the answer for users who won't send household finances to Google, and for a couples app that's not a fringe concern.

#### Be honest about thin data

Two weeks of records cannot support a confident three-month projection. Stage 2 returns a confidence signal based on history depth and variance; the answer states it plainly — *"based on only 3 weeks of records, so treat this as rough"* — rather than projecting a firm number from noise. Set a minimum history below which Honey declines to project at all and says why.

---

## Task 10 — Import under `More`

**Depends on Tasks 1 and 6. The photo half additionally depends on Task 2 and defers with it.**

### 10.1 Local file and folder access

**Baseline first: `<input type="file" multiple>` works in every browser.** Build this path first and make it complete on its own.

Then enhance where available:

- `webkitdirectory` on the file input gives folder selection with reasonably broad support
- The File System Access API (`showDirectoryPicker`) gives a real folder handle, but is **Chromium-only — absent on Firefox and on iOS Safari entirely.** For a Malaysian consumer PWA, iOS users are not a rounding error. Feature-detect and degrade; never gate import behind it.
- If persistent folder handles are wanted, store them in IndexedDB and re-request permission on return. Browsers drop these silently, so handle the revoked case rather than assuming.

**Formats:** CSV first, then OFX/QIF if cheap. Malaysian bank exports — Maybank, CIMB, Public Bank, RHB, Hong Leong — have no common format, and per-bank parsers will rot as banks change their exports.

Build a **column-mapping step instead**: show the user their file's columns, let them map date, description, amount, and balance once, and remember the mapping per source so subsequent imports from the same bank are one tap. This is more robust and less maintenance than any set of hardcoded parsers.

Handle the format traps explicitly: ambiguous date orders (`03/04/2026` is different in different exports — infer from the file and confirm with the user, never assume), debit/credit as separate columns versus one signed column, thousands separators, and trailing `CR`/`DR` markers.

### 10.2 Import is a proposal, never a direct write

Same rule as Task 2. Nothing reaches the ledger unreviewed.

- **Preview before commit.** Show what will be created, with the Task 1 record kind and Task 6 attribution assigned and editable in bulk. An import that silently creates 400 records with the wrong attribution in a couples app is a genuine mess to unwind by hand.
- **Deduplicate.** Re-importing an overlapping date range is the most common thing users do. Hash date + amount + normalised description into a stable content key and flag probable duplicates in the preview, defaulting to skip. Reuse the SHA-256 approach already proven in SiteShrimp.
- **Tag every record with an `import_batch_id`** and offer a one-action rollback of the whole batch. Cheap to build now, and the difference between a recoverable mistake and a support conversation.
- Categorisation is a suggestion. Map obvious merchant patterns to categories, mark them low-confidence, and let the user bulk-correct in the preview.

### 10.3 Nothing from a bank file goes to a model

CSV parsing is deterministic and needs no AI. A bank statement is the most sensitive file a user owns — full merchant history, balances, account identifiers. **Do not send file contents to any model, including the user's own key, and including for column mapping.** Column mapping is a UI problem, not an inference problem.

If merchant-to-category suggestion ever wants a model, that's a separate decision with its own consent, not a quiet extension of this feature.

### 10.4 Photo import — deferred with Task 2

Bulk photo capture reuses the Task 2 extraction pipeline. **Do not build a second extraction path.** The only differences are volume and flow:

- Bulk selection from camera roll or folder, into a processing queue
- **Throttle the queue.** Free-tier model quotas will be hit by a user importing 40 receipts at once. Process serially with backoff, show progress, and support pause and resume across a page reload.
- Review all extractions together in one preview, sharing the Task 2 pending-and-confirm model and the 10.2 preview screen.
- Downscale before processing, per Task 2.

Specify this alongside the Task 2 spec. Do not implement it earlier.

---

## Task 2 — Receipt line-item extraction

**Goal:** capture every line item on a receipt, not just a single total plus tax.

**Do not build this yet.** Produce a written spec covering the sections below, then stop for review.

### Architecture — no server-side Python OCR

Rejected: DOM Cloud shared hosting plus Tesseract binaries plus per-request memory is a poor fit for the thin-server architecture, and Tesseract on faded thermal paper is mediocre regardless of where it runs. The fat-client principle applies here too.

**Tiered approach, all cost-free to the user:**

1. **Primary — VLM on the user's own key.** Gemini Flash's free tier extracts receipt line items well and returns structured JSON directly, removing the parse layer entirely. Reuse the BYO-key pattern already proven in SiteShrimp.
2. **Private tier — local Ollama** with a vision model (Qwen2.5-VL or MiniCPM-V). Desktop-only, and it's the answer for users who won't send household receipts to Google. This tier is a requirement, not a nice-to-have.
3. **Fallback — `tesseract.js`**, client-side WASM. Won't reliably produce line items, but usually captures the total, so offline capture still works.

### Malaysian receipt specifics

- **SST lines are inconsistent across merchants** — sometimes a line item, sometimes a footer, sometimes absent, sometimes inclusive in displayed prices. Handle all four.
- **5-sen rounding means line items legitimately will not sum to the total.** This is correct behaviour, not an error.
- Reconciliation check: `sum(items) + tax + rounding == total`, tolerance **±0.05**. On mismatch, flag for user review — never silently accept, and never silently reject.

### The governing rule

**Extraction produces a proposal, never truth.** Items land in a pending state with per-field confidence and are confirmed by the user before anything reaches the ledger. A 30-item grocery receipt that silently mis-parses two items is worse than no extraction at all — the user trusts it and stops checking.

Surface low-confidence fields visually so review effort concentrates where it's needed.

### Image handling

Downscale client-side before upload: **1600px long edge, JPEG q0.8** — roughly 250KB, still readable for OCR. Receipt images will otherwise dominate PocketBase storage far faster than transaction data ever will. Keep the downscaled version as the stored original; do not upload the raw camera file.

### Open decisions — resolve before coding

1. **Does a receipt produce one categorised transaction with itemised detail attached, or can individual items carry their own categories?** Per-item categorisation is where the real analytical value sits for a household app — a supermarket trip is groceries *and* household *and* a bottle of wine. But it's a lot of taps unless items auto-categorise and the user only corrects outliers. This decision determines the data model; everything else waits on it.
2. How do line items interact with the Task 1 record kinds? Presumably all `outflow`, but a receipt with a refund line breaks that.
3. Does H-Score consume line-item detail, or only the transaction total? If the former, that's a separate spec.

---

## Definition of done (Tasks 5, 3, 4, 1, 6, 7, 8, 9, 10, 11)

- All four nav destinations reachable at 320px and above, verified on resize as well as fresh load
- No microphone permission prompt fires anywhere in the app
- Attachments open, zoom, and rotate on both touch and pointer input
- Record type is identifiable in greyscale
- Individual-composition users see no attribution control and gain no extra taps
- Record privacy is enforced by PocketBase collection rules, verified by direct API call rather than through the UI
- A partner-to-partner transfer nets to zero at household level, and does not render as an outflow in the Sankey
- Every H-Score criterion can be tapped through to the records that produced it
- No criterion is named in a way a user can't interpret, in any supported language
- A savings transfer is not counted as income by any criterion
- A criterion low from missing data is visually distinct from one low from the user's finances
- Goal progress reconciles to linked records, with manual adjustments shown separately
- Every chart type renders at 0, 1, 2 and 200+ items without breaking, at 320px and above
- Dashboard edits go through the same editor component as Record, and recompute H-Score
- Switching language re-renders the current page immediately, chart labels included
- Each chart's name is defined in exactly one place, and identical on Dashboard, Gallery and demo
- Import works on iOS Safari with no folder-picker support
- A re-imported overlapping date range creates no duplicates
- An import batch can be rolled back in one action
- No bank file contents are sent to any model
- The demo shows the Graph Showcase with explanations, without login
- Ask Honey answers an affordability question with correct arithmetic and no model configured
- Every figure Honey states matches the H-Score page and the Dashboard for the same period
- Partner B cannot obtain partner A's private records by asking Honey
- The demo renders all seven chart types with no empty states
- Existing records load and display correctly after migration, with migrated attribution marked as default rather than asserted
- No new server-side dependencies
- H-Score output unchanged for unchanged input data, except where Task 8 identifies an existing bug — which is reported, not silently fixed
- Existing records load and display correctly after migration, with migrated attribution marked as default rather than asserted
- No new server-side dependencies
- H-Score output unchanged for unchanged input data
