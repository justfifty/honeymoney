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

---

## 2. Requirements

### 2.1 Functional
- Ingest a transaction from a forwarded screenshot (Telegram) → parse → store in graph.
- Model income → buckets → wallets → vendors/goals as a temporal graph.
- Project month-end position per bucket from allocation vs. spend velocity.
- "Honey" chat/insight: marital-safe, forward-looking guidance grounded in the graph.
- Dashboard: buckets, recent spend, Honey insight.
- Multi-tenant: households and businesses isolated by `tenant_id` + RLS.

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
| **P1 — MVP vertical slice** | Jul–Aug 2026 | Telegram → OCR → graph → Honey insight → dashboard, deployed on Vercel + Supabase. Repo with real history. |
| **P2 — Semi-final polish** | Sep–Oct 2026 | Curated OCR accuracy ≥95% on golden set; refined Honey persona; 3-min live demo; 1 signed corporate LOI; alternative credit-scoring narrative. |
| **P3 — B2B scalability** | Nov 2026+ | Multi-tenant corporate HR dashboard (anonymized aggregates); business-persona graph; pilot onboarding. |

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
| Frontend + API (serverless) | **Vercel** | Hobby (free) | Edge/serverless routes; no dedicated server. |
| Database + Auth + Storage | **Supabase** | Free | ~500 MB Postgres, connection pooler (Supavisor), Auth, RLS. |
| AI (vision + text) | **Google Gemini** (AI Studio) | Free | Rate-limited (RPM/RPD) — batch, cache, and queue OCR. |
| Ingestion channel | **Telegram Bot API** | Free | No gatekeeper. *(WhatsApp Business API is paid + BSP-gated — Phase 3 only.)* |
| Source control / artifact | **GitHub** | Free | Judges' artifact link; real commit history. |
| Future scale | **AWS** (MAIC credits) | Credits | For enterprise pilots. |

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

Copy `.env.example` → `web/.env.local` and fill:

| Variable | Purpose | Where to get it |
|----------|---------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client (RLS-bound) key | same |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key (bypasses RLS in API routes) | same — **never expose to browser** |
| `GEMINI_API_KEY` | Vision + text model | https://aistudio.google.com/app/apikey |
| `GEMINI_MODEL` | Model id (default `gemini-2.0-flash`) | optional |
| `TELEGRAM_BOT_TOKEN` | Bot auth | @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Verifies inbound webhooks | you choose a random string |
| `DEMO_TENANT_ID` | Household shown on the dashboard | UUID from `seed.sql` output |

The app **degrades gracefully**: if Supabase/Gemini are not configured, the dashboard shows a setup state and routes return a clear "not configured" response instead of crashing.

---

## 9. Step-by-step: build & run locally

```bash
# 0. prerequisites: Node >= 20, npm >= 10, git
git clone <your-repo-url> honeymoney && cd honeymoney

# 1. install web deps
cd web
npm install

# 2. configure env
cp ../.env.example .env.local
#    edit .env.local with your Supabase + Gemini + Telegram values

# 3. set up the database (Supabase)
#    Option A — Supabase SQL editor: paste supabase/migrations/0001_init_graph.sql, run;
#               then paste supabase/seed.sql, run. Copy the printed DEMO_TENANT_ID into .env.local.
#    Option B — Supabase CLI:
#       supabase link --project-ref <ref>
#       supabase db push          # applies migrations
#       (then run seed.sql in the SQL editor)

# 4. run
npm run dev            # http://localhost:3000  (landing)  /dashboard (app)

# 5. test the parse pipeline without Telegram
#    POST an image to /api/parse (base64) — see §12.2 for the payload shape.

# 6. typecheck / build
npm run build
```

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
`web/src/lib/projection.ts` calls the `bucket_projection` RPC + recent transactions, builds a compact context, and asks Gemini for the Honey insight. If Gemini is unconfigured it falls back to a deterministic rule-based message so the demo always works.

---

## 13. Scalability: household → business

The **same node/edge engine** serves both — this is the core scalability argument for the rubric:

| Concept | Household | Business |
|---------|-----------|----------|
| `income_source` | Salary | Revenue streams |
| `bucket` | Fixed / Future Shield / Personal | Opex / Reserves / Payroll |
| `obligation` (`OWES`) | Loans | Suppliers, payroll |
| `goal` | House deposit, holiday | Runway, tax reserve |
| `member` | Spouses | Employees / departments |

Moving to business = **new views and aggregations, not a new core.** B2B corporate analytics reads **materialized anonymized aggregates** (k-anonymity: suppress cohorts < 5 employees) — never raw household rows — so the "anonymized aggregate" promise holds by construction. `tenant_id` + RLS everywhere from day one.

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

### Suggested pitch-deck outline (slide → target dimension)
1. Title / one-liner — *Happy wife, happy life; healthy workforce.*
2. Problem: household stress → marital friction + presenteeism (9 lost days). `[ESG]`
3. Why existing apps fail: surveillance, manual entry churn, flat data. `[Relevance]`
4. Solution: 3-Bucket model — funding transparency, spending autonomy. `[Relevance]`
5. Live demo: Telegram screenshot → graph → Honey insight. `[Technical]`
6. Under the hood: financial knowledge graph + projection. `[Technical][Scalability]`
7. Zero-integration + zero-cost stack. `[Technical]`
8. Business model: B2B2C employee wellness; unit economics. `[Commercial]`
9. Traction: signed LOI + pipeline. `[Commercial]`
10. Scale: household → business on one engine; alternative credit scoring. `[Scalability][Relevance]`
11. National impact: financial inclusion, SDG 1/3/8, MADANI. `[ESG]`
12. Team (Malaysian citizen flagged), roadmap, ask.

---

_This manual evolves with the build. Keep it honest — judges reward clarity and realism over buzzwords._
