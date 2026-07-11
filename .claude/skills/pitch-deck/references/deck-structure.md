# Pitch-deck structure — canonical sequence + HoneyMoney plan (cited)

Grounding for the **pitch-deck** skill. MAIC context (from [maicnexus.com](https://maicnexus.com/en)):
Track **T3** = "Fintech, risk modelling, fraud detection, capital-markets AI, **inclusive finance**."
Three stages — Preliminary (online material review, ~300→100), Semi-Final (live demos in KL, 100→10),
Grand Final (KL, 10→top 3; judged "is this team investable and the product ready to commercialise?").
Prizes **RM200k / 100k / 50k** + 5×RM5k specials. Submissions: pitch deck + project summary + AI
disclosure (demo video + artifact optional).

## Canonical sequence (industry consensus: Sequoia · YC · Kawasaki)
**Title → Problem → Solution → Why Now → Market Size → Product/Demo → Business Model → Traction →
Competition → Team → Financials → Ask.** Each slide = one claim + its evidence; the deck reads as an
*argument*, not a slideshow. [Sequoia](https://pitchbuilder.io/blogs/news/what-is-the-sequoia-pitch-deck-model) ·
[YC seed deck](https://www.ycombinator.com/library/2u-how-to-build-your-seed-round-pitch-deck) ·
[Kawasaki 10/20/30](https://guykawasaki.com/the-only-10-slides-you-need-in-your-pitch/)

Rules:
- **Open with a one-line Company Purpose right after the title** ("HoneyMoney is [AI financial-wellness]
  for [Malaysian households]"). A single declarative sentence beats a mission paragraph. [Sequoia](https://easyvc.ai/blog/sequoia-capital-pitch-deck-template/)
- **Include a dedicated "Why Now" slide** — the inflection (cheap LLM inference + Malaysia's e-wallet /
  open-finance penetration) that makes this possible today, framed as a *moment of change*, not a
  trend. [Sequoia](https://pitchbuilder.io/blogs/news/what-is-the-sequoia-pitch-deck-model)
- **Presented deck ~10–12 slides; readable/submission deck 15–19 pages** — MAIC sets no max, so keep
  the live narrative tight and push depth into appendix slides. [Kawasaki](https://guykawasaki.com/the-only-10-slides-you-need-in-your-pitch/) ·
  [DocSend/PitchGrade](https://pitchgrade.com/blog/what-investors-read-pitch-deck-docsend-data)
- **Every slide makes one claim and supplies its evidence** — a slide with no claim is filler. [Sequoia](https://vcbeast.com/sequoia-capital-pitch-deck-template)

## HoneyMoney slide plan (target — 15 judge-facing slides)
Each slide: the one job it must do → the rubric criterion it targets. (Full rubric evidence in
`rubric-map.md`.)
1. **Title / Purpose** — "HoneyMoney is AI financial-wellness for Malaysian households." → framing.
2. **Problem** — one *named* person's money pain (e.g. "Aisyah can't raise RM1,000") + 1 hard local
   stat. → **Relevance (20)**.
3. **Solution** — the 3-bucket "transparency + autonomy" way the user wins (user = hero, 3 steps). →
   Relevance/Technical.
4. **Why Now** — LLM cost collapse + Malaysian e-wallet/open-finance inflection. → Scalability/Relevance.
5. **Product / Demo** — show it working (embed real `graph_gallery` screenshots); minimal text. →
   **Technical (25)**.
6. **Underlying Magic (AI + knowledge graph)** — how it works, why it's feasible *today*, multi-provider
   reliability + cost ledger. → **Technical (25)**.
7. **Market Size** — **bottom-up** TAM/SAM/SOM from real per-user economics (never top-down "$Xbn×1%").
   → **Commercial (25)**.
8. **Business Model** — B2B2C: free for households, employers sponsor seats; **price per seat + gross
   margin + unit economics**. → **Commercial (25)**.
9. **Traction / Status** — live product, honest build history, pipeline (LOI target). Pre-traction is
   fine — present it professionally, no fabrication. → **Commercial (25)** (high-attention slide).
10. **Competition** — "why users choose us, not them" in one line + a positioning matrix — *not* a
    self-serving feature checklist, and *never* "we have no competitors." → Commercial/Technical.
11. **Go-to-Market / Scalability** — one engine → 3 personas; multi-language/market; low marginal AI
    cost. → **Scalability (15)**.
12. **ESG / National Impact** — SDG 1/8/10 + Ekonomi MADANI + a **quantified** inclusion KPI. → **ESG (15)**.
13. **Team** — why THIS team wins (highest attention-time slide — make it strong; Malaysian citizen
    flagged for the T3 gate). → credibility across all.
14. **Financials** — projections + the milestones the money buys. → **Commercial (25)**.
15. **Ask + rubric echo** — specific ask (amount, use, milestone, timeline) + one-line recap across all
    five axes. → all.

> The current deck (12 slides) is missing #4, #7, #10, #14 and merges/wastes a slide on demo-production
> notes (cut it — that belongs in `demo-video`). Team + Traction + Financials get the most judge
> attention-seconds (§ `rubric-map.md`) — do not leave them thin.
