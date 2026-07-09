# NEXT.md — HoneyMoney Competition Action Plan

**Target:** MAIC Nexus Challenge 2026 · Track **T3 — Financial Services / Fintech**
**Goal:** Reach Grand Final (Nov 2026) and win. This file is the living to-do board. `PLAN.md` is the full manual.

---

## 0. The rubric drives everything

Every submission is scored 1–10 by three independent judges on five weighted criteria:

| # | Criterion | Weight | What we must prove |
|---|-----------|:---:|--------------------|
| 1 | **Technical Feasibility** | 25% | A working artifact: Telegram → OCR → graph → Honey insight, running. |
| 2 | **Commercial Viability** | 25% | B2B2C unit economics + at least one signed corporate LOI. |
| 3 | **Industry Relevance** | 20% | T3 fit: inclusive finance, alternative credit scoring, local (TNG/MAE/PDPA). |
| 4 | **Scalability** | 15% | One graph engine serves household → business; multi-tenant, zero-cost stack. |
| 5 | **ESG / National Impact** | 15% | Financial resilience, workplace wellbeing, SDG 1/3/8, MADANI alignment. |

> **Strategic rule:** 75% of the score is *not* technical. Win by having **no weak dimension**, not by maxing the graph. Rebalance effort toward Commercial (25%) and ESG/National (15%).

---

## 1. Disqualifiers — check these FIRST (a fail here = instant out)

- [ ] **Malaysian citizen on team.** ≥1 member must be a MyKad holder. PRs / international students do **not** count. **Confirm today.**
- [ ] **Real commit history.** Artifact repo needs **≥3 commits over ≥2 calendar days**. Backdating commits is an explicit disqualifier — never do it. (We start real history now.)
- [ ] **AI disclosure.** Mandatory statement; this app is AI-native — disclose Gemini + AI-assisted coding honestly. See `docs/AI_DISCLOSURE.md` (to write).
- [ ] **Track locked at submission.** Commit to T3, no hedging.
- [ ] **One person = one team.** No cross-team participation.

---

## 2. Timeline (we are inside the application window)

| Stage | When | Gate | Our deadline |
|-------|------|------|--------------|
| **Application** | Jun–Aug 2026 | 300 teams accepted | Submit deck + summary + AI disclosure + repo link by **15 Aug 2026** |
| **Preliminary** | Sep 2026 | online review → 100 | Working artifact solid by **31 Aug 2026** |
| **Semi-Final** | Oct 2026 | live demos in KL → 10 | Rehearsed 3-min live demo + 1 signed LOI |
| **Grand Final** | Nov 2026 | forum + gala + awards | Full pitch, pilot traction |

Prizes: Champion RM 200K cash + RM 100K equity + HATI incubation · 1st RU RM 100K · 2nd RU RM 50K · 5 category awards RM 5K · all teams get AWS credits + architect 1:1.

---

## 3. Deliverables checklist (mapped to rubric dimension)

### Mandatory submission set
- [ ] **Pitch deck** (`docs/deck/`) — slide-by-slide mapped to the 5 criteria (outline in `PLAN.md §9`). `[1][2][3][4][5]`
- [ ] **Project summary** (1–2 pages) — problem, solution, traction, ask. `[2][3]`
- [ ] **AI disclosure statement** (`docs/AI_DISCLOSURE.md`). *mandatory*

### Recommended (treat as required — top 100 all submit these)
- [ ] **Demo video** (≤3 min) — Telegram screenshot → parsed txn → Honey insight → dashboard. `[1]`
- [ ] **Artifact link** — this GitHub repo, live Vercel URL. `[1][4]`
- [ ] **Member profiles** — roles, the Malaysian citizen flagged. *eligibility*

### Traction (highest ROI for Commercial score)
- [ ] **≥1 signed corporate LOI** — Malaysian SME/HR agrees to pilot as an employee wellness benefit. Template in `docs/LOI_TEMPLATE.md`. `[2]`
- [ ] Alternative credit-scoring narrative — graph-path-consistency reliability metric. `[3]`

---

## 4. Build status — the working artifact `[Technical Feasibility]`

**Architecture (locked, local-first):** Next.js 16 + **PocketBase** (local knowledge graph, free) + Gemini (REST, multimodal) + Telegram bot. Data stays on the team's machine; the identical Postgres schema in `supabase/` is the optional cloud-scale path. See `PLAN.md §4–6`.

- [x] Repo scaffolded (Next.js App Router, TS, Tailwind)
- [x] **Knowledge-graph schema** — `pocketbase/pb_migrations/` (tenants, members, nodes, edges, transactions, channel_links; auto-applied) + Postgres twin in `supabase/`
- [x] Demo seed — household **and** business tenants, auto-loaded on first `pb:start`
- [x] Gemini OCR + Honey insight (REST) — `web/src/lib/gemini.ts`
- [x] Graph ingest service — `web/src/lib/graph.ts` (PocketBase)
- [x] Projection / insight engine — `web/src/lib/projection.ts` (TS allocation walk)
- [x] Telegram webhook route — `web/src/app/api/telegram/webhook/route.ts`
- [x] Test parse route + insight route + health — `web/src/app/api/{parse,insight,health}/route.ts`
- [x] Dashboard (buckets, recent spend, Honey card) — `web/src/app/dashboard/page.tsx`
- [x] **End-to-end verified locally**: PB migrations → projection → dashboard → Honey insight (both tenants)
- [ ] Add a `GEMINI_API_KEY` + test `/api/parse` with a real TNG/MAE screenshot
- [ ] Register Telegram bot (@BotFather) + expose webhook via tunnel (`cloudflared`/`ngrok`) for the demo
- [ ] Curate 20 real TNG/MAE/GrabPay screenshots → measure OCR accuracy vs a golden set

### Monitoring & visualization layer — built P1.5 `[Technical][Scalability]`
- [x] **`/graph` gallery** — six views over one dataset: Sankey, Treemap, Tree, Organic network, Budget-vs-actual bars, Flow branch (`web/src/app/graph/`). Hand-rolled SVG, no chart library.
- [x] **Focus lens** — slice every view by income stream, bucket, vendor, category, or **person** (spend re-weighted to a member's transactions); one-click clear; graceful empty state (`web/src/lib/focusView.ts`).
- [x] **Editable roster** — add/remove people/staff inline; tenant-scoped, non-destructive to history (`api/members` + `PeopleMenu.tsx`).
- [x] **Persona-aware** categories & roles switch on `tenant.kind` (household ⇄ business); business staff seeded.
- [x] Monitoring headline (income / allocated / spent / unallocated), member attribution across ~4 months of history.

### Public showcase — hosting + onboarding (decided; see `DEPLOY.md`) `[Technical][Commercial]`
- Decision: **hosted PocketBase + Vercel** (no code change — app is env-driven) and **anonymous showcase → optional sign-up** (don't gate browsing behind an account).
- [ ] Host PocketBase (PocketHost or Fly.io w/ volume) → get an `https` `POCKETBASE_URL`.
- [ ] Import repo to Vercel (root = `web/`), set env vars, deploy → public URL.
- [ ] Handle the shared-sandbox problem before wide sharing: nightly reseed **or** guard demo-tenant mutations **or** ephemeral per-visitor tenant.
- [ ] Telegram bot live (@BotFather + webhook) — the lowest-friction acquisition channel ("forward one receipt").
- [ ] P3: optional sign-up via PocketBase auth (bind user→tenant; gate persist/Telegram only, never the showcase).

### Business tier — P3 (next, after semi-final polish) `[Scalability][Commercial]`
- [ ] **Departments / subject-matter tagging** (`props.department`) → auto-adds a Department focus dimension.
- [ ] **Cashflow statement** — monthly inflow / outflow / net + runway, from the multi-month history.
- [ ] **Reporting** — per-department / person / category roll-ups; CSV/PDF export for an accountant.
- [ ] **Graph-management CRUD** — add income/bucket/department, set allocations, edit goals/obligations from the UI.
- [ ] Corporate anonymized-aggregate roll-up (k-anonymity, P4).

> **Scope discipline:** the household demo is the pitch centrepiece — one killer graph insight ("your food velocity moves your Future Shield goal 6 weeks later"). The business tier is **now demonstrable** (persona-aware graph, staff roster, business seeds) but the P3 items above (cashflow, reporting, CRUD) stay a **narrated + partially-built roadmap** until after semi-finals. Don't let business scope dilute the household story judges score first.

---

## 5. Commercial track `[Commercial Viability — 25%]`
- [ ] Unit economics one-pager: per-seat price × seats, ~100% gross margin on free-tier infra, CAC via HR channel.
- [ ] TAM/SAM/SOM for Malaysian household + employee-wellness market.
- [ ] Outreach list: 10 Malaysian SME/HR contacts → send LOI template this week.
- [ ] Pricing model draft (per-employee/month, tiered).

## 6. Relevance + Impact tracks `[20% + 15%]`
- [ ] T3 keyword pass on deck: inclusive finance, risk modelling, alternative-data credit.
- [ ] Local grounding: TNG/MAE/GrabPay/ShopeePay, PDPA compliance note, BNM inclusion agenda.
- [ ] Impact quantification: 9 lost productive days/employee → national productivity; underbanked reach; SDG 1/3/8 mapping.

---

## 7. This week (do now)
1. [ ] Confirm Malaysian-citizen team member. *(blocker)*
2. [ ] Get a Gemini API key (AI Studio free tier); test `/api/parse` with a real screenshot.
3. [ ] Push repo to GitHub (private ok), keep committing real progress. *(the `/graph` + focus-lens + roster work is a strong, honest commit block)*
4. [ ] Draft the LOI + send to first 3 HR contacts.
5. [ ] Record a 60-sec screen capture of the `/graph` gallery + Focus lens (household → business) for the pitch — the scalability story now demos live, not just on a slide.
6. [ ] Decide P3 sequencing: **cashflow statement** first (highest business-demo value) vs **department tagging** (unlocks the most lens value). Recommend cashflow.

_Last updated: 2026-07-09_
