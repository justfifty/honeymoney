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

## Architecture (zero permanent backend)

```text
Telegram screenshot → Next.js API route → Gemini OCR → Supabase graph
                                                          ↓
                        Dashboard  ←  bucket_projection()  →  "Honey" insight
```

- **Frontend + API:** Next.js 16 (App Router) on Vercel — serverless routes are the whole backend.
- **Database:** Supabase Postgres — nodes/edges/transactions + RLS + a recursive-CTE projection.
- **AI:** Google Gemini via REST (multimodal vision + text). No SDK dependency.
- **Ingestion:** Telegram Bot API (free; WhatsApp is Phase 3 — it's paid + BSP-gated).

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
├── supabase/
│   ├── migrations/0001_init_graph.sql   # knowledge-graph schema + RLS + projection
│   └── seed.sql                         # demo household
├── docs/                    # growth kit, LOI, AI disclosure (see NEXT.md)
├── api/                     # ⚠️ legacy FastAPI prototype — retained for reference only
├── PLAN.md                  # development manual
├── NEXT.md                  # competition action plan
└── .env.example
```

> **Note:** `api/` is an earlier FastAPI + SQLite prototype. It is **not** part of the
> serverless architecture or the pitch — kept for reference only.

---

## Quick start

```bash
cd web
npm install
cp ../.env.example .env.local     # fill Supabase + Gemini + Telegram values

# apply the database (Supabase SQL editor or CLI):
#   run supabase/migrations/0001_init_graph.sql, then supabase/seed.sql
#   copy the printed DEMO_TENANT_ID into .env.local

npm run dev                       # http://localhost:3000  →  /dashboard
```

Full walkthrough (DB setup, Telegram webhook, deploy) in [`PLAN.md §9–11`](PLAN.md).

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
