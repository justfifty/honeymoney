# HoneyMoney — User Quick Guide

**What it looks like, how to use it, how to apply it, and where.**
Two surfaces, both **installation-free**:

1. **Telegram bot** — how you *capture* money. You already have Telegram; there's no new app to install. You forward a screenshot, Honey does the rest.
2. **Web dashboard** — a **mobile-first browser UI** (just a URL, e.g. `https://<app>.vercel.app/dashboard`). Works on phone or laptop; nothing to download. Can later be "Added to Home Screen" as a PWA.

---

## 1. What you see

### The dashboard (`/dashboard`)
- **Honey card** — one warm, forward-looking insight ("at this pace, Groceries trends RM… over plan — want to rebalance?").
- **Summary** — allocated / projected spend / projected balance for the month.
- **Buckets** — each with a progress bar and a status chip: `On track`, `At risk`, `Over budget`, `Unfunded`.
- **Recent (auto-captured)** — the transactions pulled from your forwarded screenshots.

Layout is responsive: cards stack to a single column on a phone, two columns on a laptop.

### The Telegram chat
```text
You:   (forward a Touch 'n Go / MAE receipt screenshot)
Honey: ✅ Logged MYR 52.00 at GrabFood → Groceries (confidence 95%).
       Reply "no" if that's wrong.
```

---

## 2. Sample data you can explore right now

Two ready-made examples ship in `supabase/`. Load them and the dashboard is immediately populated — no manual entry.

### Example A — a household (`seed.sql`) → `DEMO_TENANT_ID = 1111…1111`
**The Rahman Household**, salary RM 6,000/month, split on payday:

| Bucket | Type | Allocated / mo |
|--------|------|---------:|
| Rent | Must-paid (Bucket 1) | RM 1,200 |
| Utilities | Must-paid (Bucket 1) | RM 300 |
| Education | Must-paid (Bucket 1) | RM 500 |
| Savings | 15% auto-save (Bucket 2) | RM 900 |
| Groceries | Spendings, tracked (Bucket 3) | RM 800 |
| Spendings — Aiman | Private wallet (Bucket 3) | RM 700 |
| Spendings — Siti | Private wallet (Bucket 3) | RM 700 |

Seeded spend puts **Groceries running hot early in the month**, so it surfaces as **Over budget** and Honey nudges a gentle rebalance — *without* itemizing either spouse's private wallet. That's the "funding transparency, spending autonomy" story in one screen.

### Example B — a couple → `cprahman2222222`
**Nadia & Faiz**, a dual-income couple in KL. Two salaries (RM 5,200 + RM 4,300) and a
weekend side gig fan into **one shared set of must-paid buckets** — Rent & Home RM 1,800
split down the middle, Statutory & Tax, Insurance & Takaful, Bills, Car & Transport —
plus Emergency Fund and House Deposit in tier 2.

Then the part that makes it a couples product: **Personal — Nadia** and **Personal — Faiz**,
one funded tier-3 bucket each. The household sees each bucket's **total** so the plan
still balances; it does not see the other partner's vendors, notes or who logged what.
That is enforced in `web/src/lib/privacy.ts`, not merely promised in the copy.

> **Why this matters:** Example B uses the **exact same tables and the same projection
> walk** as the family — no schema changes, no persona-specific labels. A household that
> gains a partner gains rows, not a different app.

To view Example B on the dashboard, set `DEMO_TENANT_ID=cprahman2222222`, or open
`/graph?tenantId=cprahman2222222`.

---

## 3. How to use it (as a family)

1. **Set up buckets once** — your Must-paid bills, a Savings %, and Spendings caps. (The seed does this for you as a demo.)
2. **Link Telegram** — open the bot, send `/start`. Your chat is linked to your household.
3. **Forward receipts** — whenever you pay with TNG / MAE / GrabPay / ShopeePay, forward the screenshot to the bot. No typing.
4. **Confirm** — Honey replies with what it read; reply "no" if it's off (human-in-the-loop).
5. **Check in weekly** — open `/dashboard`, read Honey's one insight. Spendings-bucket spending stays private.

## 4. How to apply it (as an employer / where to apply)

HoneyMoney is sold to **corporate HR as an employee financial-wellness benefit** (B2B2C):
- Employees get the private household tool above.
- Employers get an **anonymized, aggregate** workforce financial-health view (privacy-protected, cohorts under 5 suppressed).

**Where to apply / start a pilot:**
- Free 90-day pilot for 20–50 employees — see `docs/LOI_TEMPLATE.md` (a ready-to-sign Letter of Intent).
- Outreach scripts to reach HR leaders — `docs/OUTREACH_KIT.md` → `docs/growth/OUTREACH_KIT.md`.
- The pitch and pricing — `docs/growth/SALES_ONEPAGER.md`.
- The downloadable lead magnet that attracts HR leads — `docs/growth/LEAD_MAGNET.md`.

---

## 5. Try it — three commands, everything local & free

```bash
cd web && npm install && cp ../.env.example .env.local
npm run pb:download && npm run pb:start     # terminal 1: local database (auto-seeds demo data)
npm run dev                                  # terminal 2: app → http://localhost:3000/dashboard
```

- The database is **PocketBase** — a single free binary; your data lives in `pocketbase/pb_data/` on your own machine and the demo households load automatically. Browse it at `http://127.0.0.1:8090/_/`.
- Demo tenants: family `hhrahman1111111` (default) · couple `cprahman2222222` · individual `psaisha33333333` (set any as `DEMO_TENANT_ID`, or call `/api/insight?tenantId=…`).
- Seeded personas age: run `node scripts/refresh-demo-data.mjs` to roll their history into the current month, or every month-to-date view shows an empty month.
- **Test the AI parse:** add a free `GEMINI_API_KEY`, then `POST /api/receipt` with `{ "imageBase64": "...", "mimeType": "image/jpeg" }` from a logged-in session (the household comes from your session — no `tenantId` in the body).
- **Check wiring:** `GET /api/health` shows which integrations are configured.

Full setup + deploy walkthrough: `PLAN.md §9–11`.
