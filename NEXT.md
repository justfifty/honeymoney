# NEXT.md — HoneyMoney Competition Action Plan

**Target:** MAIC Nexus Challenge 2026 · Track **T3 — Financial Services / Fintech**
**Goal:** Reach Grand Final (Nov 2026) and win. This file is the living to-do board. `PLAN.md` is the full manual.

---

## ✅ Shipped — 2026-07-10 (live app + accounts + admin analytics)

**The app is LIVE at https://honeymoney.app** — served local-first from the team PC
via a named Cloudflare Tunnel (own everything, RM 0; PocketBase + data stay local).
See `DEPLOY.md` + `deploy/` (start/stop scripts, logon auto-start task, `secrets/deploy-credentials.md`).

- [x] **Custom domain** honeymoney.app (Cloudflare Registrar) → tunnel → app; auto-HTTPS, Singapore edge.
- [x] **Time-schedule records viewer** `/records` — spending audit by day/week/month, date ranges, currency-aware.
- [x] **User accounts + roles** — PocketBase `app_users` auth (user | admin); `/login`, `/signup`; seeded admin login.
- [x] **Admin analytics** `/admin` (admin-gated) — total/unique visits, top pages + durations, countries, visitor IPs, recent visits; first-party tracking (`/api/track`, Cloudflare edge IP/country).
- [x] **Cost monitoring** — `costs` ledger (seeded domain buy USD 15.48) + AI dev-token spend (est.), totalled in `/admin`.
- [x] **AI token ledger** — every AI call logged to `ai_usage`; JSON export at `/api/usage`.
- [x] **Multi-provider AI** — Groq · Gemini Flash · Ollama via `AI_PROVIDER`; agentic check at `/api/ai/check`. Setup + login links: `docs/AI_SETUP.md`.
- [x] **Real-app shell** — global header (nav + auth state) + footer across all pages.

> Reminder: the PC must stay on/awake for the public URL to be reachable (local-first).
> To shed the PC dependency later: a ~USD 4/mo Singapore VPS runs the identical stack.

---

## ✅ Shipped — 2026-07-10 (evening) — MAIC submission pack ready

All three **mandatory** documents are generated as upload-ready PDFs in `docs/deck/`,
plus recommended extras. Registration guide + team profiles filled — **one blank left:
Chua's 12-digit MyKad number.**

- [x] **Pitch deck** — `docs/deck/HoneyMoney_Pitch_Deck_MAIC2026.pdf` (12 slides, one per criterion; plain-English rewrite; source `PITCH_DECK.html`).
- [x] **Project summary** — `docs/deck/HoneyMoney_Project_Summary_MAIC2026.pdf` (source `PROJECT_SUMMARY.html`).
- [x] **AI disclosure** — `docs/deck/HoneyMoney_AI_Disclosure_MAIC2026.pdf` (stack corrected to PocketBase local-first + multi-provider AI).
- [x] **Demo video** — `docs/deck/HoneyMoney_Demo_MAIC2026.mp4` (35s auto-generated explainer from real app screenshots) + `docs/deck/DEMO_SCRIPT.md` (full 3-min shot list).
- [x] **Knowledge-graph gallery** — `docs/deck/graph_gallery/` (14 screenshots: 6 views · People/Vendor/Category lenses · 3 personas) + README mapping each to the rubric.
- [x] **Registration guide** — `docs/REGISTRATION.md`, verified against the live MAIC portal (6-step flow; team 1–5; **team leader need not be Malaysian**; no slide cap; deck+summary+AI-disclosure mandatory).
- [x] **Team profiles** — Chua Kia Wah (Team Leader / Business Lead, **Malaysian, MyKad**) + Pong Woon Wei (Tech Lead, SG). ⬜ Chua's MyKad number is the only outstanding field.
- [x] **Shareable learn page** (Artifact) — 2-min walkthrough with the demo video embedded (for sending to teammates/judges).

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

- [~] **Malaysian citizen on team.** Member = **Chua Kia Wah** (Malaysian, MyKad); satisfies the gate. ⬜ Only his **12-digit MyKad number** is still needed (enter on the portal). Pong is Singaporean — fine, team leader need not be Malaysian.
- [x] **Real commit history.** Pushed to `justfifty/honeymoney` and committing daily (real, non-backdated). Never backdate.
- [x] **AI disclosure.** Ready — `docs/AI_DISCLOSURE.md` + PDF. Honest: AI is *optional* & multi-provider; on-device OCR (tesseract.js) + voice (browser) use no tokens; coding is AI-assisted.
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
- [x] **Pitch deck** (PDF) — `docs/deck/HoneyMoney_Pitch_Deck_MAIC2026.pdf`, one slide per criterion, plain-English. `[1][2][3][4][5]`
- [x] **Project summary** (PDF) — `docs/deck/HoneyMoney_Project_Summary_MAIC2026.pdf`. `[2][3]`
- [x] **AI disclosure statement** (PDF) — `docs/deck/HoneyMoney_AI_Disclosure_MAIC2026.pdf` (+ `docs/AI_DISCLOSURE.md`). *mandatory*

### Recommended (treat as required — top 100 all submit these)
- [x] **Demo video** — `docs/deck/HoneyMoney_Demo_MAIC2026.mp4` (35s auto explainer; full 3-min shot list in `DEMO_SCRIPT.md`). `[1]`
- [x] **Artifact link** — GitHub repo `justfifty/honeymoney` + live URL honeymoney.app. `[1][4]`
- [~] **Member profiles** — filled in `docs/REGISTRATION.md §8`, Chua flagged Malaysian. ⬜ MyKad number pending. *eligibility*

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

### Three personas + realistic data — built P1.6 `[Scalability][Relevance]`
- [x] **Third persona** — a **solo freelancer + shop owner** (Aisha, household-of-one, 5 income streams) completes personal → family → business. A **persona switcher** in the header.
- [x] **Realistic Malaysian finance** seeded: **EPF/SOCSO/EIS, income tax (PCB), insurance**, and a full **Bills & Subscriptions** bucket (TNB, Unifi, mobile, Astro, **AI subscription**, water, device installment, **credit-card late fee**), plus **multi-stream income** for household + café.

### UX, capture & reach — built P1.6 `[Technical][ESG][Relevance]`
- [x] **Flexible in-app input** (`/api/graph` + `FlexibleInput`) — add income / bucket / allocation / spend for any person, with subject-matter tags.
- [x] **No-token capture** — 🎤 voice (browser Speech API) + 📷 receipt scan (tesseract.js), on-device, **no AI tokens** (answers the PDPA/data-residency + RM-0 story). Parser handles EN + Malay.
- [x] **Multi-language** — EN + Bahasa Melayu complete; Chinese/Tamil/Hindi core, graceful English fallback; language switcher (`?lang=`).
- [x] **Multi-currency** — display + capture in MYR · SGD · THB · CNY · HKD · TWD · JPY · USD · GBP (converts from MYR base; capture normalizes back). *(Rates are indicative — wire a live FX source before real use.)*
- [x] **Mobile-first + installable PWA** (never forced) — manifest, icon, theme-color, responsive.
- [x] **In-app `/guide`** — how-to + privacy promise + disclaimer (`docs/DISCLAIMER.md`).

### Public showcase — hosting + onboarding (decided; see `DEPLOY.md`) `[Technical][Commercial]`
- Decision: **hosted PocketBase + Vercel** (no code change — app is env-driven) and **anonymous showcase → optional sign-up** (don't gate browsing behind an account).
- [x] **Production build verified** (`next build` green — 13 routes) → confirmed Vercel-ready.
- [x] **Reproducible PocketBase container** — `pocketbase/Dockerfile` + `fly.toml` (pins v0.39.6, bakes migrations, seeds all 3 personas on boot).
- [~] **Interim public URL live** via Cloudflare quick tunnel (temporary — needs the PC on). For a permanent URL: the 3 steps below.
- [ ] Host PocketBase (Fly.io via the Dockerfile, or PocketHost) → get an `https` `POCKETBASE_URL`.
- [ ] Import repo to Vercel (root = `web/`), set env vars, deploy → free `.vercel.app` URL (**first cut**). Buy + attach a domain later (2-min, no redeploy).
- [ ] Handle the shared-sandbox problem before wide sharing: nightly reseed **or** guard demo-tenant mutations **or** ephemeral per-visitor tenant.
- [ ] Telegram bot live (@BotFather + webhook) — the lowest-friction acquisition channel ("forward one receipt").
- [ ] Play Store later via TWA (PWA is ready) — needs the permanent URL + PNG icons + a $25 Play account. PWA "Add to Home Screen" already works with zero fees.
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

> Full competitor + demand-driver research: **`docs/MARKET_STRATEGY.md`** (7-agent sweep; figures flagged for primary re-check before the deck).

- Key finding: **no incumbent occupies our cell** — Malaysia + envelope + couples + AI + cross-e-wallet. The couples category is a graveyard; "marital harmony" is an **unclaimed brand**.
- GTM reality: in Malaysia, EWA is **employee-pays / employer-pays-nothing** (Paywatch RM2/withdrawal) — the UK employer-PEPM model hasn't crossed over. **Lead free/consumer + sponsor-subsidized.** **MLM distribution = credibility red flag** for a salary-data product → use **family-referral (built-in K-factor) + B2B**.
- Funding: **Cradle CIP Spark (RM150k, non-dilutive)** is the realistic entry; **MD status** for tax; VC/Khazanah are indirect/later.
- Market priority (for i18n/currency + expansion): **Tier 1** Malaysia → Indonesia, **Thailand (฿)**, Philippines, Vietnam; **Tier 2** **Singapore (S$)**, **Hong Kong / Taiwan** (addressable — no super-app monopoly), India; **Tier 3 (park)** mainland China, Japan (super-app/cash-culture walls), US/UK (crowded but the marital-brand angle resonates in the US).
- [ ] Unit economics one-pager: per-seat price × seats, ~100% gross margin on free-tier infra, CAC via HR channel.
- [ ] TAM/SAM/SOM for Malaysian household + employee-wellness market.
- [ ] Outreach list: 10 Malaysian SME/HR contacts → send LOI template this week.
- [ ] Pricing model draft (per-employee/month, tiered).

## 6. Relevance + Impact tracks `[20% + 15%]`
- [ ] T3 keyword pass on deck: inclusive finance, risk modelling, alternative-data credit.
- [ ] Local grounding: TNG/MAE/GrabPay/ShopeePay, PDPA compliance note, BNM inclusion agenda.
- [ ] Impact quantification: 9 lost productive days/employee → national productivity; underbanked reach; SDG 1/3/8 mapping.

## 6.5 Research-backed product backlog (features to differentiate)

From `docs/MARKET_STRATEGY.md` — most are **native to the graph**, so cheaper for us than for incumbents. **Recommended top 3 to build next** (highest differentiation × lowest effort):

1. [ ] **Couples hide/share toggles** (Honeydue) — flag any wallet/vendor node shared-vs-private between partners; + **"mine/theirs/ours"** views (Monarch). *The wedge nobody owns.*
2. [ ] **Round-ups → Future Shield** (Raiz) — round each captured spend up, sweep the difference to savings.
3. [ ] **Goal countdown / ETA** (StashAway) — "House Deposit in ~14 months at this pace" from existing goal target/current.

Further backlog: waste/penalty & subscription radar (Rocket Money) · safe-to-spend-today (EWA anxiety, no lending) · net-worth via the unused `asset` node kind (Maybe) · auto-categorization rules (Firefly/Actual) · invite-a-partner referral loop · **name & brand the 3-bucket method** (à la YNAB's "Four Rules") · daily-yield nudge that refers to Versa/KDI (don't hold funds).

---

## 7. This week (do now)
1. [x] **`git push`** — done; committing daily to `justfifty/honeymoney` (real, non-backdated history). ✅
2. [~] Malaysian-citizen member = **Chua Kia Wah** (confirmed). ⬜ Still need his **MyKad number** on the portal. *(last eligibility field)*
3. [ ] **Register on the MAIC portal** — the full submission pack (deck/summary/AI-disclosure PDFs + video + repo + profiles) is ready; see `docs/REGISTRATION.md`. Enter Chua's MyKad + IDs directly on the form.
4. [ ] **First cut deploy** — Fly PocketBase (via `pocketbase/Dockerfile`) + Vercel (root `web/`) → free `.vercel.app` URL. Build is already verified green. Buy a domain after.
5. [ ] Get a Gemini API key (AI Studio free tier); test `/api/parse` with a real screenshot. *(App runs fine without it — on-device capture already works token-free.)*
6. [ ] Draft the LOI + send to first 3 HR contacts.
7. [ ] Record a 60-sec demo of the `/graph` gallery — persona switcher (personal→family→business), Focus lens, 💱 currency, 🌐 language, ➕ add via speak/scan.
8. [ ] Pick the next build: **research-backed top-3** (§6.5 — couples toggles / round-ups / goal ETA) vs **translation expansion** (landing + dashboard) vs **P3 cashflow statement**. Recommend the couples toggles (biggest differentiation).

_Last updated: 2026-07-10_
