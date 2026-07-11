# Pitch-deck slide design — rules + checklist (cited)

Grounding for the **pitch-deck** skill. What makes a deck read as *professional* to judges scoring a
presentation axis.

## Design rules (with numbers)
- **One idea per slide, one image per idea.** Multiple ideas per slide destroy readability/retention.
  [Qubit](https://qubit.capital/blog/pitch-deck-design-principles) · Kawasaki
- **Minimum 30-pt font (Kawasaki floor); prefer ≥50px for the big room.** Also forces you off
  text-heavy slides. [Kawasaki](https://guykawasaki.com/the-only-10-slides-you-need-in-your-pitch/) ·
  [Qubit](https://qubit.capital/blog/pitch-deck-ideal-slide-count)
- **YC's three principles: Legibility, Simplicity, Obviousness** — a judge grasps each slide's point in
  seconds without narration. [YC](https://www.ycombinator.com/library/4T-how-to-design-a-better-pitch-deck)
- **Body text = short phrases, not sentences; visuals carry the message.** Stops judges reading ahead
  and stops you reading the slide verbatim. [Kawasaki](https://guykawasaki.com/the-only-10-slides-you-need-in-your-pitch/)
- **One consistent template:** white space, contrast, alignment, hierarchy — consistency signals
  competence (a trust proxy judges score). [Qubit](https://qubit.capital/blog/pitch-deck-design-principles) ·
  [Finis](https://finisstudio.com/guidelines-for-designing-a-professional-pitch-deck/)
- **Build the market slide bottom-up, not "$Xbn × 1%."** Top-down TAM reads as lazy; per-customer
  buildup reads as rigor. [PitchDeckGuide](https://pitchdeckguide.com/the-9-pitch-deck-mistakes-that-are-killing-your-investor-meetings-with-fixes/)

## HoneyMoney-specific design moves
- **Show the product.** Embed 2–4 real screenshots from `docs/deck/graph_gallery/` (Sankey, dashboard,
  Honey insight, one persona) — a fintech deck with zero product visuals underperforms. Keep UI large
  and legible.
- **Replace adjective-KPIs with real figures.** The current deck's KPI tiles say `~100%`, `Staff`,
  `Open` — swap for market size, price/seat, gross margin, timeline, user-pain stat.
- **Keep the honey/green system + the `criterion` badge** already in `PITCH_DECK.html` — but strengthen
  hierarchy: one hero element per slide, more white space, fewer identical two-column bullet cards.
- **Vary layouts.** Not every slide should be title + two cards. Use a full-bleed screenshot slide, a
  matrix slide (competition), a big-number slide (market/traction), a chart slide (financials via the
  `dataviz` skill).
- **Print fidelity:** the deck is A4-landscape print-to-PDF (`@page`); one `.slide` = one page. After
  edits, re-export and check nothing clips or overflows a page.

## Slide-design checklist
- [ ] One claim per slide, stated in the title
- [ ] ≥30pt body / large headline; short phrases not sentences
- [ ] Legible, Simple, Obvious in <5 seconds without narration
- [ ] A visual (screenshot/chart/matrix) on every key slide — not all-text
- [ ] Consistent template, white space, alignment, hierarchy
- [ ] Real numbers, not adjective-KPIs; market slide is bottom-up
- [ ] Each slide shows its rubric `criterion` badge
- [ ] Product visuals embedded from the gallery, legible
- [ ] Re-exported to PDF; no clipped/overflowing pages
