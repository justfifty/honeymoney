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

## ✅ Shipped — 2026-08-21 (evening) — the four-tab app: Record · Dashboard · H-Score · More

The demo proved the shape; the signed-in app still had the old five-item bar with a
raised centre capture button pointing at `/graph`. It now runs the same architecture.

- [x] **`/record` is the default landing** — capture is the only thing this app asks of
      a user every day, so it gets the first screen rather than a tab they have to find.
      Login, signup and join all now arrive there instead of `/dashboard`. It reuses
      `dashboard/AddTransaction` (→ `graph/SpendCapture`): a navigation change, not a
      second implementation.
- [x] **`/hscore` — the adapter finally has a page.** `lib/hscoreData.ts` had its
      collections migrated and its code written and was imported by nothing. It now
      renders through the *same* presentational components as the demo, so the score a
      judge sees at `/demo` and the score a user sees signed in cannot drift into two
      different products. `persist: true` when signed in — writing band state is what
      makes the 7-day hysteresis real, and the daily snapshot is what gives "what moved
      your score" a yesterday.
- [x] **`/more`** — goals, graph, records, import, household, ledger, account, guide,
      Academy, gallery. Its job is what it keeps *off* the other three.
- [x] **`/demo` is not a tab.** Someone with real data never opens it, so a fifth tab
      would be dead space on every screen for everyone who signed up. It stays public and
      is reachable from More.
- [x] **The raised centre capture button is gone.** When the first tab *is* capture, a
      floating action button for capture is a second door to the same room.
- [x] Desktop header and mobile tab bar now carry the identical four, so the two stop
      being different products at the `md` breakpoint.

### 🐛 Fixed while wiring it
- [x] **The score celebrated a number it had just disclaimed.** On a provisional score
      the ring greys out and says "not enough to be honest about" — and then the
      Thriving stars fired underneath it. Tier engagement and "what moved your score"
      are now gated on the confidence check; the provisional notice already names the
      next best action, which is to finish telling us what's missing.
- [x] `HScoreView` took a `previous` score and recomputed movement itself, which would
      have become a second source of truth beside the adapter's. It is now purely
      presentational — both callers pass the movement and the savings gap in.

---

## ✅ Shipped — 2026-08-21 (a public demo · H-Score on screen · SST done properly)

**The app had no way to be tried.** `/dashboard` on a signed-out visitor rendered the
seeded PocketBase tenant — which needed the origin machine awake, was a shared sandbox
one visitor could degrade for the next, and showed *a household* rather than *the
product*. There is now a real demo at **honeymoney.app/demo**.

### 🎬 `/demo` — public, no login, no backend `[Technical][Commercial]`
- [x] **The whole dataset is generated in the browser** and held in React state. That is
      what makes an unauthenticated public demo *safe* rather than merely convenient:
      no server-side state to corrupt, no account to guess into, no per-visitor cost.
      Edits are real — add a spend, delete a row, watch the ring move — and
      session-local, which the page **says** rather than leaves you to discover.
- [x] **Works with the network unplugged**, and is in the edge snapshot
      (`scripts/build-static-site.mjs` ROUTES), so it stays fully interactive when the
      machine serving the real app is off. It is now the only public CTA that does.
- [x] **Four Malaysian households, a year of ledger each, one per band** — every score
      state on screen without a toggle:

  | Household | Band | Score | The squeeze |
  |---|---|---|---|
  | The Azlans | Building | 31 | RM7,000 gross across four; **78% of net is must-paid** before food |
  | Nadia & Faiz | Steady | 54 | Two incomes, a mortgage, buffer barely past one month |
  | Suria | Strong | 70 | One salary, supporting her parents; the buffer is what's missing |
  | Hafiz & Lina | Thriving | 89 | Same kinds of loans, carried against more income |

- [x] **Scores are read back OFF each generated ledger**, never declared — the ring and
      the rows a visitor scrolls cannot disagree. Seeded PRNG (no `Math.random`), so a
      deck screenshot matches what a judge sees.
- [x] **`npm run check:demo`** asserts all four hold their band on **every day of the
      coming year** — currently **0 drift across 1460 day/persona combinations**. A demo
      that quietly slides out of Building next March is worse than no demo.
- [x] **Contributor attribution has its own dashboard block**, not a filter in settings:
      two people writing into one ledger, every row tagged with who logged it, and the
      month split between them. The thing single-user budgeting apps structurally can't do.
- [x] **The directory is identical across all four personas** — a visitor can switch
      Building → Thriving and watch the catalogue not change, which demonstrates
      "products are not score-gated" better than a paragraph promising it.

### 💛 H-Score, on screen at last `[Technical][ESG]`
- [x] The engine (`lib/hscore.ts`) already matched the spec exactly — five components,
      the anchor curves, bands, 90-day window, 12-month amortisation, 7-day band
      hysteresis, confidence gate. It had **no UI**. It has one now.
- [x] **Fixed order**: ring + band → five sub-score bars → what moved → goals →
      (directory, reachable *only* by tapping a goal, so "here is a product" stays
      downstream of "here is what you're trying to fix").
- [x] **Engagement matched to tier** — confetti at the bottom tier is condescending.
      Building gets a named ringgit gap (*"RM388/month more into Savings moves you to
      Steady"*) plus a logging streak; Steady a buffer meter ticked at 1/3/6 months;
      Strong a recap and a five-axis radar; **only Thriving animates**.
- [x] **"What moved your score" is a template over the largest sub-score delta** — never
      an LLM. It cannot hallucinate a financial claim, which is the same invariant the
      rest of the app runs on.

### 🧾 Record — nothing is auto-committed `[Technical][Relevance]`
- [x] Four ways in, primary action above the fold with no scroll. Every capture lands in
      a **draft** with per-line confidence, an editable line list, bucket, an
      annual/recurring flag, and a provenance line (image SHA-256 + parser version) so a
      re-parse is auditable against the original.
- [x] **SST done properly** (`lib/sst.ts`, wired at last): 19.60 + **1.96 service charge,
      labelled as the merchant's own and NOT a tax** + 1.29 service tax at the protected
      **6% F&B rate on subtotal + service charge**, rounded to 5 sen = **22.85**.
      Mislabelling the service charge as tax breaks the total on most restaurant receipts.

### 🐛 Four bugs the browser found that reading wouldn't have
- [x] **The site-wide `BottomNav` stacked on the demo's own tab bar and swallowed every
      tap meant for it.** `ChromeGate` now withholds global chrome from routes that ship
      their own navigation.
- [x] **The receipt button promised RM19.60 and committed RM22.85** — and unticking a
      line didn't recompute the tax. The bill now derives from the ticked lines, so the
      figure on the button is always the figure written.
- [x] **Two directory categories had no listings**, so a goal could open a dead end.
      Added real BNM/SC/PIDM-regulated entries, and **removed the privacyDiscipline →
      "budgeting tools" mapping entirely**: staying inside your own cap is a habit and
      there is no product that sells it to you. That goal now simply doesn't route.
- [x] **The trend caption asserted "that's Raya"** for whatever month came out highest —
      wrong, since the family's peak is June road tax. It now names the actual cause.

> **Two things to check before this is judged.** The new UI strings are **English-only**
> (they fall back cleanly, but MS/ZH/TA/HI users get English on these screens). And the
> directory now **names real regulated providers** — descriptions say what each product
> *is* and quote no rates, but publishing a directory of licensees is outward-facing and
> wants a human sign-off before it's in front of judges.

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

## ✅ Shipped — 2026-08-21 (uptime: the site now survives a reboot, a crash, and a flat battery)

The site had a watchdog on paper and none in practice. `deploy/install-autostart.ps1`
was written on 14 Jul to add a boot trigger and a 5-minute self-heal — and had never
once run successfully. It died on line 33: `[TimeSpan]::MaxValue` serialises to
`P99999999DT23H59M59S`, which Task Scheduler rejects outright, so
`Register-ScheduledTask` threw and the *old* logon-only task stayed live. `stack.log`
had been telling us for six weeks — one start per day, always at sign-in time
(08:05 · 08:15 · 22:23 · 11:00), never a watchdog tick.

### 🩺 What was actually running `[Technical]`
- Task `HoneyMoney`: **one** `AtLogOn` trigger · `LogonType Interactive` ·
  `RunLevel Limited` · **no repetition**. A 3am Windows Update reboot left the site
  dark at the lock screen until someone signed in; any component that died stayed dead.
- Hibernate-on-battery after 5h (`HIBERNATEIDLE` DC `0x4650`).
- Apex still served by the laptop — every response carried `x-powered-by: Next.js`.

### 🔧 Fixed
- **`install-autostart.ps1`** — an *omitted* `RepetitionDuration` is what means
  "indefinitely". Task is now `BootTrigger + LogonTrigger`, both `PT5M`, `S4U`,
  `RunLevel Highest`.
- **`deploy/install-all.cmd`** — one right-click → Run as administrator installs all
  four tasks (stack watchdog + Purge/Nudge/Demo). Idempotent.
- **`deploy/verify-uptime.ps1`** — read-only. Answers "if this laptop dies, what
  survives?" across three groups: local stack · self-healing · always-on edge.
- **Hibernate-on-battery → never** (`powercfg`, DC index `0`).

### ✅ Proven, not assumed
The watchdog was tested by killing `cloudflared` and watching it come back:

```
cloudflared alive after kill?      False
cloudflared alive after task run?  True
11:36:57  cloudflared not running -> starting
```

### 💸 Free-tier check (it is genuinely $0)
Tunnel is unmetered; Pages static requests are "free and unlimited"; custom domains
are free (100/project). The one ceiling: `_worker.js` is **advanced mode**, so every
request invokes a Function — including assets, via `env.ASSETS.fetch()` — against the
shared **100,000 requests/day** Workers+Functions free allowance. At ~25 requests per
page load that is ~4,000 pageviews/day. If it ever binds, a `_routes.json` excluding
`/_next/static/*` and `/gallery/*` makes those bypass the worker and stop counting.

### ⬜ Still open — the one thing that isn't automatable
`verify-uptime.ps1` is green everywhere except **APEX FRONTED BY PAGES**. See §7 #12:
wrangler 4.92 has no `pages domain` command, and the API path needs `Zone:DNS:Edit` to
replace the tunnel's CNAME on the apex — the local OAuth token has `zone (read)` only.
Four dashboard clicks. Until then the always-on snapshot exists but fronts nothing, and
the laptop is still a single point of failure for the *whole* site rather than just
`/dashboard`.

---

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

## 6.6 Implementation brief — 2026-08-22 · eleven changes, one release

**Spec: [`docs/20260822_honeymoney-implementation-brief.md`](docs/20260822_honeymoney-implementation-brief.md).**
This section is the *board*; the brief is the *spec*. Where they disagree the brief wins —
it carries the reasoning, the trade-offs and the acceptance detail that won't fit here.

### Picking this up in a fresh session (mobile Claude, or a new desktop session)

1. Read the brief's **"How to use this brief"** header first — it holds the ordering rules.
2. Work the **order below, not the task numbers.** The numbers are the change request's;
   the order is the dependency graph.
3. **Read the existing implementation before writing code.** Several tasks assert things
   about the current architecture that may not hold. A contradiction is a finding to
   report, not something to code around.
4. 🛑 marks a **stop-and-report** point — a decision the brief deliberately leaves to the
   user. Do the work up to it, then stop and ask. Don't pick on their behalf.
5. One task per session where possible. These interlock; a half-finished migration
   spanning two tasks is the expensive failure mode here.

**Standing constraints, every task:** thin-server / fat-client — computation in the
browser, PocketBase stores and serves · no new server-side runtime dependencies · no paid
third-party services (user's own key, or local Ollama) · **do not change H-Score
computation as a side effect of anything** — if a task appears to need it, stop and flag ·
every schema change ships with a migration, and existing records must keep loading.

**Release shape:** Tasks 5, 3, 4, 1, 6, 7, 8, 9, 10, 11 ship **together as one release**.
Task 2 is multi-week with its own data model — **spec only, no code**, until its Open
Decisions are answered.

### The order

**1 · Task 5 — Primary nav must stay visible at all widths** `[Relevance]`
- [ ] Record · Dashboard · H-Score · More vanish as the window narrows — highest-severity
      item in the brief, because it breaks the app at exactly the phone width most users
      are on.
- [ ] **Diagnose before fixing.** Name the cause (breakpoint utility · overflowing no-wrap
      flex · broken overflow menu · fixed-width logo eating the space) before touching it.
- [ ] Reachable at 320px. None of the four may ever collapse into an overflow menu —
      `More` *is* the overflow menu. Icon-only + accessible label at narrow widths.
- [ ] 44×44px targets · active state distinct by more than colour · safe-area insets ·
      `<nav>` + `aria-current="page"` · visible keyboard focus.
- [ ] Verify at 320 / 375 / 768 / 1024 / 1440 **and on mid-session resize**, not just fresh load.
- 🛑 A bottom tab bar at narrow widths reaches a thumb far better. Report cost, don't implement.

**2 · Task 3 — Remove the Speak function** `[Technical]`
- [ ] Remove entirely, not behind a flag. Changelog rationale: the Web Speech API handles
      Manglish and BM/English code-switching poorly — a structural API limit, not tuning.
- [ ] Mic permission must stop being requested **anywhere**. Verify no prompt fires.
- [ ] Grep the identifiers **before** deleting: check nothing reads a transcript field,
      assumes a live mic stream, or branches on a "voice input" mode.
- [ ] Stored voice flags/transcripts stay put — stop reading them, write no destructive migration.
- ⚠️ *For the record:* this discards the verified voice work shipped 2026-07-14 (Unicode-first
      parser, 11/11 across en · ms · zh · zh-Hant · ta · hi). The brief's forward path is
      audio → the user's own key (Gemini takes audio natively) on the Task 2 BYO-key rails.
      **Not now.**

**3 · Task 4 — Viewable attachments** `[Relevance]`
- [ ] Receipt scans can't currently be opened. Thumbnail in list + detail via PocketBase
      `?thumb=100x100` — **not** client-side generation.
- [ ] Full-screen viewer, full-res loaded only on open: pinch- and double-tap-zoom
      (non-negotiable — receipt text is unreadable fit-to-screen), rotate, pan, swipe
      between attachments, clear close affordance.
- [ ] Real loading and error states with retry — not a blank frame. `Esc` closes, arrows move.
- [ ] Build the **layout seam** for Task 2's line items beside the image (side-by-side wide,
      stacked narrow). Leave the panel empty for now.

**4 · Tasks 1 + 6 together — record kinds and attribution** `[Technical][Scalability]`
> **One design, one migration.** Both change the Record data model; done separately they
> mean two migrations over the same records and a reconciliation afterwards. Read both
> brief sections fully before writing either.

*Task 1 — sign-based categorisation*
- [ ] Replace `From bucket` + the long category list with `+` / `−`.
      `+` → Income · Savings · Others. `−` → Must-paid · Spendings · Others.
- [ ] **Three internal kinds — `inflow` · `outflow` · `transfer` — behind two buttons.**
      `+ Savings` is a **transfer**, not income; destination inferred, not asked.
      🛑 Report what H-Score does with savings-categorised records today *before* changing
      the input shape — this is the brief's prime suspect for an existing bug.
- [ ] `Others` appears on both sides and must persist as **distinct keys** (`income_other` /
      `expense_other`). Never a shared `other`. Cheap now, painful to migrate later.
- 🛑 Dropping `From bucket` is only safe if category → bucket is deterministic. If any bucket
      can receive from more than one category, **stop and report** — removing the field would
      relocate the ambiguity, not remove it.
- [ ] `+` orange / `−` dark grey — deliberately **not** green/red (red-green deficiency is the
      common one). Do not "correct" this back. Always render the glyph alongside the colour:
      **identifiable in greyscale**. Darker orange (~`#B45309`) for text and thin strokes;
      bright brand orange for fills and chips. 4.5:1 text, 3:1 interactive — verify, don't assume.
- [ ] Migration maps existing records onto the kinds. State the mapping assumptions explicitly;
      flag anything non-deterministic rather than guessing.

*Task 6 — persona context and attribution*
- [ ] **Split the two concepts.** Household composition (individual · couple · family) is a
      **setting**, established at onboarding and editable later, shown at the top of Record as
      *context, not a control*. **Attribution** — whose this record is — is the per-record
      field, its options derived from composition. Individual → the control does not render,
      occupies no space, adds no tap.
- 🛑 **The schema decision:** attribution has two independent axes — **who paid** vs **who
      benefited**. One axis is acceptable for v1, but choose deliberately and **name the field
      for what it actually holds** (recommendation: who paid). Never `persona` or `owner`.
      Leave a schema seam for the second axis.
- 🛑 **Privacy stance, picked explicitly and stated in the PR:** (1) fully transparent ·
      (2) individual private by default, joint shared *(recommended, with a non-hidden
      indicator)* · (3) per-record toggle. **Enforced in PocketBase collection rules,
      server-side** — client-side filtering is not privacy. Not negotiable whichever wins.
- [ ] Attribution + `+`/`−` is a **remembered default**, pre-selected, overridable in settings.
      The common case — one person logging their own routine spending — stays zero extra taps.
- [ ] **Partner-to-partner transfer** ("I paid you back RM200") = `transfer` A→B and **nets to
      zero at household level**. Confirm no double-count before implementing. Check that
      `+ Savings` in a couple household doesn't collide attribution with savings destination.
- 🛑 Report whether H-Score computes at household or per-person level. **Do not change it.**
- [ ] Migration: existing records → recording user as source, marked **migrated-default, not
      user-asserted**. Do not backfill a joint-vs-individual guess; reclassifying is a user action.

**5 · Task 8 — H-Score: show where the number came from** `[Technical][ESG]`
- [ ] Three tap-through levels: **the score** (period covered + record count) → **each
      criterion** (sub-score, weight, the actual figure, the arithmetic in one line —
      *"Savings rate 12% → 14 of 20 points"*) → **the records that fed it**, filtered and
      ready to inspect. That last level is what turns the score from an opinion into
      something checkable.
- [ ] **State what would move it** — computed and descriptive, same register as Ask Honey,
      never an instruction to act.
- [ ] **Say what's missing.** A criterion low from *thin data* must be visually distinct from
      one low from *the household's finances*. The current display probably conflates them.
- [ ] Methodology readable in-app: thresholds, weights, period. A score is an opinion
      expressed as a number; the weights encode a view.
- [ ] **Rename `Privacy discipline` from the code, not from the label** — read what it actually
      computes first; a name/computation mismatch is a finding to surface, not to paper over.
      Then check all five: name it after what the user *does or has*; no `discipline` /
      `hygiene` / `health` / `index`; one plain line beneath each. **Verify every name renders
      naturally in BM, Chinese and Tamil** — abstract English compounds translate badly, and
      often into something more obscure than the English.
- [ ] Document *and display* which record kinds and categories feed each criterion, and which
      are ignored. 🛑 **Transfers are not income** — verify what the current implementation does
      and report. Irregular income (bonus, freelance, festive, commission) is normal in
      Malaysian households and needs a **stated smoothing window**, trailing multi-month,
      visible to the user. Uncategorised and `Others` records must not silently vanish — show
      a count of unscored records with a route to categorise them.
- [ ] **One computation, called the same way** by the H-Score page, the Dashboard and Ask Honey.
      No parallel implementation, no rounding drift. If the number ever disagrees between two
      surfaces, users will trust neither.

**6 · Task 9 — Goals under `More`** `[ESG][Commercial]`
- [ ] Name · target amount · target date · progress, all editable.
- [ ] **Progress derived by default** — the sum of `transfer` records linked to the goal — with
      a **separately labelled** manual adjustment for savings that happened outside the app.
      Always show *"RM8,000 tracked + RM2,000 you added manually."* Silently mixing the two
      produces a number nobody can reconcile later.
- [ ] Changing a target must not retroactively alter recorded progress · keep a light history of
      target changes (a goal repeatedly revised down is real information) · progress past 100%
      is a **success state, not an overflow bug** · deleting a goal **unlinks** records, never
      deletes them, with a clear warning and confirm.
- [ ] A `transfer` can be assigned to a goal at entry — optional; an unassigned savings transfer
      is valid and lands in general savings. A record belongs to at most one goal.
- [ ] Goals carry attribution too — **reuse the Task 6 stance**, don't invent a second one.
      A shared goal one partner can silently retarget is a product problem before a technical one.
- 🛑 **Does goal progress feed H-Score?** There's an argument it should, and a double-counting
      risk against any savings-rate criterion. Report the interaction and stop for a decision.
- *Goals' Dashboard and chart surfaces are built in Task 7 — but design this schema now, because
  the Sankey needs somewhere for savings transfers to terminate.*

**7 · Task 11 — Chart names and explanations: one source, used everywhere** `[Technical][Commercial]`
- [ ] The Gallery's names and explanations are the strongest writing in the app and exist
      **only there**, while Dashboard and demo use their own labels. Extract into **one shared
      chart registry**: stable id, display name, one-line description, the longer "when to use
      this", icon.
- [ ] Every surface consumes it — Dashboard, chart switcher, demo showcase, settings,
      translation catalogue. A chart's name is defined in exactly one place, or they drift
      apart again within a few releases. **The Gallery's existing names win**; change the
      other surface.
- [ ] Reconcile the Task 7.4 names (Sankey · Progress Bars · Tree Diagram · Treemap · Node-Link ·
      Horizontal Bar · Summary Metrics) against the Gallery and **use the Gallery's wording** —
      those came from the change request, not the Gallery. Report any chart in 7.4 with no
      Gallery entry, or a Gallery type absent from 7.4, rather than resolving it silently.
      The *priority order* stands regardless of what they end up being called.
- [ ] Make the one-line description reachable from every chart header — **most of all on the
      Sankey**, the default view and the least familiar diagram type to a general audience.
      A user meeting it cold with no explanation bounces off the app's strongest visualisation.
- [ ] Registry entries are **translation keys, not literal strings**. Flag descriptions that
      don't render naturally in BM / Chinese / Tamil instead of shipping a literal translation.
- [ ] **The demo is missing the Graph Showcase entirely** — reuse the Gallery component and the
      registry (never a demo-specific copy — that recreates the drift this task exists to fix),
      all types rendering on the Task 7.5 seed data, explanations included, **works with no
      login**, **deep-linkable per chart**, chart libraries lazy-loaded per view rather than
      shipping all seven renderers up front. Test on a 375px phone over mobile data.

**8 · Task 7 — Dashboard** `[Technical][Relevance]`
> **Do not start before 5, 1, 6, 8, 9 and 11 have landed.**
- [ ] The Dashboard's persona control is a **filter**; Record's is **data entry**. Same shared
      component and label vocabulary so `Partner's` means and looks the same in both — but
      **separate state**. Dashboard adds **All / Household**, the sensible default. Individual
      composition → doesn't render, exactly as Task 6.
- 🛑 The Dashboard filter **must not write back to Record's default.** The concrete failure:
      filter to `Partner's` to review their spending, tap Record, log your own coffee against
      your partner. Silent mis-attribution in a couples app is worse than an extra tap. Any
      carry-over must be visibly and unmistakably pre-selected, never quietly applied.
- [ ] **Remove `Add a spend`** — Record is a primary destination and always reachable after
      Task 5, so the duplicate entry point earns nothing. Editing stays, and **an edit opens
      the same record editor component the Record flow uses**. No inline mini-form: a parallel
      path bypasses the Task 1 kind rules and the Task 6 attribution and privacy rules, and
      drifts further with every subsequent change.
- [ ] Edits recompute H-Score and refresh affected charts; optimistic updates reconcile against
      the server result and fail visibly. Delete needs a confirm — charts make mis-taps easy.
      A user cannot edit a record they cannot see, and **collection rules, not the UI, enforce that**.
- [ ] **No chart may break, blank out or disappear at any item count** — which is not the same
      as rendering every item. Report the current failure mode first (hidden below a threshold?
      overflowing its container? erroring on empty?), then handle all three regimes for *every*
      chart type: **zero** → a real empty state with a route to Record, not a blank panel or a
      zero-height SVG · **one or two** → must render, with sensible minimum geometry ·
      **many** → aggregate to top N by value plus a single **inspectable** `Other`, N tuned per
      chart type and viewport.
- [ ] Default order: **Sankey (default view)** · Progress Bars · Tree Diagram · Treemap ·
      Node-Link Diagram · Horizontal Bar Chart · Summary Metrics.
- [ ] **Sankey must consume the three record kinds correctly.** A `transfer` — savings, or a
      repayment between partners — is **not** an outflow. If transfers render as flows leaving
      the household, the diagram shows money disappearing that never left, which is exactly the
      misreading a household finance app cannot afford. Terminate them at an in-household node
      (Task 9 goals are the clean answer) or exclude them — and **state the choice on the chart**.
- [ ] **Sankey at 375px is the risk to design for.** Options in preference order: reduce to two
      levels and aggregate hard at narrow widths · horizontal scroll with a pinned label column ·
      fall back to Horizontal Bar with Sankey one tap away. Pick one, verify at 320px.
- 🛑 Tree Diagram, Treemap and Node-Link are three renderings of the same hierarchy, and
      Node-Link is high build cost for low household-finance insight. Seven types is a large
      surface to maintain and translate. Add lightweight local instrumentation of which views
      actually get opened, so this gets pruned on evidence later rather than argued about.
- [ ] **Demo seeds must exercise all seven** meaningfully, not merely without error: category
      depth so the hierarchy charts show more than one level · at least one inflow, one outflow
      and one **transfer** so the Sankey demonstrates the distinction · a **couple** household
      with records across both partners and joint so Task 6 attribution is visible · plausible
      Malaysian figures and merchant names. **No chart in the demo may show an empty state.**
- [ ] **Live translation across all pages** — changing language re-renders the current view
      immediately, no reload, no navigating away and back. Strings resolved reactively at
      render, not captured at mount · every user-visible string in the catalogue including
      error, empty and loading states · choice persisted and `<html lang>` updated ·
      `Intl.NumberFormat` with `MYR` and `Intl.DateTimeFormat`, never hand-formatted. The two
      usually missed: **chart labels, axis ticks, legends and tooltips including text rendered
      into SVG** (charts draw once and never re-translate — verify with a chart open), and
      **category and persona names**, which may be stored values rather than keys. Decide
      whether user-created categories translate at all, and be consistent. Test the full
      language set, not English plus one.
- [ ] **Ask Honey — "what if?"** *(highest-value item in the brief, and the one with the most
      ways to go wrong — read the whole section before designing)*
  - [ ] **The model never does arithmetic.** Three stages: **parse intent** (model → a small
        typed object, validated before use) → **compute** (deterministic, client-side, the
        *same engine that computes H-Score*) → **narrate** (the model is handed the numbers and
        told to explain them, never to derive them). Every number in the output traces to
        stage 2. A hallucinated affordability figure is worse than no answer — it will be
        believed and acted on.
  - [ ] **Stage 2 must work with no model at all** — no key configured, the answer renders from
        a template. Less conversational, equally correct. AI improves phrasing; it is not
        load-bearing.
  - [ ] "Can I afford a TV?" carries no price — **ask for one**. Never guess a typical price and
        never look one up: that turns a budgeting tool into a product recommender, a different
        product with a different risk profile.
  - [ ] **Answer with consequence, not verdict** — *"…would take your emergency buffer from 2.4
        months to 1.6, and your H-Score from 72 to 64."* Not "you should buy it", "you can't
        afford it", or "finance it over 12 months instead".
  - [ ] **Scope, held firmly.** In: affordability arithmetic, spending pattern summaries, budget
        scenario projection, savings-goal timing, H-Score explanation — all from the user's own
        records. Out, declined and routed to the existing regulatory-safe product directory:
        which loan / insurance / investment product, whether to invest, debt restructuring, tax
        positions, anything needing knowledge of products the user doesn't hold. Constrain
        **both the system prompt and the intent parser's allowed types**. Persistent, visible
        line in the chat surface: arithmetic on your own records, not financial advice — not
        buried in settings.
  - [ ] **Privacy — the leak is easy to write by accident.** Honey sees only the records the
        logged-in user may see under Task 6; reuse the same permission filter as the record
        list. The natural implementation passes "the household's data" and quietly exposes a
        partner's private records through a conversational side channel. **Verify by having
        partner B ask a question only answerable from partner A's private records.**
  - [ ] **Minimise what leaves the device:** aggregates, not the ledger — monthly income,
        must-paid total, average discretionary, savings rate, buffer in months, H-Score and its
        components, category-level totals. **No merchant detail.** Where one specific record
        genuinely matters, send that one. BYO Gemini key or local Ollama, no key held by us,
        explicit first-use consent naming what is sent and where. Ollama is the answer for
        users who won't send household finances to Google — not a fringe concern here.
  - [ ] **Be honest about thin data** — a confidence signal from history depth and variance,
        stated plainly (*"based on only 3 weeks of records, so treat this as rough"*), and a
        minimum history below which Honey declines to project at all and says why.

**9 · Task 10 — Import under `More`** `[Technical][Commercial]`
- [ ] **Baseline first:** `<input type="file" multiple>` works everywhere — build that path
      first and make it complete on its own. Then enhance: `webkitdirectory` for folder
      selection, and `showDirectoryPicker` which is **Chromium-only, absent on Firefox and on
      iOS Safari entirely**. Feature-detect and degrade; never gate import behind it. For a
      Malaysian consumer PWA, iOS users are not a rounding error. Persistent folder handles go
      in IndexedDB with permission re-requested on return — browsers drop these silently.
- [ ] **CSV first**, then OFX/QIF if cheap. No per-bank parsers — Maybank, CIMB, Public Bank,
      RHB and Hong Leong share no format, and hardcoded parsers rot as banks change exports.
      Build a **column-mapping step** instead: show the file's columns, map date / description /
      amount / balance once, remember it per source so repeats are one tap.
- [ ] Format traps, handled explicitly: ambiguous date order (`03/04/2026` differs between
      exports — infer from the file and **confirm with the user**, never assume) · debit and
      credit as separate columns vs one signed column · thousands separators · trailing
      `CR`/`DR` markers.
- [ ] **Import is a proposal, never a direct write.** Preview before commit, with the Task 1
      kind and Task 6 attribution assigned and **bulk-editable**. An import that silently
      creates 400 records with the wrong attribution in a couples app is a genuine mess to
      unwind by hand.
- [ ] **Deduplicate** — hash date + amount + normalised description into a stable content key,
      flag probable duplicates in the preview, default to skip. Re-importing an overlapping
      date range is the most common thing users do. Reuse the SHA-256 approach from SiteShrimp.
- [ ] **`import_batch_id` on every record, plus one-action rollback of the whole batch.** Cheap
      now; the difference between a recoverable mistake and a support conversation.
- [ ] Categorisation is a **suggestion**: map obvious merchant patterns, mark low-confidence,
      let the user bulk-correct in the preview.
- [ ] **Nothing from a bank file goes to any model** — including the user's own key, and
      including for column mapping. A statement is the most sensitive file a user owns: full
      merchant history, balances, account identifiers. Column mapping is a UI problem, not an
      inference problem.
- [ ] Photo / bulk import **defers with Task 2** — same extraction pipeline, never a second one.
      When it lands: throttled serial queue with backoff (free-tier quotas die on 40 receipts at
      once), progress, pause and resume across reload, one shared review preview.

**10 · Task 2 — Receipt line-item extraction — 🛑 SPEC ONLY, NO CODE** `[Technical]`
- [ ] Multi-week feature with its own data model. **Write the spec, then stop for review.**
      If a session reaches this task, it produces a written spec, not an implementation.
- [ ] Tiered, all cost-free to the user: **VLM on the user's own key** (Gemini Flash's free tier
      extracts line items well and returns structured JSON, removing the parse layer entirely)
      → **local Ollama vision** (Qwen2.5-VL / MiniCPM-V, desktop-only — *a requirement, not a
      nice-to-have*, for users who won't send household receipts to Google) → **`tesseract.js`**
      WASM fallback (won't reliably give line items, but usually captures the total, so offline
      capture still works). **Rejected: server-side Python/Tesseract on DOM Cloud** — poor fit
      for the thin-server architecture, and mediocre on faded thermal paper wherever it runs.
- [ ] Malaysian specifics: **SST is inconsistent across merchants** — a line item, a footer,
      absent, or inclusive in displayed prices; handle all four. **5-sen rounding means line
      items legitimately will not sum to the total** — correct behaviour, not an error.
      Reconcile `sum(items) + tax + rounding == total` at tolerance **±0.05**; on mismatch flag
      for user review — never silently accept, never silently reject.
- [ ] **Extraction produces a proposal, never truth** — pending state, per-field confidence,
      user confirms before anything reaches the ledger, low-confidence fields surfaced visually
      so review effort concentrates where it's needed. A 30-item grocery receipt that silently
      mis-parses two items is worse than no extraction: the user trusts it and stops checking.
- [ ] Downscale client-side to **1600px long edge, JPEG q0.8** (~250KB, still OCR-readable) and
      keep *that* as the stored original — never the raw camera file. Receipt images will
      otherwise dominate PocketBase storage far faster than transaction data ever will.
- 🛑 **Open decisions to resolve before any code:** (1) does a receipt produce **one categorised
      transaction with itemised detail attached, or can individual items carry their own
      categories**? Per-item is where the analytical value sits — a supermarket trip is groceries
      *and* household *and* a bottle of wine — but it's a lot of taps unless items auto-categorise
      and the user only corrects outliers. *This determines the data model; everything waits on
      it.* (2) how line items interact with the Task 1 kinds — presumably all `outflow`, but a
      refund line breaks that. (3) does H-Score consume line-item detail, or only the total?

### Definition of done — the release (5, 3, 4, 1, 6, 7, 8, 9, 10, 11)

- [ ] All four nav destinations reachable at 320px, verified **on resize** as well as fresh load
- [ ] No microphone permission prompt fires anywhere in the app
- [ ] Attachments open, zoom and rotate on both touch and pointer input
- [ ] Record type is identifiable **in greyscale**
- [ ] Individual-composition users see no attribution control and gain no extra taps
- [ ] Record privacy enforced by PocketBase collection rules, **verified by direct API call**,
      not through the UI
- [ ] A partner-to-partner transfer nets to zero at household level, and does not render as an
      outflow in the Sankey
- [ ] Every H-Score criterion taps through to the records that produced it
- [ ] No criterion is named in a way a user can't interpret — **in any supported language**
- [ ] A savings transfer is not counted as income by any criterion
- [ ] A criterion low from missing data is visually distinct from one low from the finances
- [ ] Goal progress reconciles to linked records, with manual adjustments shown separately
- [ ] Every chart renders at 0, 1, 2 and 200+ items without breaking, at 320px and above
- [ ] Dashboard edits go through the same editor component as Record, and recompute H-Score
- [ ] Switching language re-renders the current page immediately, **chart labels included**
- [ ] Each chart's name is defined in exactly one place, identical on Dashboard, Gallery and demo
- [ ] Import works on iOS Safari with no folder-picker support
- [ ] A re-imported overlapping date range creates no duplicates; a batch rolls back in one action
- [ ] No bank file contents are sent to any model
- [ ] The demo shows the Graph Showcase with explanations, without login — all seven types, no
      empty states
- [ ] Ask Honey answers an affordability question with correct arithmetic and **no model configured**
- [ ] Every figure Honey states matches the H-Score page and the Dashboard for the same period
- [ ] Partner B cannot obtain partner A's private records by asking Honey
- [ ] Existing records load and display correctly after migration, with migrated attribution
      marked **default, not asserted**
- [ ] No new server-side dependencies
- [ ] H-Score output unchanged for unchanged input — **except** where Task 8 identifies an
      existing bug, which is **reported, not silently fixed**

---

## 7. Next (do now) — **9 days to the 31 Aug artefact gate**

The 15 Aug application deadline has passed — confirm the portal submission actually
went in before working anything else. From here the gate is the **31 Aug working
artefact**, and the artefact is in good shape: the persona arc is coherent, there is a
public demo that works with the origin machine off, and the H-Score is on screen. The
remaining risk is **stale deck artefacts** and the fact that the demo proves shapes the
**signed-in app doesn't have yet**.

> **Product build work now lives in §6.6** — the 2026-08-22 implementation brief, eleven
> ordered changes covering exactly that gap (nav, Record data model, attribution, H-Score
> traceability, Goals, the Dashboard rebuild, chart registry, Import). Start there and work
> its order. This section keeps the competition-gate items: submission, artefacts, commercial,
> ops. Where a §7 item is superseded, it says so and points at the task.

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

> **→ §6.6 is the build board.** Items 6c, 6d, 7 and 8 below are folded into it; they stay
> here only to record what was already known. Item 6 is now a **decision the brief forces**,
> not an independent task.

6. [~] **Couples hide/share** (§6.5 #1) — the enforcement shipped (`lib/privacy.ts`,
   wired through `/records`, `/graph` and the money view) and the couple persona
   demonstrates it. ⬜ Remaining: a **UI toggle** so a user can mark a bucket private
   themselves, instead of tier 3 being the only way in.
   → **§6.6 Task 6 subsumes this.** Its privacy stance (options 1/2/3) covers per-record
   visibility and must be enforced in **PocketBase collection rules**, not just `privacy.ts`.
   Settle the stance there and build one toggle, not two.
6b. [~] **Surface what's already built.** ✅ `hscore.ts` + `hscoreData.ts` are live on
   `/hscore` for real households; `directory.ts` renders from the H-Score goals.
   ⬜ `sst.ts` is still only exercised by the demo's sample receipt — wire it into the
   real `/api/receipt` path. ⬜ `forecast.ts` remains imported by nothing.
6c. [x] ~~**Port the demo's shape into the real app**~~ — shipped 2026-08-21 (evening).
   Record · Dashboard · H-Score · More on both header and tab bar, `/record` as the
   default landing, `/hscore` wired to `hscoreData.ts`, `/demo` reachable from More.
   ⬜ Still open from that spec: **the Dashboard has not been rebuilt** — contributor
   split and the editable-history view exist in `/demo` and `/records` but the real
   `/dashboard` is unchanged. And `forecast.ts` is still imported by nothing.
   → **superseded by §6.6 Task 7**, which specifies the rebuild in full.
6d. [ ] **Translate the new UI.** ~90 new `hscore.*` / `dir.*` / `demo.*` / `cap.*`
   keys are **English-only**. They fall back cleanly, so nothing is broken — but a
   Malay-first judge opening `/demo` reads English.
   → **do this inside §6.6 Task 7's translation pass**, not before it: Task 8 renames the
   H-Score criteria and Task 11 turns every chart name and description into a key. Translating
   now means translating twice.
6e. [ ] **Sign off the product directory.** It now names real BNM/SC/PIDM-regulated
   providers (AKPK · ASNB · EPF · PIDM · BSN · PPA · Etiqa · Prudential BSN · Takaful
   Malaysia). No rates are quoted and nothing is ranked, but this is outward-facing
   and wants a human check before judging.
7. [ ] **Finish the capture-friction pass** — the three deferred items from 2026-08-02:
   `FlexibleInput` still shows every field at once · a half-entered expense dies on
   navigation · verify buckets are seeded before a first capture can meet them.
   → **fold into §6.6 Tasks 1 + 6**, which rebuild the Record input anyway. "Every field at
   once" is largely what the `+`/`−` toggle and the remembered attribution default remove.
8. [ ] **Validate the AI capture paths** against real Malaysian receipts/statements with a
   Gemini key (AI Studio free tier). Receipt breakdown + statement-photo multi-row are
   both shipped but unvalidated. *(On-device capture works token-free regardless.)*
   Also: **bank statement PDFs need an explicit password prompt** — Maybank, CIMB and
   others ship them locked to IC or DOB.
   → validation is still worth doing now; the **rebuild** of these paths is §6.6 Task 2
   (spec only) and Task 10. The locked-PDF password prompt belongs to Task 10's import flow.

### 🟢 Commercial (highest ROI on the 25% Commercial score)
9. [ ] **Draft the LOI + send to the first 3 HR contacts** — `docs/LOI_TEMPLATE.md`.
   One signed LOI is worth more to the score than any further feature.

### ⚙️ Ops
10. [x] ~~Activate the crons~~ — registered 2026-08-21 via `deploy/install-all.cmd`
    (Purge 03:00 · Nudge 09:00 · Demo 03:30). Still set `ACCOUNT_PURGE_SECRET` in
    `web/.env.local` or purge/nudge stay safe no-ops.
11. [x] ~~Commit or discard the in-flight static-site work~~ — committed 2026-08-20
    (`89163e8`) and the Cloudflare Pages project is live at `honeymoney-e84.pages.dev`.
12. [ ] **Point honeymoney.app at Pages.** ← the last laptop-dependency. The apex
    still resolves straight to the tunnel (`verify-uptime.ps1` reports
    `APEX FRONTED BY PAGES … FAIL`), so the always-on snapshot isn't fronting the
    domain and the outage problem is still live. Cloudflare → Workers & Pages →
    `honeymoney` → Custom domains → add `honeymoney.app` + `www`. Dashboard only —
    wrangler has no `pages domain` command, and the API path needs Zone:DNS:Edit to
    replace the existing tunnel CNAME. Rollback is removing them and
    `cloudflared tunnel route dns honeymoney honeymoney.app`.
    ⚠️ **Not the `Workers Routes` page** inside the honeymoney.app zone — that maps URL
    patterns to standalone Workers and will always be empty here. Leave the zone
    (**Back to Domains**) and open **Compute (Workers & Pages) → honeymoney → Custom domains**.
    Re-confirmed still FAIL on 2026-08-22: `honeymoney.app/gallery` returns no
    `X-HoneyMoney-Served` header (tunnel), while `honeymoney-e84.pages.dev/gallery` returns
    `edge-snapshot` — so Pages is healthy and only the apex is unpointed.
    ⚠️ Re-run `npm run site:build && npm run site:deploy` after **any** change to a
    public page — the snapshot is point-in-time and does not update itself.

13. [ ] **DOM Cloud** (free tier) as the always-on host: thin server / fat client, ARM
    binary only, `--dir` outside `public_html`, nightly pull-backup via GitHub Actions
    before the first real user, and log in monthly or the site is removed for
    inactivity.

14. [~] **Back up PocketBase off this machine.** Found 2026-08-22: `pb_data` had **no
    `backups/` directory at all** — the entire ledger existed in exactly one place, on a
    laptop that is off most of the week. `deploy/backup-pocketbase.ps1` now exists and has
    taken the first backup (2 MB), pruning to the last 14.
    ⬜ Remaining, dashboard-only: create an **R2 bucket** + a scoped *Object Read & Write*
    API token, then PocketBase `/_/` → **Settings → Backups → S3** (endpoint
    `https://<account-id>.r2.cloudflarestorage.com`, region `auto`, force path-style) and
    enable auto-backup `0 3 * * *`, keep 14. R2 needs a payment method on file even on the
    free tier. No `storage/` dir and no file fields, so **R2 file storage is not needed** —
    backups only.
    ⬜ Then: launch PocketBase with `--encryptionEnv=PB_ENCRYPTION_KEY`, or the R2 secret sits
    in plaintext inside `data.db` — which is the very thing being uploaded to R2.
    ⬜ Then: restore one zip into a throwaway `pb_data`. An untested backup isn't a backup.

_Last updated: 2026-08-22_
