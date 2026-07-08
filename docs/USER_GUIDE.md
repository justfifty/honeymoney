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
| Rent | Fixed (Bucket 1) | RM 1,200 |
| Utilities | Fixed (Bucket 1) | RM 300 |
| Education | Fixed (Bucket 1) | RM 500 |
| Future Shield | 15% auto-save (Bucket 2) | RM 900 |
| Groceries | Personal, tracked (Bucket 3) | RM 800 |
| Personal — Aiman | Private wallet (Bucket 3) | RM 700 |
| Personal — Siti | Private wallet (Bucket 3) | RM 700 |

Seeded spend puts **Groceries running hot early in the month**, so it surfaces as **Over budget** and Honey nudges a gentle rebalance — *without* itemizing either spouse's private wallet. That's the "funding transparency, spending autonomy" story in one screen.

### Example B — a business (`seed_business.sql`) → `BUSINESS_TENANT_ID = 2222…2222`
**Nasi Lemak Sedap Sdn Bhd**, revenue RM 40,000/month, split into Payroll / Suppliers / Rent & Utilities / Tax Reserve (8%) / Growth Fund / Owner Draw. Seeded supplier spend trends **over budget**.

> **Why this matters:** Example B uses the **exact same tables and the same `bucket_projection()` function** as the household — no schema changes. That is the "family first, business next" scalability proof.

To view Example B on the dashboard, set `DEMO_TENANT_ID` to the business id, or call `/api/insight?tenantId=2222…2222`.

---

## 3. How to use it (as a family)

1. **Set up buckets once** — your fixed bills, a Future Shield %, and personal wallet caps. (The seed does this for you as a demo.)
2. **Link Telegram** — open the bot, send `/start`. Your chat is linked to your household.
3. **Forward receipts** — whenever you pay with TNG / MAE / GrabPay / ShopeePay, forward the screenshot to the bot. No typing.
4. **Confirm** — Honey replies with what it read; reply "no" if it's off (human-in-the-loop).
5. **Check in weekly** — open `/dashboard`, read Honey's one insight. Personal-wallet spending stays private.

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

## 5. Try it without the full setup

- **See the UI immediately:** `cd web && npm install && npm run dev` → open `http://localhost:3000`. Without Supabase configured, the dashboard shows a friendly setup checklist (it never crashes).
- **See real data:** create a free Supabase project, run `0001_init_graph.sql` then `seed.sql` (and optionally `seed_business.sql`), put the printed `DEMO_TENANT_ID` in `web/.env.local`, restart. The dashboard fills in.
- **Test the AI parse:** `POST /api/parse` with `{ "imageBase64": "...", "mimeType": "image/jpeg", "tenantId": "1111…1111" }`.
- **Check wiring:** `GET /api/health` shows which integrations are configured.

Full setup + deploy walkthrough: `PLAN.md §9–11`.
