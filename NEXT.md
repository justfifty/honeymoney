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

## ✅ Shipped — 2026-07-14 (real households · audit ledger · capture overhaul · live FX)

The app was a **single-household demo wearing a login**. It now has real multi-user
households, a tamper-evident ledger, and capture that works in every language we ship.

### 🔐 Security — an open API is now closed `[Technical]`
- [x] **Fixed: four write routes had no auth check at all.** `/api/transactions`,
      `/api/graph`, `/api/members`, `/api/insight` took `tenantId` from the request
      body and trusted it — anyone could write into, or read, any household by
      guessing its id. The tenant now comes from the **session**, never the payload.
- [x] **`proxy.ts`** (Next 16 renamed Middleware → Proxy) gates `/household`,
      `/ledger`, `/admin`. Optimistic only — the real check is per-route.

### 👨‍👩‍👧 Family login — the missing relation `[Relevance][Scalability]`
- [x] **Fixed: `app_users` had no link to `tenants`.** Every logged-in user saw the
      same `DEMO_TENANT_ID` household. The Supabase twin always had `members.user_id`;
      the PocketBase port had dropped it. Restored (`members.user`).
- [x] **Invite codes** (`invites`) — owner mints a code, optionally locked to one
      email; partner signs up (or joins at `/join`) and lands in the **same tenant**.
      Both keep their own login. `/household` explains it and manages it.
- [x] **Roles** (`members.access_role`): owner · adult · child · viewer. A child logs
      only their own spending; the last owner can't demote themselves.
- [x] **Signup now creates a household** + seeds the 3-bucket model (it previously
      created an account attached to nothing).
- ✅ *Verified end-to-end: two accounts, one shared household, correct role denials.*

### ⛓️ Immutable records — "can be changed, but every change is recorded" `[Technical][ESG]`
- [x] **Hash-chained `ledger`** — every create/edit/void appends an entry whose SHA-256
      covers the previous entry's hash. `/ledger` re-verifies from genesis on every load.
- [x] **Nothing is ever destroyed.** Delete = **void** (reversible, still visible,
      struck through under "Show removed"). Voided rows never count toward totals.
- [x] **Public anchoring** — head hash submitted to **OpenTimestamps → Bitcoin**. Only a
      32-byte hash leaves the device; the financial data never does. Downloadable `.ots`
      proof verifies **without us** (`ots verify`).
- ✅ *Verified: a direct superuser DB edit of a past amount was caught, and located to
      the exact entry. Anchoring refuses to run on a broken chain. Real OTS proof file
      validated (magic header, SHA-256 tag, committed digest).*

### ✏️ Edit & delete — previously impossible `[Technical]`
- [x] `PATCH` / `DELETE /api/transactions/:id` + inline edit, remove/restore, and a
      per-record **history** view on `/records`. A mis-parsed capture used to be
      permanent unless you opened the PocketBase admin UI.

### 🎤 Voice — the "only recognises numbers" bug, root-caused `[ESG][Relevance]`
- [x] **The cause was one character class.** `[a-z]` / `[^a-z'&\-\s]` cannot match
      星巴克, ஸ்டார்பக்ஸ் or स्टारबक्स, so for zh/ta/hi **every letter was stripped** and only the
      ASCII digits survived. Rewritten Unicode-first (`\p{L}\p{M}` — the combining
      marks matter, or Tamil/Devanagari shatter into fragments).
- [x] `zh-Hant` was missing from the speech map → Traditional-Chinese users were being
      routed into an **English** recogniser. Added.
- [x] The alternative-picker **preferred whichever ASR guess contained a number** — it
      actively selected for number-only readings. Now scores merchant + amount + currency.
- [x] Amount parsing fixed: `42.50` was being eaten as a clock time; `Math.max()` made
      "spent 12 at 99 Speedmart" return **99**. Spoken numbers (EN/MS/中文), CJK numerals,
      relative dates, 9 currencies.
- [x] Merchant biasing (Malaysian vendor list + your own past vendors), live transcript.
- [x] **AI-assisted parse** (`/api/voice`) when a provider is set — grounded in your real
      buckets/vendors; degrades to on-device, never errors.
- ✅ *Verified: 11/11 cases across en · ms · zh · zh-Hant · ta · hi.*

### 📷 Screenshots & receipts — Touch 'n Go, finally `[Relevance]`
- [x] **Paste (Ctrl+V), drag-and-drop, and `capture="environment"`** (rear camera).
      Previously: one hidden file input — you had to save the screenshot to disk first.
- [x] **Agentic receipt analytics** (`/api/receipt` → `lib/receipt.ts`): perceive (vision)
      → **ground in the household's real graph** → decide → explain. Returns vendor,
      amount, **currency, date, confidence**, a suggested bucket, and flags **duplicates**,
      **subscriptions** and **anomalies vs this household's own history**. Every id it
      returns is re-validated against the graph (a hallucinated bucket id would otherwise
      file a spend into a bucket that doesn't exist).
- [x] Gemini **and** Groq **and** Ollama vision (`aiVision`) — was Gemini-only, and the web
      UI never called it at all; only Telegram did.
- [x] tesseract.js now uses the **right language pack** (was hardcoded `"eng"`).
- [x] Nothing is auto-saved: the agent proposes, the human confirms, corrections are ledgered.

### 💱 Live FX with named sources `[Technical][Commercial]`
- [x] **Rates are no longer indicative.** Live from **Bank Negara Malaysia** (the central
      bank's own Open API — the right thing to cite in Malaysia), falling back to the
      **ECB**, then the last cached rate, then the labelled indicative table.
- [x] **Every converted figure names its source and date** (`RatesNote`, `/api/fx`).
      Each transaction also stores what the user actually typed + the rate and source it
      was converted at, so a figure stays auditable months later.
- [x] The old hardcoded table was **~14% off on JPY** and ~11% on USD.
- *(OANDA needs a paid account; BNM/ECB are free, official and citable. Swappable via
  one provider function in `lib/fx.ts` if you ever buy OANDA.)*

### 🔑 Auth UI
- [x] Signup had **no show/hide toggle** (login did), no confirm field, no strength meter,
      and the 8-char rule was server-only. Shared `AuthFields`: toggle, strength meter,
      confirm-match, Caps-Lock warning, `?next=` return-to.

### ⚠️ To go live with this
- [ ] **Restart the stack** — the migration `1751900010_household_ledger_fx.js` applies on
      PocketBase start, and the app needs a rebuild. `deploy/stop-honeymoney.ps1` then
      `deploy/start-honeymoney.ps1`. (Verified against an isolated copy of `pb_data`; the
      live DB has NOT been migrated yet.)
- [ ] Add a **`GEMINI_API_KEY`** (2 min, free) to switch capture from on-device to agentic.
- [ ] Existing seeded members have no `user` relation — they're roster names, not logins.
      Invite real accounts to attach them.

---

## ✅ Shipped — 2026-07-15 (PWA install on iOS · Telegram setup guide)

High-leverage "spread like fire" polish: remove install friction and document the
lowest-friction acquisition channel.

### 📲 Install prompt now works on iPhone `[Relevance][Commercial]`
- [x] **Fixed: the bottom "Install HoneyMoney" banner never appeared on iOS.** It
      relied on `beforeinstallprompt`, which Safari does **not** fire — so only Android
      ever saw it. Added an iOS-Safari branch that shows the **Share → "Add to Home
      Screen"** steps (with the Share glyph); Android keeps the one-tap native install.
      `web/src/app/InstallPrompt.tsx`. Dismiss + already-installed checks unchanged.
- [x] **Mobile icon confirmed current** — the sunburst-on-orange PWA icon set is
      correct and served byte-for-byte. An "old icon" on a phone is the home-screen
      shortcut cached at install time (delete + re-add to refresh), not a build issue.

### 🤖 Telegram — setup documented, bot not yet created `[Technical][Commercial]`
- [x] **`docs/TELEGRAM_SETUP.md`** — full BotFather → env → webhook → verify guide with
      a troubleshooting table, grounded in the real handler/config.
- [ ] **Create the bot + fill secrets.** Code is complete and `DEMO_TENANT_ID` is set,
      but `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` are **empty** in
      `web/.env.local`, so `isTelegramConfigured()` is false and the webhook silently
      acks. Follow the guide's Steps 1–4 to go live.
- [ ] **Per-user linking (growth unlock).** Today every `/start` hard-links to the one
      `DEMO_TENANT_ID` household. A `/start <code>` that binds a chat to the code-issuer's
      household would let *any* family use the bot — the real "spread like fire" enabler.

---

## ✅ Shipped — 2026-07-16 (AI co-pilots · Goals · Academy · account lifecycle · credit/debit · mobile UX · privacy)

A big build day: grounded AI co-pilots, self-directed savings goals, a kids'
literacy game, a reversible account lifecycle, first-class credit/debit, a
Touch 'n Go-style mobile shell, a positioning refocus, and a real privacy fix.
All pushed to `origin/main`; app rebuilt + restarted; PocketBase migrations applied.

### 🤖 AI features — grounded in *your* graph, never generic `[Technical][Commercial][Relevance]`
- [x] **What-if co-pilot** — `/api/insight/ask` + dashboard "Ask Honey" panel (`lib/copilot.ts`). Plain-language questions ("can we afford RM2,000 for Raya?", "what if income drops 20%?") reasoned over the household's own projection, advice-free + marital-safe. **Deterministic fallback** so it works at RM 0 (no key); tries live signed-out on the demo tenant.
- [x] **Malaysian statutory co-pilot** — `lib/statutory.ts` holds VERIFIED 2025 EPF/SOCSO/EIS/min-wage/PCB facts + a take-home estimate; statutory Qs are grounded in that block (never hallucinated), always dated + "confirm on KWSP/PERKESO".
- [x] **Subscription & bill radar** — `lib/radar.ts` detects recurring charges (steady vendor+amount+cadence) → dashboard "money-found" view + monthly total. No AI needed.
- [x] **Proactive Honey agent** — `lib/nudge.ts` scans projections and Telegram-pings *before* a shortfall; `POST /api/insight/nudge` (scheduled, `x-purge-secret`).
- [x] **Guide** — a "🤖 The AI — what it does (and doesn't)" section, honest + advice-free (EN + BM).

### 🎯 Goals & 🎓 Academy — own targets + financial literacy `[ESG][Commercial]`
- [x] **Goals** `/goals` — self-directed savings targets (own time, own targets): category presets (retirement/trip/study/home/vehicle/emergency/wedding/gift/custom), 25/50/75/100% milestones, monthly-pace hint, **🏆 Achievements** record of reached targets. Reuses `goal` nodes (`lib/goals.ts`, `/api/goals`). Reward = the target itself — zero compliance risk.
- [x] **HoneyMoney Academy v1** — `/learn` kid-friendly **Money Quiz** (3-bucket + wise-spending), instant educational feedback, score tiers, on-device best score. Scores *learning*, stores nothing personal (SDG 4).

### 👤 Account lifecycle + unified Setup hub `[Technical][ESG]`
- [x] **Setup hub** `/setup` — subsumes AI Setup **and** Account: display-name + password change (`/api/account/{profile,password}`), the reversible delete/restore, AI-capture + install docs. `/account` → `/setup`.
- [x] **Reversible account deletion** (Play/GDPR) — soft-delete + **30-day restore** grace, then a scheduled purge. Role-aware (children owner-managed; shared households can only *leave*; sole owner must transfer first). Migration `1751900013` applied. Public `/delete-account` info page.

### 🧾 Capture & records upgrades `[Technical]`
- [x] **Receipt breakdown** — scanning now extracts subtotal · service charge · SST/tax · final total (not just the grand total). `lib/receipt.ts` + capture UI. *(Extraction quality needs validation vs real receipts + a vision key.)*
- [x] **Multi-transaction scan** — the statement importer now accepts a **photo/screenshot** (jpg/png/webp/heic), not just PDF, through the same multi-row + review-before-save pipeline (`lib/statement.ts`, `/import`).
- [x] **First-class credit/debit** — `transactions.direction` (migration `1751900014`, backward-safe); Spent/Received toggle on the add form; projection & records exclude credits from spend and show them green.

### 📱 Mobile UX + install `[Relevance][Commercial]`
- [x] **Touch 'n Go-style bottom tab bar** (`BottomNav.tsx`) — Dashboard · Records · raised center **Capture** · Goals · Learn; app pages only, `md:hidden`.
- [x] **Hamburger menu at all sizes** (was mobile-only) — one ☰ for Goals/Learn/Setup/Install.
- [x] **First-class iOS install** — `usePwaInstall` distinguishes iOS Safari vs off-Safari; a shared `IosInstallGuide` (Share → Add to Home Screen) on the banner, menu, `/setup`, `/guide`, and an iPhone-only landing hint.
- [x] **Landing 3s-hook** — "three ways in" cards (Capture · Dashboard · Goals); footer brand links home; dev repo link demoted.

### 🎯 Positioning — zoom onto the target audience `[Commercial][Relevance]`
- [x] Lead with **individuals · couples · families** (business later; the engine still supports it). Landing personas become Just you → A couple → A family; tagline/meta/OG/keywords drop the SME framing.

### 🔒 Security & privacy — households are member-only `[Technical][ESG]`
- [x] **Fixed a real leak:** the `/graph` persona switcher listed *every* tenant, and anonymous visitors could pass `?tenantId=<any household>` to view its books. Now anonymous sees only the seed **demo personas** (`config.demoPersonaIds`); signed-in users are locked to their own households (`listHouseholdsFor`).

### ⚙️ Ops / deferred
- [x] **Maintenance scripts** — `deploy/run-maintenance.ps1` + `install-maintenance-tasks.ps1` (daily purge 03:00 · nudge 09:00, S4U).
- [x] Demo script reworked to showcase the co-pilot + AI features (`docs/deck/DEMO_SCRIPT.md`).
- [ ] **Activate the crons** — set `ACCOUNT_PURGE_SECRET` in `web/.env.local`, run `install-maintenance-tasks.ps1` elevated (once). Until then, deletes soft-delete/restore but never auto-purge; nudges don't fire.
- [ ] **Validate the two AI capture paths** (receipt breakdown, statement-photo multi-row) against real Malaysian receipts/statements + a vision key.
- [ ] Bitcoin: kept OUT of product & deck (private feasibility only) — sats-back / asset-tracking / sponsorship, never yield/custody.

---

## ✅ Shipped — 2026-08-02 (the 3-second hook · capture friction · mobile overflow fix)

The landing page promised value and charged a navigation to deliver it. It now
**delivers the value in the first screenful, signed out**: a working expense
parser in the hero, running the same on-device code the signed-in app runs.
Downstream, the add-spend form stopped asking for four things it could already
guess, and a real mobile layout bug on `/dashboard` is fixed.

### ⚡ The 3-second hook — value before the click `[Commercial][Technical]`
- [x] **`TryItNow.tsx` — a live parser in the hero.** Type or tap `kopi 6.50` and a
      real spend card appears: vendor · amount · **which of the three buckets it
      lands in** · a Honey line · CTA. Uses `lib/voiceParse.ts` — the *same*
      parser the app uses, so a visitor is trying the product, not a mock-up.
      Zero network, zero tokens, works offline, no account.
- [x] **The privacy claim is now measured, not asserted** — the card prints the real
      parse time ("Read on your device in 3 ms · 0 AI tokens · nothing left this
      browser"). A judge can verify it in the network tab.
- [x] **One-tap examples** (`kopi 6.50` · `Grab 18.40` · `TNB bill 142`) — the literal
      three seconds. The third lands in *Must-paid*, so the bucket visibly changes.
- [x] **Mic in the hero** — signed-out voice capture, on-device.
- [x] **Hero rewritten to an outcome** — "Say it, snap it, or type it. See where the
      money actually goes." replaces the brand-only h1. The two equal-weight CTAs and
      the "three ways in" cards left the hero (they were 5 competing decisions in the
      first screenful, and the previous 2026-07-16 "3s-hook" entry was really three
      navigation choices, not a hook); they now live above the final CTA.
- [x] **The claim is itemised** — a new "Three minutes from stranger to your first
      insight" strip (0:00 / 0:45 / 1:45 / 3:00), each step a real screen.
- [x] **Verified above the fold at 390×844** — input → parse → bucket → Honey → CTA all
      fit without a scroll (the mobile tagline is hidden to buy the room).

### 🧾 Capture friction — stop asking what we can guess `[Technical][Relevance]`
- [x] **`AddTransaction` cut from 6 visible fields to 2.** Direction · currency · date
      moved behind a disclosure **whose label states their current values**
      ("Spent · MYR · Today · change") — so the defaults stay auditable without
      costing a tap. Amount leads (it opens the number pad); vendor follows.
- [x] **Bucket is now one-tap chips**, not a dropdown — the 3-bucket model made visible
      at the moment of filing, which is where a correction becomes the household's
      own training data.
- [x] **Undo on the spot** — a save returns its `transactionId` and offers ↩ Undo inline
      (voids via `DELETE /api/transactions/:id`; reversible, fully audited). Closes the
      1:45 step of the 3-minute path.
- [x] **Confidence gates the UI** — a parse below 0.6 auto-opens the details and focuses
      the amount, instead of silently filing a shaky guess.
- [x] **Capture moved to the top of `/dashboard`** — it was the 5th section, a
      screen-and-a-half below the fold on a phone, on the page people open to *log*.
- [x] **Empty state is a capture surface** — the "no transactions yet" panel now carries
      an "Add your first spend" button instead of ending the sentence.

### 🐛 Fixes `[Technical]`
- [x] **`/dashboard` scrolled horizontally on every phone.** The header's four nav links
      couldn't wrap, forcing `scrollWidth` past the viewport and clipping every card
      below off the right edge. Header stacks on mobile; nav wraps. Verified
      `scrollWidth == innerWidth` at 390px on `/` and `/dashboard`.
- [x] **`useDictation.ts` — one recogniser, shared.** The speech path (locale map +
      best-alternative scoring) was inlined in `SpendCapture`; the landing box could
      only have got a mic by copy-pasting the two details most likely to rot — the
      `zh-Hant` mapping and the alternative heuristic. Now one hook, used by both.
- [x] Lint errors cleared in `SpendCapture` (use-before-declare) and the new hook
      (ref-write during render, setState-in-effect → `useSyncExternalStore`).

### 🌏 i18n
- [x] Hook copy translated across **all six locales** (EN · BM · 简中 · 繁中 · தமிழ் · हिन्दी);
      the form/undo strings are EN + BM with the file's per-key English fallback.
      Non-EN/BM values are machine translations — flag for native review.

### ⬜ Not done / next
- [ ] Mirror the same friction cuts in `/graph`'s `FlexibleInput` (it still shows every
      field at once).
- [ ] Draft-survival: a half-entered expense still dies on navigation/refresh.
- [ ] Seed the three buckets *at signup* so the first capture never meets an empty
      bucket list (currently created with the household — verify the ordering).

---

## ✅ Shipped — 2026-08-20 (business persona retired → individual · couple · family)

The demo arced personal → family → **business**, which asked judges and first-time
users to hold two products and two vocabularies at once. The arc is now
**individual → couple → family**: one product, one 3-bucket model, three sizes of the
same household. The couple is the commercial wedge (`docs/MARKET_STRATEGY.md` §C) and
the persona where the tier-3 privacy promise finally has something to demonstrate.

### 👫 The couple persona — the missing tenant `[Scalability][Commercial]`
- [x] **Fixed: the pivot referenced a household nothing created.** `config.demoPersonaIds`
      pointed at `cprahman2222222` while the seeds still built only the business tenant,
      so the switcher's middle slot was dangling.
      `pocketbase/pb_migrations/1751900016_couple_replaces_business.js` retires
      `bizsedap2222222` (cascade) and seeds **Nadia & Faiz** — two salaries + a side gig,
      10 buckets, a shared House Deposit goal, and **a funded private bucket each**.
- [x] **Seeded relative to today**, three months deep — which also puts the H-Score's
      90-day window and its 20-txn/30-day confidence gate on real data (41 txns/30d).
- [x] **Switcher order is the story.** The persona list now renders in `demoPersonaIds`
      order (was `created`, which scrambled the arc): 🧑 → 👫 → 👪.

### 🕒 Demo data was silently rotting `[Technical]`
- [x] **Found: family and solo had ZERO transactions this month.** The seeds stamp
      absolute dates when they first run; by 20 Aug the Rahmans' newest spend was
      13 July. The public `/graph` was rendering the household as **100% "Saved /
      Unspent"** with no red spend ribbons at all — on the live site, on the default
      persona.
- [x] **`scripts/refresh-demo-data.mjs`** rolls each demo tenant forward by whole
      months (and its temporal edges with it). Idempotent, scoped hard to the demo
      persona ids — a real household's dates mean something and are never touched.
- [x] Wired into `deploy/run-maintenance.ps1 -Task demo` + a daily `HoneyMoney-Demo`
      task in `install-maintenance-tasks.ps1`, so it cannot rot again.

### 🌊 Sankey stayed readable as vendors grow `[Technical]`
- [x] **Fixed: the landing column starved the middle one.** All three columns share one
      scale, so 27 vendors' worth of inter-node gaps squeezed every *bucket* bar below
      its label threshold — the couple's two private buckets, the whole point of the
      view, rendered as unlabelled stubs. Past 12 landing nodes the tail now folds into
      **"Other (n merchants)"**; totals and every ribbon width are unchanged.
      Matters beyond the demo: a real household has far more vendors than a seed does.

### 🧹 Vocabulary + artefacts
- [x] Copy swept of business framing: `/guide`, `/gallery`, i18n (6 locales; dead
      `gallery.biz*` keys removed, `gallery.couple*` added), `PLAN.md` §1.1/§13,
      `docs/USER_GUIDE.md` Example B, `DISCLAIMER.md`, `DEPLOY.md`, roster placeholder
      ("Name / staff…" → "Name…"), and a **`partner`** roster role.
- [x] Graph gallery refreshed: 2 new couple frames + the family and solo Sankeys
      re-shot (both changed — stale data *and* the fold). `docs/deck/graph_gallery/`
      README rewritten; the three deleted `g-business-*.png` links are gone.
- [x] `PLAN.md` §13 reframed: business is **roadmap (P3), narrated not demoed**.

> **Not done — needs a call.** The deck/summary PDFs still show the business persona
> and pre-pivot screenshots (§7 items 3–4 below). And `hscore` / `sst` / `forecast` /
> `directory` are built and typechecked but still have **no UI** — the H-Score even has
> its tables migrated and its adapter written. That is the obvious next build.

> **Live-data drift spotted, left alone:** the solo persona's member is named **"Chua"**
> (the seeded "Aisha" member was deleted and replaced via the roster UI, so her seeded
> transactions lost their attribution), and the family has a stray income source named
> **"HoneyMoney"**. Both are edits made through the app on the live instance, not code
> bugs — say the word and I'll reseed the persona cleanly.

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
- [ ] Add a `GEMINI_API_KEY` + test `/api/receipt` with a real TNG/MAE screenshot
- [ ] Register Telegram bot (@BotFather) + expose webhook via tunnel (`cloudflared`/`ngrok`) for the demo — **step-by-step in `docs/TELEGRAM_SETUP.md`**; only the bot token/secret are missing
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
- [x] **Mobile-first + installable PWA** (never forced) — manifest, icon, theme-color, responsive. Bottom install banner works on **both** Android (native prompt) and iOS Safari (Share → Add to Home Screen) as of 2026-07-15.
- [x] **In-app `/guide`** — how-to + privacy promise + disclaimer (`docs/DISCLAIMER.md`).

### Public showcase — hosting + onboarding (decided; see `DEPLOY.md`) `[Technical][Commercial]`
- Decision: **hosted PocketBase + Vercel** (no code change — app is env-driven) and **anonymous showcase → optional sign-up** (don't gate browsing behind an account).
- [x] **Production build verified** (`next build` green — 13 routes) → confirmed Vercel-ready.
- [x] **Reproducible PocketBase container** — `pocketbase/Dockerfile` + `fly.toml` (pins v0.39.6, bakes migrations, seeds all 3 personas on boot).
- [~] **Interim public URL live** via Cloudflare quick tunnel (temporary — needs the PC on). For a permanent URL: the 3 steps below.
- [ ] Host PocketBase (Fly.io via the Dockerfile, or PocketHost) → get an `https` `POCKETBASE_URL`.
- [ ] Import repo to Vercel (root = `web/`), set env vars, deploy → free `.vercel.app` URL (**first cut**). Buy + attach a domain later (2-min, no redeploy).
- [ ] Handle the shared-sandbox problem before wide sharing: nightly reseed **or** guard demo-tenant mutations **or** ephemeral per-visitor tenant.
- [ ] Telegram bot live (@BotFather + webhook) — the lowest-friction acquisition channel ("forward one receipt"). Code + guide ready (`docs/TELEGRAM_SETUP.md`); just needs the BotFather token in `web/.env.local`.
- [ ] Play Store later via TWA (PWA is ready) — needs the permanent URL + PNG icons + a $25 Play account. PWA "Add to Home Screen" already works with zero fees.
- [ ] P3: optional sign-up via PocketBase auth (bind user→tenant; gate persist/Telegram only, never the showcase).

### Business tier — P3 (next, after semi-final polish) `[Scalability][Commercial]`
- [ ] **Departments / subject-matter tagging** (`props.department`) → auto-adds a Department focus dimension.
- [ ] **Cashflow statement** — monthly inflow / outflow / net + runway, from the multi-month history.
- [ ] **Reporting** — per-department / person / category roll-ups; CSV/PDF export for an accountant.
- [ ] **Graph-management CRUD** — add income/bucket/department, set allocations, edit goals/obligations from the UI.
- [ ] Corporate anonymized-aggregate roll-up (k-anonymity, P4).

> **Scope discipline:** the household demo is the pitch centrepiece — one killer graph insight ("your food velocity moves your Savings goal 6 weeks later"). The business tier is **now demonstrable** (persona-aware graph, staff roster, business seeds) but the P3 items above (cashflow, reporting, CRUD) stay a **narrated + partially-built roadmap** until after semi-finals. Don't let business scope dilute the household story judges score first.

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
2. [ ] **Round-ups → Savings** (Raiz) — round each captured spend up, sweep the difference to savings.
3. [ ] **Goal countdown / ETA** (StashAway) — "House Deposit in ~14 months at this pace" from existing goal target/current.

Further backlog: waste/penalty & subscription radar (Rocket Money) · safe-to-spend-today (EWA anxiety, no lending) · net-worth via the unused `asset` node kind (Maybe) · auto-categorization rules (Firefly/Actual) · invite-a-partner referral loop · **name & brand the 3-bucket method** (à la YNAB's "Four Rules") · daily-yield nudge that refers to Versa/KDI (don't hold funds).

---

## 7. Next (do now) — **11 days to the 31 Aug artefact gate**

The 15 Aug application deadline has passed — confirm the portal submission actually
went in before working anything else. From here the gate is the **31 Aug working
artefact**. The app is live and the persona arc is now coherent; the risk is a set of
**stale artefacts** and four **built-but-unsurfaced** modules, not missing engine.

### 🔴 Blocking the submission
1. [~] **Chua Kia Wah's MyKad number** — the last eligibility field. Nothing else is
   outstanding on the team profile. *(Malaysian-citizen member confirmed.)*
2. [ ] **Register on the MAIC portal** — pack is ready (deck · summary · AI disclosure ·
   video · repo · live URL). See `docs/REGISTRATION.md`. **Do not leave this to the
   final week** — the 15 Aug gate is the 300-team cut.

### 🟠 Stale artefacts — the 2026-08-02 UI ships a different product than the pack shows
3. [ ] **Re-export the deck + summary PDFs.** Every landing-page screenshot in
   `docs/deck/` predates the 3-second hook: they show the old brand-only hero and the
   two-CTA layout that no longer exists. Judges compare deck to live app.
   → **pitch-deck** skill.
4. [ ] **Re-shoot the demo video / explainer.** `HoneyMoney_Demo_MAIC2026.mp4` (35s) opens
   on the old hero. The new opening is objectively stronger for a 3-minute run: the
   first shot can now be *type "kopi 6.50" → bucketed card in 3 ms*, signed out, no
   setup — which lands the technical, privacy and UX points in one take.
   → **demo-video** skill; `docs/deck/DEMO_SCRIPT.md` beat 1 needs rewriting.
5. [ ] **Refresh the graph gallery** (`docs/deck/graph_gallery/`) if any frame includes
   the dashboard header — that layout changed (mobile stacking fix).

### 🟡 Product — the next build
6. [~] **Couples hide/share** (§6.5 #1) — the enforcement shipped (`lib/privacy.ts`,
   wired through `/records`, `/graph` and the money view) and the couple persona
   demonstrates it. ⬜ Remaining: a **UI toggle** so a user can mark a bucket private
   themselves, instead of tier 3 being the only way in.
6b. [ ] **Surface what's already built.** `hscore.ts` + `hscoreData.ts` (+ migrated
   tables), `forecast.ts`, `sst.ts` and `directory.ts` all typecheck and none is
   imported by a page. The H-Score is the highest-value of the four and the closest
   to done.
7. [ ] **Finish the capture-friction pass** — the three deferred items from 2026-08-02:
   `FlexibleInput` still shows every field at once · a half-entered expense dies on
   navigation · verify buckets are seeded before a first capture can meet them.
8. [ ] **Validate the AI capture paths** against real Malaysian receipts/statements with a
   Gemini key (AI Studio free tier). Receipt breakdown + statement-photo multi-row are
   both shipped but unvalidated. *(On-device capture works token-free regardless.)*

### 🟢 Commercial (highest ROI on the 25% Commercial score)
9. [ ] **Draft the LOI + send to the first 3 HR contacts** — `docs/LOI_TEMPLATE.md`.
   One signed LOI is worth more to the score than any further feature.

### ⚙️ Ops
10. [ ] **Activate the crons** — set `ACCOUNT_PURGE_SECRET`, run
    `install-maintenance-tasks.ps1` elevated once. Until then deletes never auto-purge
    and nudges don't fire.
11. [ ] Commit or discard the in-flight static-site work left uncommitted on 2026-07-27
    (`scripts/build-static-site.mjs`, `deploy/pages/`, `web/src/app/{deck,gallery}/`,
    `.gitignore`, `DEPLOY.md`, `next.config.ts`, `package.json`, `SiteFooter.tsx`).
    `/gallery` is now load-bearing for the couple story, so this is no longer optional
    housekeeping — it is unreviewed code on the live site.

_Last updated: 2026-08-20_
