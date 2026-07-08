# 🍯 HoneyMoney — AI Financial Wellness Engine

> **Funding transparency, spending autonomy.**
> A knowledge-graph financial wellness platform for families first, businesses next.
> Built for the **MAIC Nexus Challenge 2026 — Track T3 (Financial Services / Fintech)**.

HoneyMoney turns household money into a living **knowledge graph** and layers an AI
companion ("Honey") on top — so guidance is proactive and marital-safe, not a
retroactive interrogation of every RM 50 receipt. No bank integration required:
users forward e-wallet **screenshots** to a Telegram bot and Gemini does the rest.

📋 **Start here:** [`PLAN.md`](PLAN.md) (full manual) · [`NEXT.md`](NEXT.md) (competition action board)

---

## Architecture (local-first, RM 0)

```text
Telegram screenshot → Next.js API route → Gemini OCR → PocketBase graph (local)
                                                          ↓
                        Dashboard  ←  projection engine  →  "Honey" insight
```

- **Frontend + API:** Next.js 16 (App Router) — API routes are the whole backend.
- **Database:** **PocketBase** (single binary + SQLite) — nodes/edges/transactions knowledge
  graph, stored locally in `pocketbase/pb_data/`. Schema + demo data ship as committed
  migrations and load automatically on first start.
- **AI:** Google Gemini via REST (multimodal vision + text). No SDK dependency.
- **Ingestion:** Telegram Bot API (free; WhatsApp is Phase 3 — it's paid + BSP-gated).
- **Cloud-scale path:** the same schema exists as Postgres SQL in [`supabase/`](supabase/)
  (RLS + recursive-CTE projection) for when the team moves off local-first.

See [`PLAN.md §4–6`](PLAN.md) for the data model and hosting details.

---

## The 3-Bucket model

1. **Fixed Non-Negotiables** — rent, utilities, education (transparent fixed amounts).
2. **Future Shield** — a 10–20% auto-allocation to savings *before* tracking begins.
3. **Operational Independence Wallets** — capped personal pools where tracking stops.

---

## Repository layout

```text
honeymoney/
├── web/                     # Next.js 16 app (the competition MVP)
│   └── src/
│       ├── app/
│       │   ├── page.tsx             # landing
│       │   ├── dashboard/page.tsx   # buckets + Honey insight
│       │   └── api/
│       │       ├── telegram/webhook/route.ts
│       │       ├── parse/route.ts   # OCR→graph test harness
│       │       ├── insight/route.ts
│       │       └── health/route.ts
│       └── lib/             # config, supabase, gemini, graph, projection, telegram
├── pocketbase/
│   └── pb_migrations/       # knowledge-graph schema + demo seed (auto-applied)
├── scripts/                 # pb:download / pb:start helpers (cross-platform)
├── supabase/                # same schema as Postgres SQL — optional cloud-scale path
│   ├── migrations/0001_init_graph.sql
│   └── seed.sql · seed_business.sql
├── docs/                    # growth kit, LOI, AI disclosure (see NEXT.md)
├── api/                     # ⚠️ legacy FastAPI prototype — retained for reference only
├── PLAN.md                  # development manual
├── NEXT.md                  # competition action plan
└── .env.example
```

> **Note:** `api/` is an earlier FastAPI + SQLite prototype. It is **not** part of the
> serverless architecture or the pitch — kept for reference only.

---

## Quick start (Windows & macOS)

```bash
git clone https://github.com/justfifty/honeymoney.git && cd honeymoney/web
npm install
cp ../.env.example .env.local     # defaults work out of the box

npm run pb:download               # one-time: fetch the PocketBase binary for your OS
npm run pb:start                  # terminal 1: database (auto-creates schema + demo data)
npm run dev                       # terminal 2: app → http://localhost:3000/dashboard
```

That's it — the dashboard shows the demo household immediately. Add a free
`GEMINI_API_KEY` to `.env.local` to enable receipt OCR + AI insights.
PocketBase admin UI: `http://127.0.0.1:8090/_/` (see `.env.example` for the dev login).

Full walkthrough (Telegram webhook, deploy options) in [`PLAN.md §9–11`](PLAN.md).

---

## Security & privacy

- Row Level Security on every table; service-role key server-only.
- Screenshots parsed then discarded — `receipt_ref` stores a pointer, not the image.
- PDPA-aware; Bucket 3 spending is private by design. See [`PLAN.md §14`](PLAN.md).

---

## Competition

**MAIC Nexus Challenge 2026** · Track T3 · [maicnexus.com](https://maicnexus.com/en)
Rubric: Technical 25 · Commercial 25 · Relevance 20 · Scalability 15 · ESG/National 15.
Prizes up to **RM 200K cash + RM 100K equity + HATI incubation**.

## License

MIT © 2026 HoneyMoney Team
