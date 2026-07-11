---
name: pitch-deck
description: >-
  Build, upgrade, and deliver HoneyMoney's competition pitch deck + 1-page project summary to
  professional standard for the MAIC Nexus Challenge 2026 (Track T3) — content structure, narrative
  arc, slide design, explicit mapping to the weighted judging rubric (Technical 25 · Commercial 25 ·
  Relevance 20 · Scalability 15 · ESG 15), and live-pitch delivery + Q&A prep. Produces/edits the
  real deck (docs/deck/PITCH_DECK.html + PROJECT_SUMMARY.html) and re-exports the PDFs. Use whenever
  creating, reviewing, professionalizing, or rehearsing the pitch. Triggers on: "pitch deck",
  "slides", "project summary", "make the deck professional", "deck review", "pitch", "presentation",
  "investor deck", "rubric mapping", "live pitch", "Q&A prep", "the ask".
---

# HoneyMoney — Pitch deck & live-pitch skill

Turn the deck from "readable" into **professional and point-scoring**: every slide does one job,
targets a named rubric criterion, shows the real product, and backs claims with numbers. Then coach
the live delivery. Honesty is a hard constraint — MAIC disqualifies fabrication.

## When to use
- Creating / rebuilding / reviewing the pitch deck or the 1-page project summary.
- Making the deck "professional level," fixing weak slides, adding missing ones.
- Preparing the live pitch (KL semi-final / final): timing, hook, hand-offs, Q&A.

## When NOT to use
- The demo *video* → use the **demo-video** skill.
- Money/legal copy accuracy → **finance-content** skill (reuse its verified numbers).
- In-app UI → **web-design** skill.

## Ground rules (non-negotiable)
1. **Honest or nothing.** No fake traction, fake customers, fake user counts, or backdated proof —
   these are MAIC disqualifiers and destroy credibility in Q&A. Label estimates as estimates and show
   the assumption. Pre-traction is fine; present it professionally (working product + pipeline).
2. **Every slide targets a rubric criterion** and says which (the deck already uses a `criterion`
   badge — keep it). Cover all five: Technical 25 · Commercial 25 · Relevance 20 · Scalability 15 ·
   ESG 15. Weight slide count/energy toward the 25s.
3. **Show the product, don't just describe it.** HoneyMoney has real screenshots in
   `docs/deck/graph_gallery/` — embed them. A fintech deck with zero product visuals underperforms.
4. **One idea per slide; numbers over adjectives.** Replace vague KPI words with real figures
   (market size, price per seat, cost, timeline). See `references/rubric-map.md`.
5. **Plain English stays** — MAIC rewards clarity/realism over buzzwords. Professional ≠ jargon.
   Elevate design and evidence, not vocabulary.

## What "professional level" means here (the gap to close)
Audit any HoneyMoney deck against these — the current deck is weak on the first four:
- **Market sizing slide** — TAM/SAM/SOM for Malaysian households + workforce, sourced & labelled.
- **Competition slide** — a positioning matrix vs budgeting apps / bank apps / spreadsheets; state
  the wedge (Malaysian couples across all e-wallets, transparency-with-autonomy).
- **Unit economics** — price per employer seat/month, gross margin, a simple LTV/CAC or payback line,
  and the RM0-cost stack as the margin story.
- **Product visuals** — embed 2–4 real gallery screenshots (Sankey, dashboard, Honey insight).
- **Sharper ask** — specific: RM grant target, # pilot employers wanted, named intros.
- **Tighter narrative** — cut production-note slides; every remaining slide is judge-facing.
- **Design polish** — consistent grid, real visual hierarchy, restrained text, one hero element/slide
  (see `references/deck-design.md`).

## Workflow (audit → restructure → design → export)
1. **Audit** the current deck slide-by-slide against `references/rubric-map.md` +
   `references/deck-design.md`. Output a table: slide → job → rubric target → verdict → fix.
2. **Restructure** to the recommended sequence (`references/deck-structure.md`): Title → Problem →
   Solution → Product/Demo → Market → Business model + unit economics → Competition → Traction/status
   → Scalability → ESG/impact → Team → Ask/close. Merge/cut redundant slides.
3. **Fill with evidence:** pull verified numbers from `finance-content` references + market data
   (cite). Embed gallery screenshots. Replace adjective-KPIs with figures.
4. **Design** in the existing `PITCH_DECK.html` (A4-landscape print-to-PDF template): keep the honey/
   green system but strengthen hierarchy, add an image/chart per key slide, cut word count. Mirror
   changes into `PROJECT_SUMMARY.html` (the 1-pager) and keep `AI_DISCLOSURE.html` in sync.
5. **Export** the three PDFs via the headless-Chrome commands in `docs/deck/README.md`; open to verify
   pagination (one `.slide` = one A4 page, nothing clipped).
6. **Rehearse** the live pitch with `references/live-pitch.md`: script to time, assign hand-offs,
   drill the Q&A bank.

## Files
| Artifact | File |
|---|---|
| Deck (12± slides) | `docs/deck/PITCH_DECK.html` → `HoneyMoney_Pitch_Deck_MAIC2026.pdf` |
| 1-page summary | `docs/deck/PROJECT_SUMMARY.html` → `..._Project_Summary_...pdf` |
| AI disclosure | `docs/deck/AI_DISCLOSURE.html` → `..._AI_Disclosure_...pdf` |
| Product screenshots | `docs/deck/graph_gallery/*.png` |
| Export commands | `docs/deck/README.md` |
| Rubric + deliverables | `PLAN.md` §15, `NEXT.md` |

## Reference files (load as needed)
- `references/deck-structure.md` — the canonical slide sequence + what each slide must contain
  (cited), and the HoneyMoney slide plan.
- `references/deck-design.md` — slide visual-design rules (one idea/slide, word/font floors, data-ink,
  using the gallery images) as a checklist.
- `references/rubric-map.md` — every MAIC criterion → which slide proves it → the evidence/number to
  put there. The scoring safety-net.
- `references/live-pitch.md` — delivery (timing, hook, hand-offs, nerves) + a HoneyMoney Q&A bank
  (moat, unit economics, regulation, why-now).

## Related skills
`demo-video` (the video) · `finance-content` (verified numbers + tone) · `web-design` /
`artifact-design` (visual craft) · `dataviz` (any chart on a slide).
