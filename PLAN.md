# PLAN.md — HoneyMoney Development Manual

> **HoneyMoney** — a dual-persona, AI-native financial wellness engine.
> *Funding transparency, spending autonomy.* Built for the **MAIC Nexus Challenge 2026, Track T3**.
> This document is the single source of truth for architecture, setup, and process. Task board lives in `NEXT.md`.

---

## Table of contents
1. [Product vision](#1-product-vision)
2. [Requirements](#2-requirements)
3. [Roadmap](#3-roadmap)
4. [System architecture](#4-system-architecture)
5. [The knowledge graph data model](#5-the-knowledge-graph-data-model)
6. [Data hosting & infrastructure](#6-data-hosting--infrastructure)
7. [Software dependencies](#7-software-dependencies)
8. [Configuration & required settings](#8-configuration--required-settings)
9. [Step-by-step: build & run locally](#9-step-by-step-build--run-locally)
10. [Step-by-step: how to use the app](#10-step-by-step-how-to-use-the-app)
11. [Deployment (zero-cost)](#11-deployment-zero-cost)
12. [Methods: how each subsystem works](#12-methods-how-each-subsystem-works)
13. [Scalability: household → business](#13-scalability-household--business)
14. [Security, privacy & compliance](#14-security-privacy--compliance)
15. [Deliverables & competition mapping](#15-deliverables--competition-mapping)

---

## 1. Product vision

Households in financial distress suffer marital friction and lost workplace productivity. Traditional budgeting apps feel like *surveillance*, demand tedious manual entry (→ ~80% month-1 churn), and store money as flat rows — so their AI can only say "you spent 15% more on food."

HoneyMoney does three things differently:

1. **3-Bucket "Funding Transparency, Spending Autonomy" model** — on payday, income splits top-down into:
   - **Bucket 1 — Fixed Non-Negotiables** (rent, utilities, education): hardcoded amounts, fully transparent.
   - **Bucket 2 — Future Shield** (10–20%): auto-routed to savings/wealth *before* any spending is tracked.
   - **Bucket 3 — Operational Independence Wallets** (TNG/MAE): capped personal pools where **tracking stops** — restoring autonomy and killing spousal friction.
2. **Zero-Integration data capture** — no fragile bank APIs. Users forward e-wallet/receipt **screenshots** to a Telegram bot; Gemini vision extracts vendor, amount, timestamp.
3. **Financial Knowledge Graph** — money is modelled as **nodes + edges** in Postgres, so the AI ("Honey") reasons over *structure* (how spending velocity threatens a future goal), not isolated rows.

Distribution is **B2B2C**: sold to corporate HR as an employee financial-wellness benefit; companies get anonymized aggregate workforce health data, employees get private household optimization.

### 1.1 One engine, three personas — *personal → family → business*

HoneyMoney is deliberately built so **the same knowledge-graph engine scales up the org chart** with no schema change — only labels, views, and aggregations differ. This is both the product's north star and the rubric's Scalability argument made literal:

| | **Personal** (1 person) | **Family** (a household) | **Business** (an SME) |
|---|---|---|---|
| Income | one salary/gig | multiple earners | revenue streams / departments |
| The 3 tiers | Needs · Save · Play | Needs & Fixed · Savings & Goals · Personal | Operating Costs · Reserves & Growth · Owner & Distributions |
| Roster (`members`) | you | spouses + children | staff, managers, contractors |
| Subject matters | tags on spend | shared vs private wallets | **departments / cost-centres / projects** |
| Goal / obligation | a holiday fund | house deposit, car loan | runway, tax reserve, supplier terms |
| Question it answers | "can I afford this?" | "is our goal still on track?" | "which department is bleeding cash, and what's our runway?" |

The tier tables above are **persona-aware in the running app today** (category names and roster roles switch on `tenant.kind`). "Departments" and "flexible subject matters" are the graph's real strength: because every node carries a JSON `props` bag, a *subject* (`Dine-in`, `Catering`, `Marketing`, `School`, `Ramadan`) is a **tag, not a table** — you can slice by any subject matter without a migration.

### 1.2 The monitoring layer — *see the money as structure, then focus it*

On top of the graph sits a **visualization gallery** (`/graph`) with six lenses on the identical data — Sankey money-flow, Treemap composition, hierarchical Tree, organic Network, Budget-vs-actual bars, and the branch Flow — plus a **Focus lens** that re-renders every view through one chosen slice: an income stream, an expense (bucket/vendor), a category, or a **person** (spend re-weighted to that member's transactions). This is how a family *or* a business reads the same graph: pick the subject that matters, and the whole picture narrows to it.

---

## 2. Requirements

### 2.1 Functional

**Capture & model (built)**
- Ingest a transaction from a forwarded screenshot (Telegram) → parse → store in graph.
- Model income → buckets → wallets → vendors/goals as a temporal graph.
- Project month-end position per bucket from allocation vs. spend velocity.
- "Honey" chat/insight: marital-safe, forward-looking guidance grounded in the graph.
- Dashboard: buckets, recent spend, Honey insight.
- Multi-tenant: households and businesses isolated by `tenant_id` + RLS.

**Monitoring & visualization (built)**
- `/graph` gallery: six views over one dataset — **Sankey** (income→bucket→spend/saved), **Treemap** (allocation area × status colour × spend fill), **Tree** (household/business → category → bucket → vendor), **Organic** network, **Budget-vs-actual** bars (shared RM scale), **Flow** branch.
- **Focus lens**: slice every view by income stream, bucket, vendor, category, or **person** (spend re-weighted to that member's transactions); one-click clear; graceful empty state.
- Persona-aware framing: category names and roster roles switch on `tenant.kind` (household vs business).

**Three personas (built)**
- One engine, three seeded personas: **personal** (Aisha, a solo freelancer + shop owner, household-of-one, 5 income streams), **family** (the Rahman household of four), **business** (a café with staff). A header **persona switcher** flips between them.
- Realistic Malaysian detail: gross salary + **EPF/SOCSO/EIS**, **income tax (PCB)**, **insurance**, itemised **Bills & Subscriptions** (utilities, broadband, TV, AI subscription, device instalments, credit-card penalty), multi-stream income, employer statutory + SST for the business.

**Input, capture & reach (built)**
- **Flexible in-app input** (`/api/graph` + `FlexibleInput`): add income / bucket / allocation / spend for any person, with a subject-matter tag (`props.subject`) — *the graph is now editable from the UI, no schema change*.
- **No-token capture**: 🎤 voice (browser Speech API) + 📷 receipt scan (tesseract.js) → prefill a spend, **on-device, no AI tokens** (parses EN + Malay). Gemini stays the optional premium path.
- **Multi-language**: EN + Bahasa Melayu complete; Chinese/Tamil/Hindi core with graceful English fallback; `?lang=` switcher (dependency-free, no routing refactor).
- **Multi-currency**: display + capture in MYR · SGD · THB · CNY · HKD · TWD · JPY · USD · GBP (converts from the MYR base; capture normalises back). *Rates are indicative — wire a live FX source before real use.*
- **Mobile-first + installable PWA** (never forced); **in-app `/guide`** with how-to + privacy + disclaimer (`docs/DISCLAIMER.md`).

**Roster & management (built)**
- Editable **roster** (`members`): add/remove people inline — a household grows with a newborn, a café with a hire; removing a person keeps their spend (relation nulled), never loses history.

**Business workflow (roadmap — P3)**
- **Departments** as first-class subject matters: per-department income, expenses, needs, and their own cashflow.
- **Cashflow statement**: monthly inflow / outflow / net + runway, from the multi-month transaction history.
- **Reporting**: per-department / per-person / per-category summaries; export (CSV/PDF); a corporate anonymized-aggregate roll-up (k-anonymity).

### 2.2 Non-functional
- **Cost:** RM 0/month at MVP/demo scale (Vercel + Supabase + Gemini free tiers).
- **Privacy:** PDPA-aware; row-level isolation; screenshots parsed then discarded (no long-term raw image storage).
- **Portability:** serverless, no permanent backend server.
- **Auditability:** real, non-backdated git history (competition rule).

### 2.3 Competition (see `NEXT.md`)
- ≥1 Malaysian citizen on team; ≥3 commits over ≥2 days; mandatory AI disclosure; T3 locked.

---

## 3. Roadmap

| Phase | Window | Outcome |
|-------|--------|---------|
| **P1 — MVP vertical slice** ✅ | Jul–Aug 2026 | Telegram → OCR → graph → Honey insight → dashboard. Knowledge-graph engine on local-first PocketBase; household + business seeds. Repo with real history. |
| **P1.5 — Monitoring layer** ✅ | Jul 2026 | Six-view visualization gallery; **Focus lens** (income/expense/category/person); editable roster; persona-aware categories & roles. |
| **P1.6 — Reach & realism** ✅ | Jul 2026 | Third persona (solo); realistic Malaysian finance data; flexible in-app input; no-token voice/scan capture; multi-language (EN+BM); multi-currency (9); mobile-first PWA; in-app guide/disclaimer. Competitive research → `docs/MARKET_STRATEGY.md`. |
| **P2 — Semi-final polish** | Aug–Oct 2026 | **First cut deploy** (Fly PocketBase + Vercel, `pocketbase/Dockerfile` — see `DEPLOY.md`); curated OCR ≥95% on a golden set; refined Honey persona; 3-min live demo; 1 signed corporate LOI; the top-3 differentiators (couples hide/share · round-ups · goal ETA — see `NEXT.md §6.5`). |
| **P3 — Business tier** | Oct–Nov 2026 | **Departments / subject-matter tagging** as a lens dimension; **cashflow statement** (in/out/net + runway); **reporting** (per-department/person/category + export); graph-management CRUD from the UI. |
| **P4 — B2B scalability** | Nov 2026+ | Multi-tenant corporate HR dashboard (anonymized k-anonymity aggregates); pilot onboarding; role-based access. |

---

## 4. System architecture

```
[ User ] --forward screenshot--> [ Telegram Bot ]
                                       |  (webhook POST)
                                       v
              [ Next.js API Route: /api/telegram/webhook ]  (Vercel serverless/edge)
                                       |
                 1. download image from Telegram file API
                 2. Gemini vision OCR  --> {vendor, amount, currency, timestamp, confidence}
                 3. write to graph (nodes/edges/transactions)
                                       |
                                       v
                     [ Supabase PostgreSQL — Knowledge Graph ]
                       tenants · members · nodes · edges · transactions · channel_links
                       RLS per tenant · bucket_projection() function
                                       |
                 4. bucket_projection() + recent spend --> context
                 5. Gemini text --> "Honey" marital-safe insight
                                       |
                                       v
                 [ Dashboard (Next.js RSC) ]  +  [ Telegram reply ]
```

Key principle: **the API routes are the whole backend.** No server to run or pay for.

---

## 5. The knowledge graph data model

Three concerns are kept separate: **the model (graph)**, **the events (transactions)**, and **time (temporal edges)**.

### Tables (`supabase/migrations/0001_init_graph.sql`)
- **`tenants`** — `kind: household | business`, base currency.
- **`members`** — people in a tenant, linked to `auth.users`.
- **`nodes`** — `kind: income_source | bucket | wallet | vendor | obligation | goal | asset | member`; flexible `props jsonb`.
- **`edges`** — typed relations with **flow semantics** promoted to typed columns for math/indexing and **temporal validity**:
  - `rel: FUNDS | ALLOCATES_PCT | ALLOCATES_FIXED | ROUTED_TO | SPENT_AT | OWES | CONTRIBUTES_TO | OWNS`
  - `amount`, `percentage`, `cadence`, `valid_from`, `valid_to` (null = active).
- **`transactions`** — raw events; each *attaches* to the `SPENT_AT` edge it realizes (events ≠ model). Stores `parse_confidence`, `source`, `receipt_ref` (not the raw image).
- **`channel_links`** — maps a Telegram/WhatsApp `external_id` → tenant/member (the zero-integration onboarding join).

### The projection function — the "predictive dependency parsing"
`bucket_projection(p_tenant uuid, p_as_of date)` runs a **recursive CTE** from `income_source` nodes, walks `ALLOCATES_*` edges (depth-guarded against cycles), sums allocation per bucket, computes month-to-date spend, extrapolates a **spend velocity** to month-end, and returns per bucket:
`allocated, mtd_spend, projected_spend, projected_balance, status ∈ {on_track, at_risk, over_budget, unfunded}`.

This single query is the demo's centerpiece: it turns "you spent more on food" into "at this velocity, your Future Shield goal slips 6 weeks."

### Why a graph (and why *not* a graph database)
At household scale (tens–hundreds of nodes/tenant) Postgres + recursive CTEs is more than enough. A dedicated graph DB (Neo4j) would break the RM 0 cost and add ops burden. We keep the graph as a **model + query layer inside Postgres**. Say "graph model," not "graph database."

---

## 6. Data hosting & infrastructure

| Concern | Service | Tier | Notes / limits |
|--------|---------|------|----------------|
| Database (default, local-first) | **PocketBase** | Free, self-contained | Single binary + SQLite in `pocketbase/pb_data/`. Data stays on the team's machine. Schema + demo seed are committed migrations (`pocketbase/pb_migrations/`) — auto-applied on first start. |
| Frontend + API | **Next.js** local (`npm run dev`) | Free | API routes are the whole backend. |
| AI (vision + text) | **Google Gemini** (AI Studio) | Free | Rate-limited (RPM/RPD) — batch, cache, and queue OCR. |
| Ingestion channel | **Telegram Bot API** | Free | No gatekeeper. *(WhatsApp Business API is paid + BSP-gated — Phase 3 only.)* Needs a public URL for the webhook — use a tunnel (e.g. `cloudflared`/`ngrok`) in local mode, or a deployed instance. |
| Source control / artifact | **GitHub** | Free | Judges' artifact link; real commit history. |
| Cloud-scale path (optional) | **Vercel + Supabase** | Free tiers | The same schema exists as Postgres SQL with RLS + recursive-CTE projection in `supabase/`. Switch when multi-device/cloud access is needed. |
| Future scale | **AWS** (MAIC credits) | Credits | For enterprise pilots. |

> **Local-first trade-off (deliberate):** the demo runs on a laptop — perfect for the KL live
> demo and PDPA story ("your data never leaves the household"). The Vercel-deployed dashboard
> cannot reach a laptop PocketBase; for a public URL either tunnel to it or move to the
> Supabase path. Both schemas are kept in lock-step by design.

> **Honest caveat:** "RM 0 for 1,000 profiles" is demo-scale. Gemini free-tier rate limits are the first ceiling; mitigate with a template/regex first-pass before spending a vision call, and treat OCR as a retryable queue.

---

## 7. Software dependencies

### Runtime / tooling
- **Node.js ≥ 20** (repo built on v22), **npm ≥ 10**
- **Git**
- **Supabase CLI** (optional, for `db push` / local) — https://supabase.com/docs/guides/cli
- A **Supabase** account, a **Google AI Studio** (Gemini) API key, a **Telegram** account (for @BotFather)

### App (in `web/package.json`)
- **next 16.2.10**, **react 19**, **react-dom 19** — App Router, React Server Components.
- **@supabase/supabase-js** — Postgres/Auth client (added for this MVP).
- **tailwindcss v4** + `@tailwindcss/postcss` — styling.
- **typescript 5**, **eslint 9**, `eslint-config-next`.

> Gemini is called via **REST (`fetch`)** — no SDK dependency, edge-safe, no version churn. See `web/src/lib/gemini.ts`.

### Legacy (not used by the competition MVP)
- `api/` holds an earlier **FastAPI + SQLite** prototype. It is **retained for reference only** and is *not* part of the serverless architecture or the pitch. Do not wire it in. It can be removed once the team is comfortable.

---

## 8. Configuration & required settings

Copy `.env.example` → `web/.env.local`. **Local-first defaults work unchanged.**

| Variable | Purpose | Default / where to get it |
|----------|---------|---------------------------|
| `POCKETBASE_URL` | Local database URL | `http://127.0.0.1:8090` (default) |
| `POCKETBASE_ADMIN_EMAIL` | Superuser the server authenticates as | `admin@honeymoney.local` (dev default) |
| `POCKETBASE_ADMIN_PASSWORD` | Its password | `honeymoney-local-dev` (dev default — change for anything shared) |
| `DEMO_TENANT_ID` | Tenant shown on the dashboard | `hhrahman1111111` (household) or `bizsedap2222222` (business) |
| `GEMINI_API_KEY` | Vision + text model (optional) | [AI Studio](https://aistudio.google.com/app/apikey) |
| `GEMINI_MODEL` | Model id | `gemini-2.0-flash` |
| `TELEGRAM_BOT_TOKEN` | Bot auth (optional) | @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Verifies inbound webhooks | you choose a random string |
| `NEXT_PUBLIC_SUPABASE_URL` etc. | Optional cloud-scale path only | Supabase → Project Settings → API |

PocketBase collections have no public API rules (superuser-only) — the browser never talks
to the database directly, only the Next.js server does. The app **degrades gracefully**:
if PocketBase/Gemini are not configured, the dashboard shows a setup state and routes
return a clear "not configured" response instead of crashing.

---

## 9. Step-by-step: build & run locally

```bash
# 0. prerequisites: Node >= 20, npm >= 10, git  (Windows & macOS both fine)
git clone https://github.com/justfifty/honeymoney.git && cd honeymoney

# 1. install web deps
cd web
npm install

# 2. configure env — the defaults already match the local database
cp ../.env.example .env.local
#    (optionally add GEMINI_API_KEY for OCR + AI insights)

# 3. database — PocketBase, fully automatic
npm run pb:download    # one-time: fetches the binary for your OS into pocketbase/
npm run pb:start       # terminal 1: creates superuser + applies schema + demo seed, then serves
#    admin UI: http://127.0.0.1:8090/_/  (login = the two POCKETBASE_ADMIN_* values)

# 4. run the app
npm run dev            # terminal 2: http://localhost:3000  (landing)  /dashboard (app)

# 5. test the parse pipeline without Telegram
#    POST an image to /api/parse (base64) — see §12.2 for the payload shape.

# 6. typecheck / build
npm run build
```

> Switching to the cloud path later? The identical schema lives in
> `supabase/migrations/0001_init_graph.sql` — see §6 and the git history for the
> Supabase-flavored lib layer.

---

## 10. Step-by-step: how to use the app

1. **Set up your household** (seed provides a demo one): income source (salary), Bucket 1 fixed items, Bucket 2 Future Shield %, Bucket 3 wallets.
2. **Link Telegram**: start the bot, which records your chat id → `channel_links` (maps you to your tenant).
3. **Forward a receipt**: screenshot a TNG/MAE/GrabPay payment and forward it to the bot.
4. **Auto-capture**: Gemini reads vendor + amount + time; a transaction is written and attached to the right wallet/bucket. The bot replies with a one-tap confirm.
5. **See the picture**: open `/dashboard` — buckets show `allocated → projected balance` with `on_track / at_risk / over_budget`.
6. **Ask Honey**: get a marital-safe, forward-looking insight ("Bucket 3 is fine; but grocery velocity is nudging your Future Shield goal later — want to rebalance RM120?").

Bucket 3 spending is **not itemized** by design — autonomy over surveillance.

---

## 11. Deployment (zero-cost)

```
Supabase project  ──►  run migration + seed
Vercel project    ──►  import GitHub repo, root = web/
                      set env vars (all of §8) in Vercel dashboard
                      deploy → https://<app>.vercel.app
Telegram          ──►  set webhook:
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://<app>.vercel.app/api/telegram/webhook" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

The webhook validates `X-Telegram-Bot-Api-Secret-Token` before processing.

---

## 12. Methods: how each subsystem works

### 12.1 Ingestion (Telegram)
`/api/telegram/webhook` verifies the secret header, extracts the largest photo, calls `getFile` then downloads from `https://api.telegram.org/file/bot<token>/<path>`, converts to base64, and passes it to the parser. Unknown chat ids get an onboarding reply.

### 12.2 OCR parsing (Gemini, REST)
`web/src/lib/gemini.ts::parseReceipt(base64, mimeType)` posts to `…/v1beta/models/<model>:generateContent` with the image as `inlineData` and a strict-JSON prompt. Output is validated into `{vendor, amount, currency, occurredAt, confidence}`. A cheap template/regex first-pass (Phase 2) can short-circuit known layouts before spending a vision call.

Manual test: `POST /api/parse` with `{ "imageBase64": "...", "mimeType": "image/jpeg", "tenantId": "<uuid>" }`.

### 12.3 Graph write
`web/src/lib/graph.ts::ingestReceipt()` finds-or-creates the vendor node, resolves the spending wallet/bucket, ensures a `SPENT_AT` edge, and inserts a `transactions` row (with `parse_confidence`, `source`, `raw`) attached to that edge.

### 12.4 Projection & Honey
`web/src/lib/projection.ts` calls the `bucket_projection` RPC + recent transactions, builds a compact context, and asks Gemini for the Honey insight. If Gemini is unconfigured it falls back to a deterministic rule-based message so the demo always works. `computeAllocations()` and `projectBuckets()` are exported so other read models can reuse the allocation walk with a different spend filter (e.g. one person's transactions).

### 12.5 Read models for visualization
Two server-only read models shape the graph for the `/graph` gallery, both dependency-free:
- `web/src/lib/moneyView.ts` — aggregates income, per-bucket allocation vs spend (with `tier`), vendor-level spend, and goals; also owns the persona-aware `CATEGORY_META` / `ROLE_OPTIONS`.
- `web/src/lib/focusView.ts` — the **focus engine**: one read, one focus applied. Structural focuses (income/bucket/vendor/category) compute a **directional flow-slice** (upstream funders + downstream spend); a **person** focus re-weights the spend maps to that member's transactions. Returns both the graph-view `{nodes, edges}` and money-view shapes so all six chart components consume filtered data unchanged.

### 12.6 The visualization gallery (`web/src/app/graph/`)
Every chart is hand-rolled SVG (no chart library), deterministic so server and client renders agree, with a per-mark hover layer. `SankeyFlow` stacks node heights and ribbon widths ∝ RM; `Treemap` is a squarified layout coloured by the reserved status palette; `TreeGraph` uses leaf-packing; `BudgetBars` shares one RM scale across buckets; `NetworkGraph` is a small deterministic force simulation; `Flow` is the column-branch view. Colour follows entity/status, never rank, and every mark is text-labelled (the accessible secondary encoding).

### 12.7 Roster management
`web/src/app/api/members/route.ts` (POST/DELETE) plus `PeopleMenu.tsx` let the roster grow and shrink inline. Deletes are tenant-scoped (a tenant can't remove another's people) and **non-destructive to history** — PocketBase nulls the `transactions.member` relation, so past spend survives as unattributed. Removal is a two-step confirm; each action shows its own pending state.

### 12.8 Flexible input & no-token capture
`web/src/app/api/graph/route.ts` is one endpoint for adding to the graph — income / bucket / allocation / spend — with a `props.subject` tag (flexibility without a schema change). `FlexibleInput.tsx` drives it; `SpendCapture.tsx` prefills a spend from **voice** (the browser's on-device Speech Recognition, mapped to en-MY/ms-MY/zh/ta/hi) or a **receipt scan** (`tesseract.js`, the WASM Tesseract, dynamically imported). Both run on-device with **no AI tokens** and parse `{vendor, amount}` from EN + Malay; Gemini stays the optional premium path.

### 12.9 Localisation & currency
`web/src/lib/i18n.ts` is a dependency-free dictionary with graceful per-key English fallback (EN + BM complete; zh/ta/hi core) — no next-intl/routing refactor; the locale is a `?lang=` param. `web/src/lib/format.ts` holds the currency table (`CURRENCIES`, 9 currencies) and `fmtMoney()` — display amounts convert from the MYR base at an indicative rate and format in the currency's own locale; captured amounts normalise back to MYR so graph math stays single-currency. `?ccy=` selects the display currency.

---

## 13. Scalability: household → business

The **same node/edge engine** serves both — this is the core scalability argument for the rubric. Nothing below is a new core; it is new labels, views, and aggregations over the identical graph.

| Concept | Household | Business |
|---------|-----------|----------|
| `income_source` | Salary, side gig | Revenue streams (Dine-in, Catering, Delivery) |
| `bucket` (the 3 tiers) | Needs & Fixed · Savings & Goals · Personal | Operating Costs · Reserves & Growth · Owner & Distributions |
| **subject matter** (`props`) | shared vs private wallet | **department / cost-centre / project** |
| `obligation` (`OWES`) | Loans | Suppliers, payroll, tax |
| `goal` | House deposit, Umrah | Runway, tax reserve, expansion |
| `member` (roster) | Aiman, Siti, kids | Owner, manager, staff, contractor |
| Focus lens reads | "show me Siti's spend" | "show me the Kitchen department's cashflow" |

### 13.1 Business workflow — the P3 build

The graph already supports this; P3 surfaces it:

1. **Departments as flexible subject matters.** A department is a `props.department` tag (and/or a `department` node with `BELONGS_TO` edges) on income, buckets, and vendors — *a tag, not a schema change*. The Focus lens gains a **Department/Subject** dimension automatically (same pattern as the person lens).
2. **Cashflow statement.** From the multi-month transaction history: monthly **inflow (income) − outflow (spend) = net**, plus **runway** (reserves ÷ average net burn). Rendered as an in/out/net time series — the business analogue of the household's bucket projection.
3. **Reporting & management.** Roll-ups per department / person / category; CSV/PDF export for an accountant; and graph-management CRUD (add revenue stream, create department bucket, set an allocation, adjust a goal) — extending the roster CRUD that already ships.
4. **Corporate B2B roll-up (P4).** HR analytics reads **materialized anonymized aggregates** (k-anonymity: suppress cohorts < 5) — never raw household/employee rows — so the "anonymized aggregate" promise holds by construction. `tenant_id` + RLS everywhere from day one.

---

## 14. Security, privacy & compliance

- **RLS on every table**; `is_tenant_member()` gate; service-role key used only server-side.
- **Data minimization**: parse screenshots, store structured fields, **discard raw images** (or short-TTL object storage). `receipt_ref` holds a pointer, not the image.
- **PDPA-aware**: sensitive financial data — clear consent, minimal retention, tenant isolation.
- **Secrets** never committed (`.gitignore`); service role key server-only.
- **Bucket 3 privacy by design**: personal wallet spending not itemized.

---

## 15. Deliverables & competition mapping

Rubric weights: Technical Feasibility 25 · Commercial Viability 25 · Industry Relevance 20 · Scalability 15 · ESG/National 15. Full task board and per-deliverable owners in **`NEXT.md`**.

**Companion docs:** `NEXT.md` (action board) · `DEPLOY.md` (first-cut deploy runbook + `pocketbase/Dockerfile`) · `docs/MARKET_STRATEGY.md` (competitor + demand-driver research; market prioritisation) · `docs/DISCLAIMER.md` (disclaimer + PDPA privacy, mirrored in-app at `/guide`) · `docs/AI_DISCLOSURE.md` · `docs/USER_GUIDE.md`.

### Suggested pitch-deck outline (slide → target dimension)
1. Title / one-liner — *Happy wife, happy life; healthy workforce.*
2. Problem: household stress → marital friction + presenteeism (9 lost days). `[ESG]`
3. Why existing apps fail: surveillance, manual entry churn, flat data. `[Relevance]`
4. Solution: 3-Bucket model — funding transparency, spending autonomy. `[Relevance]`
5. Live demo: Telegram screenshot → graph → Honey insight. `[Technical]`
6. Under the hood: financial knowledge graph + projection + six-lens monitoring & Focus. `[Technical][Scalability]`
7. Zero-integration + zero-cost stack. `[Technical]`
8. Business model: B2B2C employee wellness; unit economics. `[Commercial]`
9. Traction: signed LOI + pipeline. `[Commercial]`
10. Scale: household → business on one engine; alternative credit scoring. `[Scalability][Relevance]`
11. National impact: financial inclusion, SDG 1/3/8, MADANI. `[ESG]`
12. Team (Malaysian citizen flagged), roadmap, ask.

---

## 15. Live deployment, accounts, analytics & multi-provider AI (2026-07-10)

**Hosting — local-first + Cloudflare Tunnel.** The app is live at
**https://honeymoney.app**, served from the team's own PC (Next.js `next start`
:3000 + PocketBase :8090) exposed by a **named Cloudflare Tunnel**. RM 0, own
everything, PocketBase + data never leave the machine. Ops in `deploy/`
(`start-honeymoney.ps1` / `stop-honeymoney.ps1`, logon auto-start task); the tunnel
only publishes :3000, so PocketBase stays localhost-only. Trade-off: the PC must be
on/awake. Upgrade path: a ~USD 4/mo Singapore VPS runs the identical stack always-on.

**Accounts & roles.** PocketBase auth collection `app_users` with `role`
(`user` | `admin`). Server-mediated: `/api/auth/{login,signup,logout}` set an
httpOnly cookie holding the PB token; `lib/auth.ts#getSessionUser` verifies it via
`auth-refresh`. Browser never touches PocketBase. Pages: `/login`, `/signup`; a
global header shows auth state. Seeded admin: `admin@honeymoney.app`.

**Admin analytics** (`/admin`, admin-gated). First-party page-view tracking
(`Track.tsx` beacon → `/api/track`) records path, referrer, session, duration, and
**IP + country from Cloudflare edge headers** (`CF-Connecting-IP`, `CF-IPCountry`).
`lib/analytics.ts` rolls up total/unique visits, top pages + avg duration, countries,
visitor IPs, recent visits — no third-party trackers.

**Cost monitoring.** `costs` ledger (seeded: honeymoney.app domain, USD 15.48,
Cloudflare) + AI **development-token** spend estimated from the `ai_usage` ledger,
totalled in `/admin`. Token ledger also at `/api/usage`. Feeds the MAIC AI disclosure.

**Multi-provider AI.** `lib/ai.ts` unifies three free-tier engines behind
`aiGenerate()`, chosen by `AI_PROVIDER`: **Groq** (OpenAI-compatible), **Gemini
Flash** (also does receipt OCR), **Ollama** (local, zero-cost). Agentic health probe
at `/api/ai/check`; per-call tokens logged to `ai_usage`. Setup + login links:
`docs/AI_SETUP.md`.

---

_This manual evolves with the build. Keep it honest — judges reward clarity and realism over buzzwords._
