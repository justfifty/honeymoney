# NEXT.md — HoneyMoney Competition Action Plan

**Target:** MAIC Nexus Challenge 2026 · Track **T3 — Financial Services / Fintech**
**Goal:** Reach Grand Final (Nov 2026) and win. This file is the living to-do board. `PLAN.md` is the full manual.

---

## ✅ Shipped — 2026-08-26 — the two spend views agree, consent is enforced, income is real income

**Where we stopped.** Four commits, all deployed and verified live on honeymoney.app. Plus one
outage — a flat battery landing between two halves of a deploy — written up below, because the
same shape has now caused the same symptom twice.

### The tally bug: two files, two definitions of "spend"

Reported as *"dashboard and graph don't tally"*. `lib/moneyView.ts` skipped voided rows and
credits; `lib/graphView.ts` skipped neither and summed EVERY transaction into its spend-per-edge
map. Each file was internally consistent, which is why it survived: a household that logged an
RM20,000 salary saw twenty thousand ringgit of *spending* drawn on /graph and not on the
dashboard, and a voided record — kept visible on purpose, as evidence — counted as money gone.

Both now call `countsAsSpend()` in `lib/recordKind.ts`. One definition, so the next view that
draws spending inherits the answer instead of inventing a third one.
✅ **`npm run check:tally`** walks every real household and asserts graph total == dashboard
total, rather than asserting that each file agrees with itself.

### Income was recorded but never read

`lib/projection.ts` and `lib/hscoreData.ts` read income from `income_source` nodes alone, while
the capture path filed every inflow against a `vendor` node. A household that had entered its
salary still had an income of **zero** everywhere that mattered: allocations divided nothing,
headroom was nothing, the savings rate was zero over zero, and the H-Score described a
household that earned nothing and spent normally.

⚠️ **The first fix over-corrected, and the follow-up matters more than the fix.** Routing
*every* inflow to an `income_source` was right for the `+ Income` button and wrong for
everything else: a CSV import and a statement commit post `direction:"in"` with no category,
because a bank credit can be a refund, a cashback, a card payment, or a transfer between the
household's own accounts. Left alone, importing a statement would have turned "Refund — Shopee"
into an income source with a monthly figure attached, inflating the household's income and
every ratio built on it — savings rate, essential burden, debt service, the H-Score. A fix for
a tally bug that silently invented income. Only a **stated** category (`income` /
`income_other`) creates a source now; a bare inflow still records as an inflow and still stays
out of spend, it simply does not claim to be a salary.
✅ **`npm run check:capture`** — 20 assertions against a throwaway household it creates and
removes, including the one that matters: **a bare credit does NOT become income**.

### The consent that was never checked

`hasConsent()` had **no callers anywhere in the application**. Signup wrote the answer, the
settings screen rendered it, the append-only ledger stored it, and every AI call site ignored
it — which is worse than never asking, because the ledger is evidence we knew AI was a purpose
requiring consent.

- `lib/aiGuard.ts` — consent gate + data classes, both failing closed.
- `dataClass` is REQUIRED on `GenOpts`, so a new call site cannot omit it. That requirement
  immediately surfaced `honeyInsight()`, which had been sending household bucket labels and
  exact figures to a cloud model on **every dashboard load** with nothing watching it.
- Class 2 (documents, labels, figures) prefers a local engine where one is configured;
  `aiVision` is pinned to class 2 and cannot be overridden.
- Ask Honey's cloud path now sends slot names, an intent and a locale — no figures, no labels,
  no free text. Local engines still get full context, because nothing leaves the machine.

### Backups were leaving in the clear

R2 held **13 unencrypted copies of the production database**. `deploy/backup-vault.mjs` seals
with AES-256-GCM before upload; existing archives were sealed in place and the plaintext
removed. PocketBase's own S3 upload is off. The key never enters the bucket, and a wrong key is
refused rather than returning garbage.

### Notices, for public use

`/terms` (bilingual, disclaimer at the top), acceptance recorded in its own append-only
`agreements` ledger — **not** as a consent, because you cannot withdraw agreement to terms
while still using the service. Privacy and terms linked from every footer in six locales, and
`/terms` added to the always-on snapshot for the reason `/privacy` already is: a notice
reachable only while the laptop is on has not, in any meaningful sense, been given.
`docs/POSITION.md` records where we stand, what enforces it, and the eight triggers that move
it — including what we got wrong that day and how it was caught.

### The dashboard congratulated a household that had declared nothing

Reported as *"why does Ask Honey still say it doesn't know my income?"* — and the honest answer
is that for `Just Fifty's household` it is **right**: 3 buckets, 2 goals, 5 records, **zero
`income_source` nodes**. The bug was the sentence directly above it. `ruleBasedInsight()` in
`lib/projection.ts` looked for `over_budget` and `at_risk` and treated everything else as cause
for congratulation — including `unfunded`, which `projectBuckets()` assigns to any bucket with
no allocation, and including the empty projection of a household with no plan at all.

So one screen said **"every bucket is on track and your Savings are funding on schedule"** and,
four inches below, **"I don't know your monthly income yet"**. Same household, same second, and
only one of them could be true. Praise for a plan that does not exist is the worse of the two —
it is also what stops the user declaring the income that would make every other number work.
Honey now says nothing is funded and points at the same screen Ask Honey points at, and
`getHoneyInsight()` no longer asks a model to comment on a projection where nothing is funded:
a model handed an empty context writes encouragement anyway.

### A missing income no longer blocks the questions that never needed it

The same report asked the right follow-up: *if the income can't be read, why not just answer
with where the goal stands?* It should. `assessAskConfidence()` refused **every** question when
`netIncomeMonthly <= 0`, but only `afford` and `income_change` are ratios to income. "How far
along is our Japan trip?" is answered from the goal's own balance; the buffer, from savings over
must-paid spending. A household that had logged records and set goals was told to go and declare
a salary in answer to questions its existing data already answered.

Income is now a precondition for the two kinds that divide by it, and `goal_timing` joins
`hscore_explain` and `spending_summary` in surviving the thin-data floor — because *where a goal
stands* is a balance and *when it lands* is a forecast. Thin history now costs the **date**, not
the balance: "Japan Trip: RM1,050 of RM3,000 so far — RM1,950 to go. I won't put a month on it
yet…" rather than a flat refusal. The absent `months` fact **is** the signal, so no date can be
narrated from a pace that was never computed.
✅ **`npm run check:ask`** — 8 new assertions, including that `afford` still refuses without
income and says why, and that a goal question answers with no income at all.

### Record now works the way the demo does — and it can read income

The landing page asks a visitor for one line — "Grab 18.40" — and answers with a
filed record in milliseconds. Then they sign up, and the app asked them for a
form: sign, category, amount, vendor, bucket, currency, date. **The product got
harder the moment you paid for it**, and the classification the demo did for free
became a question. /record now leads with the same field and the same result
card, with everything the form did kept behind "Edit details" — receipt scanner,
duplicate warning, itemised lines, attribution and visibility, currency,
back-dating, undo. Nothing was traded for the speed.

`lib/classify.ts` is the shared table, so both surfaces file identically — and it
knows **earnings**, which is the half that was missing. The demo classified
"Salary 5000" as *Spendings*: not merely imprecise but backwards, in front of the
judge the box exists to convince. It now recognises salary/gaji, bonus, komisen,
freelance, dividend, rental income, pencen, elaun — and files a refund, a
cashback or duit raya as money BACK rather than money earned. Income is tested
first, because earnings words hide inside expense words ("rental income" contains
*rent*, "EPF dividend" contains *EPF*); two matches lower the confidence instead
of raising it, so the user is asked to correct it.

⚠️ **`income_other` no longer creates an income source.** It is the "Something
else" catch-all under `+ Money in` — a refund, a rebate, an ang pow — which is
precisely the set that must not become a salary. The category being *stated* does
not make the money *earned*. The 2026-08-26 fix stopped bare credits; this closes
the same hole one door along, and it had to close before the classifier could
file "cashback" automatically.

**Two silent money bugs surfaced the moment typed lines were parsed**, both in
`lib/voiceParse.ts`, both invisible rather than loud:

| typed | was read as | now |
|---|---|---|
| `bonus 2000` | *no amount at all* — the card never appeared | RM2,000 |
| `RM2,000 Raya trip` | **RM2.00** | RM2,000 |

The first: any bare four-digit number was deleted as a YEAR before the amount was
read. Right for OCR'd receipt text, wrong for a line a human typed — and RM2,000
is one of the most ordinary sums in Malaysian household money. A year is now
removed only where something beside it says "date". The second: every rule spelled
its own money pattern as `\d+(?:[.,]\d{1,2})?`, which cannot read a thousands
separator, so `RM2,000` matched as `2,00` → **RM2.00**, a five-hundred-fold
under-read. One `MONEY` definition now, grouped form first. A receipt totalling
`1,234.50` was reading as RM1.23 too.
✅ **`npm run check:capture`** — 32 new assertions: 21 classifier cases in four
languages, 9 amount-and-vendor cases including both bugs above, and money-back
proved not to become a salary.

### 🛑 The outage: the site went unstyled, and the same cause did it on 2026-08-24

**Symptom.** Every app route rendered as bare HTML on a white page — the landing showed
`HoneyField`'s raw SVG dots with no `mask-image` to shape them. Reported as *"the website got
haywired"*; `build-static-site.mjs` already carries that exact word from 24 Aug.

**Cause.** The deploy is three steps, and the battery died between the second and the third:

| | step | |
|---|---|---|
| 1 | `npm run build` → `.next-dc` | ✅ 15:04 |
| 2 | push the bundle to the DOM Cloud origin | ✅ origin served the new HTML |
| 3 | `npm run site:publish` | ❌ **never ran** |

DOM Cloud served HTML referencing `1w1rzyd3v17ue.css`, while the Cloudflare Pages snapshot —
which serves **all** of `/_next/static/*` — still held only `3yfx8wcsj50l3.css`. Every
stylesheet request 404'd. Fixed by running step 3 against `.next-dc` (the bundle the origin
actually runs — pairing the DOM Cloud origin with this laptop's `.next` is the same mismatch by
another route). Verified afterwards: **18 routes, 0 broken assets**.

**Nothing was lost.** The shutdown was **clean** — Windows event **1074** (battery-critical
action), not a hard cut (41/6008). Working tree clean, all four commits intact, `data.db`
uncorrupted, `check:tally` and `check:capture` green.

⚠️ **The lesson, now twice-learned: steps 2 and 3 are one operation, and they are not atomic.**
A half-deploy is **invisible from the pages a snapshot serves** — `/`, `/demo` and `/learn` come
*from* the snapshot and stayed internally consistent, so they looked perfect while the twelve
app routes were bare. That is exactly where anyone asking "is the site up?" looks first.
Status 200 proves nothing either: the worker answers a missing chunk with fallback HTML **at
200**, which is why this presents as *unstyled* rather than as an error.
⬜ **`verify-uptime.ps1` should fetch an APP route, pull its `_next/static` hrefs out of the
HTML, and fetch each one** — asserting the body is CSS and not HTML. That check would have
caught both occurrences in seconds.

### Pick up here

- [ ] 🛑 **Clean the invented income sources — a live household's H-Score is wrong.**
      `check:tally` reports Alvin Chua's household as `Salary=8050, Saving=2000, FD=1050,
      Monthly Income=10000, Grab=19` → **RM21,119**. Three of those five are not income:
      `Saving` and `FD` are savings vehicles, and **`Grab=19` is an RM19 refund that became a
      RM19/month salary** — precisely the case the follow-up fix now prevents. The fix stops
      *new* ones; these rows predate it. That household's allocations (RM10,559 must-paid) and
      its **H-Score of 68** are computed on roughly double its real income.
      `npm run repair:income` reports and changes nothing; `-- --apply` fixes.
      (`ww pong` is clean: one source, RM20,000.)
- [ ] **Teach `verify-uptime.ps1` to catch a half-deploy** — see the outage above.
- [ ] **The user's own household still has no declared income** (verified against the live DB:
      3 buckets, 2 goals, 5 records, no `income_source`), so Ask Honey will keep declining
      `afford` and `income_change` for it — correctly, and now it is the only thing it declines.
      Add an income source on **/graph** (not /record). A *date* on a goal additionally needs
      ≥8 records over ≥14 days and money moving into Savings.
- [ ] **Retry the household Gemini key** in /setup with the **Model field blank** — the
      dead-model fix is live. If it still 404s, DOM Cloud's `~/.env.honeymoney` may pin
      `GEMINI_MODEL=gemini-2.0-flash`; that file is on the host and was not inspected.
- [ ] **Decide what `PITCH_DECK.html` is for.** It is now a stale mirror of a deck edited in
      Canva. Either fold the Canva wording back into it once more, or retire it and let the
      PDF be the only deck. Nothing depends on it any more — the video does not.
- [ ] **Both upload docs sit at 500/500 words.** No headroom; the next added sentence has to
      displace one. `node scripts/check-summary-words.mjs` is the gate.
- [ ] **`lib/ai.ts` calls the Gemini `v1beta` endpoint**, which Google now describes as
      deprecated for production. Not breaking anything today.

---

## ✅ Shipped — 2026-08-25 (afternoon) — the deck is one file, the video quotes it, and AI works again

**Where we stopped.** Everything below is deployed and verified live on honeymoney.app.
Two things wait on a human; both are under *Pick up here*.

### The pitch artefacts are finally one story

- **The deck is the Canva PDF, and nothing else pretends to be.** The demo video used to
  render its slides from `PITCH_DECK.html` — which stopped being the deck the day the
  Canva export became the upload artefact, so the video was quoting slides from a file
  nobody ships. `build-demo-video.mjs` now rasterises pages straight out of
  `HoneyMoney_Pitch_Deck_MAIC2026.pdf` with `pdftoppm`, and `deck: n` in the beat sheet is
  the PDF page number you would type into a viewer. Two guards: the build fails if a beat
  asks for a page the deck lacks, and fails if the deck stops being 16:9 (the scaler would
  silently stretch it rather than letterbox).
- **Slide 11 lost "for the Year 3 referral layer"** (edited in Canva). Three things had been
  collapsed into that phrase: *showing* the catalogue needs no licence and already ships;
  *taking a fee* is gated on counsel plus a signed provider agreement, which is a contract
  gate and not a calendar one; only *material referral revenue* is genuinely Year 3, and
  slide 9's Phase 3 already says so.
- **SDG list reconciled.** Both decks say **SDG 1 and 8**. The Project Summary said
  "1, 3 (Good Health), 8", `docs/REGISTRATION.md` said the same, and the video caption said
  "1, 4 & 8" — three artefacts, three lists. All now follow the deck.
- **AI Disclosure gained three claims the deck makes and it did not**: no analytics SDKs and
  no data brokers, the append-only hash-chained transaction ledger, and the deck's own
  honest caveat — *alignment with PDPA 2010, not certified compliance, no third-party audit
  yet*. Checked and deliberately NOT changed: the disclosure says Honey answers "in plain
  English or Malay" while the deck says six languages. Both are right — `LOCALES` has six,
  but the `ask.*` strings exist only in `en` and `ms`.
- Dated copies refreshed in `docs/deck/Submission/`; all four served from the site.

### The demo video: 2:53, and no frame sits still

- **Pages pan.** A new `scroll:` field moves the crop window down the page across a beat on
  a smoothstep. Every web beat has one. The six `/graph` views get a gentle drift — that
  page is one screenful and there is genuinely nothing below it to reveal.
- **Narrow pages are captured narrow.** `vw: NARROW` (1280) re-renders at a 1280px CSS
  viewport and 1.5x device pixels — still 1920 real pixels, nothing upscaled. `/demo`,
  `/dashboard`, `/guide` and `/learn` put content in a ~512–672px column; at 1920 that is
  27% of the frame and body text lands unreadable.
- **The four H-Score tiers are four beats, one URL each**, panning each household's own
  arithmetic. Plus new beats for the Academy quiz and the product directory, and a
  business-model beat saying referrals are later, licensed and opt-in — because
  `PARTNER_OFFERS_ENABLED = false` and `VOUCHERS` is an empty array.
- **Deck slides are letterboxed** to clear the caption band. The Canva slides put body copy
  where the HTML deck had a footer, and the band was cutting the last line off two cards on
  Drivers & Impact.
- **Two pipeline bugs fixed.** Capture now runs with `--force-prefers-reduced-motion`: the
  entrance animations were a *race*, not a wait — three identical runs of the landing page
  gave two good frames and one frozen mid-fade with the product shot unpainted, and raising
  the virtual-time budget made it worse. The site already turns `.hm-animate` off under
  reduced motion, so this renders every element at its final state. And the VO cache is now
  keyed on the LINE, not just voice + beat index — rewriting a beat's `vo` and rebuilding
  with `--no-shoot` used to silently reuse the previous take, so caption and narration
  drifted apart with nothing failing.
- **Compressed to 19.2 MB (CRF 25, was 29.3).** Not cosmetic: Cloudflare Pages rejects files
  over 25 MiB, so the uncompressed cut could not have shipped at all.

### Product changes this needed, all live

- **`/demo?persona=individual|couple|family|thriving`, `&tab=`, `&dir=`** — the four tiers
  and the product directory are now addressable, the way `/graph` takes `?tenantId=` and
  `?mode=`. An unlinkable tier is also an uncitable one, and it was unreachable to any
  screenshot tool, which is why the video could previously only ever show one of four bands.
- **`/directory` exists**, with a More entry. The app was already *promising* it: Honey's
  decline for a product question reads "There's a directory of licensed Malaysian providers
  under More › Directory" (`ask.decline.routed`) and no such entry existed. The compliance
  position is intact — this component never sees a score, band or household,
  `getListings(category, sort)` still refuses to accept one, sorting stays
  alphabetical/by-provider, and there is **deliberately no search box**: a relevance ranking
  IS a recommendation, and a recommendation is the licensed act.

### Ask Honey — and what was actually wrong with it

- **It never needed an AI key.** parse → compute → narrate; `askCompute.ts` is pure and
  `narrateTemplate()` answers in full without a model. The model only rephrases, and every
  number in its prose is checked against the computed facts before display. The Gemini
  outage was never why it was failing.
- **"Cannot detect the income" was data, not a defect** — and the advice attached to it was
  wrong. `netIncomeMonthly <= 0` produced `ask.conf.noIncome` followed by the single generic
  suggestion "log a couple more weeks and ask me again": advice that *cannot* work, because
  income is summed from `income_source` nodes and never from transactions
  (`hscoreExplain.ts` — "NO TRANSACTION IS EVER INCOME"). They could log for a year and get
  the same refusal. `AskConfidence` now carries a `fixKey` paired with `reasonKey`, and the
  no-income one says to declare it on the Graph screen.
- **A shipped suggestion chip did not parse.** `dash.ask.s3` — "Are we on track to save this
  month?" — matched no intent regex, so the one question the app itself invited you to click
  came back "I'm not sure what to work out there." `GOAL_RE` now covers "on track" and the
  Malay "di landasan". All four chips answer, in both languages.

### The Gemini outage, and the deployment shape behind it

- **Google shut `gemini-2.0-flash` down.** It was hardcoded in `config.ts` *and* pinned again
  in `web/.env.local`, so the /setup panel's own 404 advice — "leave the model field empty to
  use the default" — selected the dead model again. The default is now
  **`gemini-flash-latest`**, deliberately a floating alias: a pinned dated id is what turned
  someone else's deprecation schedule into our outage. The 404 message now tells a *retired*
  model apart from a *mistyped* one. Also fixed: `geminiVision` logged token usage against
  `config.geminiModel` even when a household ran on its own key and model, so /admin costed
  those tokens under a model that never saw them.
- **Local Ollama is configured on the laptop** (`AI_PROVIDER=ollama`, `llama3.2`, `llava` for
  vision — `llama3.2-vision` is not pulled). Zero cost, zero cloud. Warm latency **403 ms**;
  the first call is ~24 s while the model loads. This is what let the whole AI path be
  verified end to end without a paid key. Remove those lines from `web/.env.local` to go back
  to Gemini.
- **⚠️ The laptop is NOT the public origin any more.** honeymoney.app's app routes are served
  by **DOM Cloud**; `/`, `/demo`, `/learn`, `/deck` and **all of `/_next/static/*`** come from
  the Cloudflare Pages snapshot. Verified by fingerprint: `/hscore` on the apex matches
  `honeymoney-app.domcloud.dev` byte for byte and differs from `localhost:3000`.
- **The half-deploy is the outage.** This morning's unstyled site was a DOM Cloud build
  (10:56) shipped without a matching `site:publish`: the origin served HTML pointing at
  `_next/static` filenames the snapshot had never heard of, the stylesheet 404'd, and every
  route — public and private — rendered as bare HTML. Written up in `deploy/pages/README.md`.
  **Build → restart origin → `npm run site:publish`, always.** To merely check that a change
  compiles, use `NEXT_DIST_DIR=.next-verify npm run build`. Note `push-build.ps1` needs
  `-KeyFile` passed explicitly when invoked from a nested `powershell -File` call —
  `$PSScriptRoot` comes back empty and it looks for a key at the filesystem root.

### Pick up here — superseded, see 2026-08-26 above

- [ ] **The user's own household still has no declared income**, so Ask Honey will keep
      declining for it — correctly. Add an income source on **/graph** (not /record).
      Projections additionally need ≥8 records over ≥14 days.
- [ ] **Retry the household Gemini key** in /setup with the **Model field blank** — the
      dead-model fix is live. If it still 404s, DOM Cloud's `~/.env.honeymoney` may pin
      `GEMINI_MODEL=gemini-2.0-flash`; that file is on the host and was not inspected.
- [ ] **Decide what `PITCH_DECK.html` is for.** It is now a stale mirror of a deck edited in
      Canva. Either fold the Canva wording back into it once more, or retire it and let the
      PDF be the only deck. Nothing depends on it any more — the video does not.
- [ ] **Both upload docs sit at 500/500 words.** No headroom; the next added sentence has to
      displace one. `node scripts/check-summary-words.mjs` is the gate.
- [ ] **`lib/ai.ts` calls the Gemini `v1beta` endpoint**, which Google now describes as
      deprecated for production. Not breaking anything today.
- [x] ~~**Nothing is committed.**~~ Committed 2026-08-26 as `74ce50b`.

---

## ✅ Shipped — 2026-08-25 — submission set aligned, PDPA built, /graph fixed for real users

**One story across every artefact.** The Submission deck's edits were folded back into
`PITCH_DECK.html` (12 slides now, closer merged; RM384k and "layer across" kept
corrected), the Project Summary and AI Disclosure re-written to match it (≤500 words,
one page, verified), and the demo MP4 rebuilt end to end: 2:28, Ava voice, 21 beats —
problem → 3-Bucket → 3 personas → six graphs → consolidated dashboard → 4 tiers as
tiered insights → as-a-service model. Site screenshots now sit at 90% on a dark mount.
Dated copies in `docs/deck/Submission/`.

- [x] **/graph 500 for real users — root-caused and fixed.** Sankey's middle column was
      built from ALLOCATES inflow only; every household that typed spends but never
      declared income (all of them) crashed the DEFAULT view. Personas declare income,
      so no persona test could ever catch it. Verified by impersonating all three team
      accounts live: 200, chart renders.
- [x] **PDPA, built not promised** — bilingual notice at `/privacy` (edge-served),
      per-purpose consent ledger (append-only, withdrawal recorded), one-click export,
      30-day purge + backup cycle disclosed, breach procedure + processor register in
      `docs/`, restore PROVEN against a live backup, ledger emails scrubbed, analytics
      cut to counts (no IP/UA/account; 3,093 rows scrubbed). Status board:
      `docs/PDPA_STATUS.md`.
- [x] **Partner referrals not offered** — `PARTNER_OFFERS_ENABLED = false`; consent API
      rejects the purpose; deck/notice say "later, licensed, opt-in". The licensing
      question (BNM/SC) is counsel's, not code's.
- [x] **Telegram silenced everywhere** (deck, docs, video, app copy in 6 locales,
      /setup panels gated, dashboard chip → "auto"); code stays behind the flag.
- [x] **Capture** — on-device itemised line items (no AI key needed); receipt TOTAL no
      longer misread as the first RM line; income entries: no bucket, orange
      "Add income", +/− signed amounts on /record, /records and dashboard.
- [x] **Tooling** — deck/doc PDF exporters with size + clipping + rasterise guards
      (`build-deck-pdf.mjs`, `build-doc-pdfs.mjs`); interactive PDF compressor
      (`compress_pdf.py`, levels + --target, logos never resampled); privacy-doc
      generator with drift check.
- [x] **Mobile /record was frozen — four causes, all measured.** (1) The live site was
      serving the **23 Aug build**: `next start` holds the build it booted with, so the
      last three commits had never shipped and the phone's tab bar still had only four
      tabs — **/graph did not exist on mobile**. (2) `HoneyField` injected **4 200 SVG
      circles** into every page and re-composited them under a `mask-image` on a
      never-ending rAF loop; it is driven by `mousemove`, which a touchscreen never
      fires, so phones paid the whole cost for a decoration they could not move.
      `/record` went **372 KB → 49 KB**, **4 450 → 255 DOM nodes**, **43 → 61 fps**
      (390×844, 4× CPU throttle) — 43 fps is what "the screen is stuck" actually is.
      It now builds client-side behind `(hover:hover) and (pointer:fine) and
      (min-width:768px)` and stops when the tab is hidden. (3) `InstallPrompt` was
      `bottom-3 z-50` over a `bottom-0 z-40` nav: measured, it covered **45 of the
      bar's 57 px** — every label and most of each icon — stranding anyone who had not
      dismissed it. (4) `body` reserved a flat `pb-16` for a bar that is `3.5rem +
      env(safe-area-inset-bottom)`, so the last ~1.6 rem of every page sat under it on
      a notched phone.
- [x] **/graph header simplified** — 🧾 Records, ℹ️ Guide and Dashboard → removed from
      beside the title; only the currency switcher stays. All three were already
      permanent chrome (Dashboard is a top-bar AND bottom-nav tab; Records and Guide
      are in More), so the busiest page in the app opened with four competing links
      above the graph it exists to show.
- [x] **Deck fork closed for real.** `docs/deck/Submission/` still held the PRE-merge
      pitch deck — the hand-edited fork with `fatique` and the RM348k transposition —
      so the 31 Aug upload would have carried errors the repo fixed on 25 Aug. The
      merged deck is now the single artefact in all three places (`docs/deck`,
      `web/public/deck`, `Submission/`), verified by hash. The fold-back had dropped
      one real Submission line, restored here: Switchable AI now reads "and any model
      it hosts, including DeepSeek and Qwen". Video, summary and AI disclosure were
      already current — the summary and disclosure differed from Submission only in
      the PDF `/CreationDate`, identical text and page count.
- [x] **`npm run check:tap`** (`web/scripts/check-tap.mjs`) — `check:nav` proves the
      tabs are present, on-screen and 44 px, which a **covered** tab passes. This one
      hit-tests `elementFromPoint` at each tab centre (naming whatever steals the tap)
      and measures frame throughput under a 4× CPU throttle. It is the check that
      caught both the missing /graph tab and the banner.

⬜ **Only-you items:** DOM Cloud portal redeploy of `pb.deploy.yml` (superuser UI /_/
still public — last Security item) · name the DPO (Chua; MyKad NOT required —
residency in MY is what matters) + notify JPDP · verify privacy@honeymoney.app routes ·
accept Cloudflare + DOM Cloud DPAs · counsel once (certify BM notice, cross-border,
licensing) · sign one pilot LOI — that line is Traction.

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
- ⚠️ **The microphone was removed on 2026-08-22** (§6.6 Task 3) — browser ASR cannot hold
      Manglish, which is an API limit rather than a tuning one. **The parser above survives
      and is still load-bearing**: it is what the landing page's try-it box and receipt OCR
      run on. Only the speech input in front of it is gone. `/api/voice` went with it.

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

## ✅ Shipped — 2026-08-22 (the four tabs stop hiding · the microphone leaves · live)

The first two changes of the **§6.6 implementation brief**, in its dependency order, and the
first deployment of the §6.6 work. Both were verified by scripts that fail against the
previous revision, because "I looked and it seemed fine" is how the nav bug survived a
release in the first place.

### 🧭 Task 5 — the four tabs stop vanishing `[Relevance]`
- [x] Diagnosed narrower than the brief assumed: `HeaderNav` is `hidden md:flex` and
      `BottomNav` was `md:hidden`, so the tab bar already caught the four links below
      768px — **except** it returned `null` on `/`, `/login`, `/signup` and `/join`. On
      those four routes the only way in was the hamburger, and More is already the
      overflow menu. Not an overflowing flex row, and not a layout overflow at all.
- [x] Active state carries a bar and a weight change, not hue alone · header links raised
      from 20px to 44px (768px is iPad portrait — a thumb reading the "desktop" header) ·
      labels drop below 360px so four Tamil words cannot overflow the row.
- [x] `npm run check:nav` — 7 routes × 5 widths, 35/35, plus five mid-session resizes.

### 🎤 Task 3 — the Speak function removed `[Technical]`
- [x] **Three surfaces, not one.** The brief scopes this to "the Record flow"; the mic was
      also on the **landing page's try-it box** and the **public demo's Record tab**, which
      offered a simulated 🎤 Speak. The demo one mattered most — it is a claim to a judge
      about a feature the product would no longer have.
- [x] Deleted: `app/useDictation.ts`, `app/api/voice/route.ts`, and `scoreAlternative` —
      the speech-alternative ranker, and the only part of `lib/voiceParse.ts` that was
      about speech rather than text.
- [x] **Three of the brief's checklist items were no-ops, which is worth knowing rather
      than assuming.** No dependency, polyfill or type package to remove (Web Speech is a
      browser built-in). No record carries a voice flag — only `ai_usage` rows carry
      `meta.source = "voice"`, and those are historical and now unread. No hidden coupling:
      nothing read a transcript or branched on a voice mode.
- [x] **The copy was the larger half.** 15 dead keys removed and **38 strings reworded
      across all six locales** that still *claimed* the app could be spoken to — landing,
      guide, the privacy note, and the demo's "the real app uses your microphone and
      camera". A removed feature surviving in the marketing copy is the same bug wearing
      different clothes.
- [x] `npm run check:mic` (new) — three halves, because each alone gives a confident wrong
      answer. Every mic entry point is replaced before app code runs so a **call** is
      recorded (a headless Chrome auto-denies rather than prompting, so watching for a
      prompt would pass whatever the page did) · the DOM swept for a mic control by
      accessible name in all six languages · and no source file may **name** a speech API,
      which is what speaks for the signed-in surfaces a logged-out crawler cannot open.
      **10 routes pass; against the shipped code the same script reports 13 findings.**
- ↩️ **Reversible:** `/api/voice` was deleted rather than kept — its only caller was the
      mic, so it would have shipped as an unreachable authenticated endpoint that spends AI
      tokens. Its Malaysian code-switching prompt is worth reviving for Task 2's BYO-key
      work and sits in git at `2dd7bd2:web/src/app/api/voice/route.ts`.

### 🚀 Deployed — and the release plan bent on purpose
- [x] **§6.6 says tasks 5, 3, 4, 1, 6, 7, 8, 9, 10 and 11 ship as one release. Tasks 5 and
      3 went out ahead of it.** That rule exists because Tasks 1 and 6 share a Record
      migration and must not land half-done; neither 5 nor 3 touches the data model, so
      nothing is half-migrated by shipping them early. Against that, the nav bug broke the
      app at phone width for most of its users and the demo advertised a feature the
      product no longer has — both of which a judge could hit **today**, nine days from the
      31 Aug artefact gate. Holding a working fix behind eight unbuilt tasks would be the
      more expensive choice.
- [x] Production build, stack restarted, and the Cloudflare Pages snapshot re-cut — the
      snapshot is point-in-time and both the landing page and `/demo` changed.
- [x] Verified **on the live site**, not just locally: `check:mic` 10/10 and `check:nav` 35/35
      against `https://honeymoney.app`, and the edge snapshot at `honeymoney-ci3.pages.dev`
      returns `X-HoneyMoney-Served: edge-snapshot` with the mic gone from it too.
- [x] H-Score output **byte-identical**: `check:demo` reports all four personas on band,
      0 drift over 365 days.
- 🩺 `verify-uptime.ps1` green everywhere except the long-standing **APEX FRONTED BY PAGES**
      (§7 #12) — four dashboard clicks, unchanged by this release.

### 🚨 The deploy that deployed nothing — and why it was invisible
- [x] **`npm run build` alone changes nothing a visitor sees.** A running `next start` holds
      the build it booted with. After building and restarting, `honeymoney.app` still served
      a mic button that had been deleted an hour earlier — while returning `200` throughout,
      which is exactly why this is worth writing down. The tell is comparing
      `.next/BUILD_ID`'s mtime against the *process creation time* of whatever owns port
      3000; here the server was an hour older than the build it was supposedly serving.
- [x] **And `stop-honeymoney.ps1` could not fix it, silently.** The `HoneyMoney` task runs
      `RunLevel Highest`, so the app inherits elevation — a hand-run stop from an ordinary
      shell gets `Access is denied` on every `Stop-Process` and **says nothing at all**,
      because the script is `SilentlyContinue`. It prints "HoneyMoney stack stopped." and
      stops nothing. A deploy therefore *appears* to succeed and does not.
- [x] **Fixed where the privileges already are:** `start-honeymoney.ps1` now compares the
      build on disk against the process serving it and restarts a stale one itself. The
      5-minute watchdog picks a deploy up on its own, or `schtasks /run /tn HoneyMoney`
      does it now. A 60-second settling window guards against restarting into a half-written
      `.next`, since `next build` writes `BUILD_ID` while it is still emitting chunks.
- 📋 **The deploy runbook, then:** `npm run build` → `schtasks /run /tn HoneyMoney` → confirm
      the log says `stale build … -> restarting` → `npm run site:build && npm run site:deploy`
      → verify against the live URL, not localhost. Do not trust `stop-honeymoney.ps1` from a
      normal shell.

### 🩺 Two artefacts that cost an afternoon, written down so they cost nobody else one
- ⚠️ **`next dev` does not hydrate under headless Chrome here.** Its HMR websocket fails
      (`ERR_INVALID_HTTP_RESPONSE`) and React never attaches — so **every click a check
      script sends does nothing**, while the page still looks right because it is
      server-rendered. The first version of `check:mic` reported `/demo` clean for exactly
      that reason, and would have shipped a check that verified nothing. **Point
      interaction checks at a production build:** `NEXT_DIST_DIR=.next-check npm run build`,
      then `NEXT_DIST_DIR=.next-check npx next start -p 3010`. `check:nav` escapes this only
      because everything it measures is server-rendered; **Tasks 4 and 7 will not.**
- ⚠️ **`NEXT_DIST_DIR` alone does not isolate a throwaway build.** `tsconfig.json`
      hardcodes `.next/types/**` and `.next/dev/types/**` in `include`, so a build into
      `.next-check` still type-checks the *previous* build's route validators and fails on
      routes you deleted. Clear `.next/types` and `.next/dev/types` first — both are
      generated, and `next start` never reads them. `.next-*` is gitignored now; it was not.
- 🐛 *And one in the check itself:* `String.replace(str, …)` substitutes only the
      **first** occurrence, so the tab-walking probe left a bare identifier in the
      expression and threw inside the page — paired with an `evaluate()` that swallowed
      exceptions, that produced a check which clicked nothing and called every route clean.
      Probes now fail loudly. A silent probe is worse than no probe: it reports success.

---

---

## ✅ Shipped — 2026-08-23 (attachments · charts · H-Score · goals · import · record kinds)

Eight of the eleven §6.6 tasks now done, plus two H-Score corrections made on an
explicit decision rather than as side effects. **Every claim below was measured,
and several of the measurements contradicted the brief.**

### 📎 Task 4 — attachments, and the half that did not exist `[Relevance]`
- [x] **The premise was wrong: receipts were never stored.** `receipt_ref` had been a text
      field since the first migration, commented *"pointer only; never the raw image"*, written
      by **no line of code** — capture read the numbers off a photo and dropped it. So the
      viewer needed storage built underneath it first.
- [x] Real PocketBase file field · thumbnails via `?thumb=` (never client-side) · the client's
      existing 1600px downscale now kept instead of discarded · full-screen viewer with pinch,
      double-tap and wheel zoom, rotate, swipe, keyboard, and a retry that actually works.
- [x] **A receipt IS the vendor and the line items**, so it is exactly what tier-3 redaction
      hides. `privacy.ts` empties `attachments` on a redacted row AND `/api/attachment` refuses
      the bytes — the first stops the UI offering it, only the second stops a partner who kept
      a URL. 404 not 403, so the response cannot confirm a transaction id exists.

### 📊 Task 11 — one chart registry, and three names that were wrong `[Technical]`
- [x] `lib/charts.ts`; `/graph`, `/gallery` and the demo all read from it.
- 🛑 **The drift was not the predicted one.** `/graph` translated correctly; its `label` field
      was dead English nothing read. The damage was inside the translations: **zh/zh-Hant named
      the TREEMAP "tree diagram"** — the name of a different chart in the same switcher — Tamil
      had the identical collision, and **"Organic" landed on the FOOD sense** in three languages.
- [x] The demo's missing Graph Showcase, deep-linkable, same component as the Gallery.
- 🐛 The demo column lacked `w-full`, so `mx-auto` on a flex item suppressed stretch, it sized
      to fit-content, and `max-w-lg` capped the blow-out at exactly **512px** — a 375px phone
      scrolled sideways by 137px regardless of what was too wide. The Dashboard tab was already
      overflowing before this work.

### 💛 Task 8 — where the H-Score number came from `[Technical][ESG]`
- [x] Three tap-through levels, the arithmetic on one line, and the records behind it.
- [x] **`privacyDiscipline` renamed in CODE to `personalCap`** — it never measured privacy; it
      counts months inside your own spending cap. Snapshots are mapped on READ, so "what moved"
      cannot invent a change that never happened.
- [x] A criterion low from **thin data** is hatched and grey, not a short amber bar — it survives
      greyscale. `debtService` with no declared loans was scoring full marks and reading as
      *excellent* when it meant *unknown*.

### 🔧 Two H-Score corrections, each on an explicit decision
- [x] **Saving money used to LOWER your score.** RM500 into Savings moved the live household
      **81 → 79**; as money-in it changed nothing. Savings could only come from the allocation
      plan and a transaction could only subtract. Now the plan is a baseline that observed
      movement adjusts **both ways**: paying in gives **81 → 82**. `max(plan, deposits)` was
      tried and rejected — a generous plan swallowed the evidence.
- [x] **The demo and the app disagreed IN SIGN** on the same criterion: one counted a tier-2
      record as a contribution, the other as a withdrawal. Both now call one function.
- [x] **Goal progress feeds the emergency buffer**, read all-time rather than through the
      90-day window — a buffer is a stock, and windowing it would report a three-year house
      deposit as three months of one. The overlap is accepted and **stated on the criterion**:
      one transfer moves 50 of the 100 available points.

### 🎯 Task 9 — goal progress you can reconcile `[ESG]`
- [x] `tracked + manual`, always reported separately. *"RM8,000 tracked + RM2,000 you added
      manually"* is checkable; RM10,000 is something you have to trust.
- 🐛 `contributeGoal` **clamped to the target**, so passing a goal was unrepresentable — RM12,000
      toward a RM10,000 goal displayed as RM10,000.
- 🐛 **My own migration silently changed nothing** and was recorded as applied. Every household
      would have seen RM0 against goals they had funded. Caught only by reading the rows back.
      Progress is interpreted on READ instead; all five live goals verified unchanged.

### 📥 Task 10 — an import that never leaves the device `[Technical][Commercial]`
- [x] CSV parsed in the browser; only approved rows are POSTed. `check:csv` pins **40 traps**.
- 🐛 It found a real bug on its first run: textual dates went through `Date.parse`, which reads
      LOCAL midnight, so in UTC+8 `toISOString()` returned the previous day — a whole statement
      one day early, every date still plausible, nothing thrown.
- [x] Date order is **asked, never assumed**; unreadable rows are returned with their problems
      rather than dropped; `import_batch` makes a batch undoable in one action, voiding not
      deleting.
- 🛑 **The import page GATED THE WHOLE FEATURE behind an AI provider** — "never gate import
      behind it" is exactly what the brief says. And the shipped **PDF path sends statement text
      to a model**, which Task 10's "nothing from a bank file goes to any model" is written
      against. Kept, labelled as leaving the device, placed second. **Removing it is a product
      decision, not a technical one.**

### 🔀 Tasks 1 + 6 — two buttons, three kinds, and who paid `[Technical][Scalability]`
- [x] **The migration rewrites nothing.** Kinds are derived on read, and `attribution_asserted`
      defaults to false — which is exactly what "nobody said who paid" means.
- [x] `+ Savings` produces a **transfer**, not an inflow. Others is two keys, never one.
- 🐛 The direction toggle was **rose/emerald — red and green**, unreadable to roughly one man in
      twelve. Now orange and dark grey, which differ in **lightness** so they survive greyscale.
- [x] **Privacy enforced in the QUERY**, so a hidden row is never fetched. `check:attribution`
      proves it from both seats.
- 🛑 **One correction to the brief.** It asks for enforcement "in PocketBase collection rules".
      `transactions` has NULL API rules and the server authenticates as superuser, so there is no
      auth record for `paid_by = @request.auth.id` to evaluate; opening the collection to browser
      sessions would be a **larger** privacy regression than the one it prevents.

### 📈 Task 7 — the part that is done `[Technical][Relevance]`
- [x] **Every chart survives 0, 1, 2 and 200+ items.** Nothing threw — the suspected "errors on
      empty" does not happen. Five drew ALL 200 (tree **230KB**, treemap 173KB, network 113KB)
      and three drew a blank panel at zero. Now 26KB / 22KB / 23KB with an inspectable `Other`.
- [x] **A saving is no longer drawn as money leaving.** Every transaction with a bucket and a
      vendor became a bucket→vendor flow, and a savings deposit has that shape. Transfers now
      terminate at their goal, and **the choice is stated on the chart**.

### 🌐 Ops — honeymoney.app no longer dies with the laptop `[Technical]`
- [x] **`verify-uptime.ps1` is fully green, APEX FRONTED BY PAGES included.** The public
      pages — `/`, `/demo`, `/guide`, `/gallery`, `/deck` — now answer
      `X-HoneyMoney-Served: edge-snapshot`: Cloudflare serves them without touching this
      machine. Signed-in routes still need the origin and now degrade to a real offline page
      instead of a Cloudflare 1033, which to a judge following a link is the difference
      between "this doesn't exist" and "the demo works, the app is momentarily offline".
- [x] **Lid-close on mains set to "do nothing"** (it was unset and hidden; idle sleep was
      already off). On battery it still sleeps, deliberately — a ThinkPad should not run hot
      in a bag. **Keep it plugged in.**
- [x] **Backups are off this machine.** PocketBase uploads to Cloudflare R2 nightly, keeping
      14, and a zip pulled back OUT of R2 has been restored and verified — see §7 #14.
- ⚠️ **The encryption key is now required to OPEN a backup, not merely to read its settings.**
      An earlier note claimed otherwise; measured, PocketBase refuses to start without it
      (`invalid settings db data or missing encryption key`). Keep `deploy/.pb-encryption-key`
      in a password manager — not in a backup, and not only on the machine the backups exist
      to survive.
- ⚠️ **`origin.honeymoney.app` was deleted along with the other Tunnel records and had to be
      restored.** The homepage looked perfectly healthy throughout, because Pages was serving
      it — while every dynamic route had nowhere to go. **A green homepage proves nothing
      about the app.** Restored with `cloudflared tunnel route dns honeymoney
      origin.honeymoney.app`.

### 🌐 Ops — the 24/7 story, re-diagnosed
- 🛑 **"Four dashboard clicks" was undoable.** The domain and the Pages project were in **two
      different Cloudflare accounts**. See §7 #12 — project rebuilt in the domain's account,
      snapshot deployed, custom domains attached. **One DNS record left, and it needs a human**:
      wrangler's OAuth token has `zone (read)`, which does not include DNS records.

### 🩺 Method notes worth keeping
- ⚠️ **`next dev` does not hydrate under headless Chrome here** — every click a check sends does
      nothing while the page still looks right. Point interaction checks at a production build.
- ⚠️ **A JSVM data migration can report success and change nothing.** Schema and data belong in
      separate files, and where a READ can interpret old data, that beats a write that rewrites it.
- ⚠️ **Three checks initially tested themselves**, not the code: a harness whose imports were
      double-wrapped and failed identically everywhere; an assertion that measured its own
      fixture; and a chart fixture coerced to the wrong prop names. **A check that cannot fail
      is worse than no check** — it reports success.

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

> ⚠️ **Amended 2026-08-22 — Tasks 5 and 3 shipped early and are live.** The bundling rule
> exists because **Tasks 1 and 6 share a Record migration** and must not land half-done.
> Neither 5 nor 3 touches the data model, so nothing is half-migrated by releasing them.
> Against holding them: the nav bug broke the app at phone width, and the demo advertised a
> microphone the product no longer has — both reachable by a judge nine days from the gate.
> **The rule still binds Tasks 1 + 6, and 7 + 8 + 9 + 11.** Do not read this as licence to
> ship those piecemeal. Task 4 is likewise standalone and may follow the same path.

### The order

**1 · Task 5 — Primary nav must stay visible at all widths** — ✅ **done 2026-08-22** `[Relevance]`
- [x] **Diagnosed before fixing.** It was the brief's first candidate, but only on four
      routes. `HeaderNav` is `hidden md:flex`, so the four links leave the header below
      768px on *every* route; `BottomNav` is `md:hidden` and picks them up — except it
      returned `null` on `/`, `/login`, `/signup` and `/join` to keep those pages
      "focused". On those four routes below 768px the only remaining way in was the
      hamburger, and the brief is explicit that More is already the overflow menu.
      Not an overflowing flex row, and **not a layout overflow at all** — see the
      measurement note below.
- [x] `BottomNav`'s `HIDE_ON` removed, so the bar renders wherever the header nav would
      have. `/demo` stays excluded via `ChromeGate` — it ships its own tab bar, and two
      fixed bars stack with the global one swallowing the demo's taps.
      ↩️ **Reversible decision:** this puts a tab bar on the marketing landing and the auth
      pages, which previously had none. To restore that, the one-line revert is written
      into the comment at the top of `web/src/app/BottomNav.tsx`.
- [x] Icon-only below 360px (`max-[359px]:hidden`) with `aria-label` on the link, so four
      labels in Tamil can't force the row to overflow and a screen reader never meets four
      unnamed icons. Labels return at 360px+.
- [x] Active state is now **a top bar plus font weight**, not hue alone — it was
      colour-only, which the measurement below caught on every app route.
- [x] Touch targets: tabs 56px; header nav links raised to 44px (they were 20px, and
      768px is iPad portrait — a touch device reading the "desktop" header). Header height
      is unchanged, `md:py-1.5` giving back what the taller links take.
- [x] Visible keyboard focus on both bars — verified by dispatching real Tab keys and
      reading back `outline: 2px solid rgb(255,117,24)` on the focused tab.
- [x] Safe-area insets and `<nav>` + `aria-current="page"` were already correct.
- [x] **Verified at 320 / 375 / 768 / 1024 / 1440 and across mid-session resize** —
      `npm run check:nav` (new, `web/scripts/check-nav.mjs`), which measures boxes rather
      than counting selectors, because a nav item pushed off-viewport or 20px tall passes a
      naive check and still fails the user. **7 routes × 5 widths, 35/35 pass**, plus five
      resizes with no reload. Against the shipped code the same script fails every narrow
      row. `/demo` is out of its scope by design — its tabs are component state, not links;
      checked by eye at 320px instead.
      ⚠️ **Chrome's `--window-size` clamps to 500px on Windows**, so a headless screenshot
      at 320px is a *crop of a 500px render* and every element looks clipped. That artifact
      reads exactly like a page-wide overflow bug and cost an hour. Emulate the viewport
      over CDP (`Emulation.setDeviceMetricsOverride`) instead — Node 22's built-in
      `WebSocket` is enough, no Playwright needed.
- [x] **Deployed 2026-08-22** with Task 3 — production still ran the old chrome until then.
- 🛑 **Reported, not implemented — the brief's assumption is out of date.** It asks whether
      to consider a bottom tab bar at narrow widths. **One already exists**, shipped
      2026-08-21; the four tabs have been in the thumb zone since then. The bug was never
      the absence of a bottom bar, only that it hid itself on four routes. No cost estimate
      needed — there is nothing to build.
- ⬜ Left alone deliberately: `SiteFooter`'s secondary link row is 16px tall, under the 44px
      rule. Those are footer links, not primary destinations; folding them into Task 5 would
      be scope the brief didn't ask for. Worth a sweep of its own later.

**2 · Task 3 — Remove the Speak function** — ✅ **done 2026-08-22** `[Technical]`
- [x] Removed entirely, not behind a flag. `app/useDictation.ts` (the shared recogniser) and
      `app/api/voice/route.ts` are deleted; `scoreAlternative` — the speech-alternative ranker,
      and the only part of `lib/voiceParse.ts` that was about speech — goes with them.
- [x] **Grepped before deleting, and the brief's "the Record flow" undercounted it.** The mic was
      on **three** surfaces: the Record flow (`SpendCapture`, shared by `dashboard/AddTransaction`
      and `graph/FlexibleInput`), the **landing page's try-it box** (`TryItNow`), and the **public
      demo's Record tab**, which offered a simulated 🎤 Speak. The demo one mattered most: it is
      a claim to a judge about a feature the product would no longer have.
- [x] No hidden coupling found. Nothing reads a transcript field, assumes a live stream, or
      branches on a voice mode.
- [x] **Nothing to migrate — no record carries a voice flag.** Only `ai_usage` rows carry
      `meta.source = "voice"`, and those are historical usage rows: left untouched, unread.
- [x] **Nothing to uninstall either.** The brief asks for dead dependencies, polyfills and type
      definitions; there were none. Web Speech is a browser built-in and the interface was a
      local `SpeechRecognitionLike` in the deleted file. `tesseract.js` stays — that is OCR.
- [x] Copy swept across **all six locales**: 15 dead keys removed, and 38 strings reworded that
      still *claimed* the app could be spoken to — landing, guide, privacy note and the demo's
      "the real app uses your microphone and camera". A removed feature that survives in the
      marketing copy is the same bug wearing different clothes.
- [x] **Verified by measurement, not assertion** — `npm run check:mic` (new,
      `web/scripts/check-no-mic.mjs`), three halves: every mic entry point replaced before app
      code runs so a *call* is recorded (a headless Chrome auto-denies rather than prompting, so
      watching for a prompt would pass no matter what the page did) · the DOM swept for a mic
      control by accessible name in all six languages · and no source file naming a speech API,
      which is what speaks for the signed-in surfaces a logged-out crawler can't open.
      **10 routes pass; against the shipped code the same script reports 13 findings.**
- [x] `check:nav` 35/35 and `check:demo` still pass — **H-Score output byte-identical**, all four
      personas on band.
- [x] **Deployed 2026-08-22** with Task 5: production build, stack restarted, Pages snapshot
      re-cut. See the *Shipped — 2026-08-22* section for why the one-release rule was bent.
- ↩️ **Reversible decision, flag if you disagree:** `/api/voice` was deleted rather than kept.
      Its only caller was the mic, so it would have shipped as an unreachable authenticated
      endpoint that spends AI tokens. What it knew — a Malaysian code-switching prompt grounded
      in the household's buckets and known vendors — is worth reviving for Task 2's BYO-key work;
      it is in git at `2dd7bd2:web/src/app/api/voice/route.ts`.
- ⬜ Left deliberately: `lib/voiceParse.ts` keeps its filename and `parseVoiceLocal` its name.
      It is now purely a *text* parser (the try-it box, and `parseReceiptText` for OCR), and its
      header says so. Renaming ripples into the skill docs and reads as churn mid-release; it is
      a clean one-commit follow-up if wanted.
- ⚠️ *For the record:* this discards the verified voice work shipped 2026-07-14 (Unicode-first
      parser, 11/11 across en · ms · zh · zh-Hant · ta · hi). The **parser survives** — it is
      what the try-it box and receipt OCR run on; only the microphone in front of it is gone.
      The brief's forward path is audio → the user's own key (Gemini takes audio natively) on
      the Task 2 BYO-key rails. **Not now.**
- ⚠️ **`next dev` does not hydrate under headless Chrome here.** Its HMR websocket fails
      (`ERR_INVALID_HTTP_RESPONSE`) and React never attaches, so *every click a check script
      sends does nothing* and the page still looks right because it is server-rendered. The
      first version of `check:mic` reported `/demo` clean for exactly this reason. **Point
      interaction checks at a production build** — `NEXT_DIST_DIR=.next-check npm run build`
      then `NEXT_DIST_DIR=.next-check npx next start -p 3010`. `check:nav` is unaffected only
      because everything it measures is server-rendered. Tasks 4 and 7 will not be so lucky.
- ⚠️ **`NEXT_DIST_DIR` alone does not isolate a throwaway build.** `tsconfig.json` hardcodes
      `.next/types/**` and `.next/dev/types/**` in `include`, so a build into `.next-check` still
      type-checks the *previous* build's route validators and fails on routes you deleted. Clear
      `.next/types` and `.next/dev/types` first — both are generated, and `next start` never
      reads them. And `git checkout -- tsconfig.json` afterwards, as §12 already says.

**3 · Task 4 — Viewable attachments** — ✅ **done 2026-08-22** `[Relevance]`
- 🛑 **The premise was wrong, and reporting it was not enough — the task needed the
      missing half built.** Receipt scans could not be opened because **they were never
      stored**. `transactions.receipt_ref` has been a text field since the first migration,
      commented *"pointer only; never the raw image"*, written and read by **no line of
      application code**. `SpendCapture` sent the photo to `/api/receipt`, used the vendor
      and amount, and dropped the image. There was nothing to view.
- [x] Storage built: a real PocketBase **file** field (migration `1751900017_attachments`),
      `maxSelect 5`, 2 MB each. A file field is what makes `?thumb=` available at all.
- [x] Thumbnail in the list via PocketBase `?thumb=100x100` — **not** client-side.
      `check:attachments` asserts both declared sizes exist, because an undeclared thumb is
      served as the **original** and a 40-row list quietly downloads 40 full-size photos.
- [x] The client already downscaled to 1600px q0.85 for the vision call and threw the result
      away; those same bytes are now what gets stored. `MAX_EDGE`, the API limit and the
      field's `maxSize` moved into `lib/attachments.ts` — three numbers that must agree.
- [x] Full-screen viewer, full-res on open only: pinch, double-tap and wheel zoom · rotate ·
      pan · swipe and arrow keys between attachments · `Esc` closes. The 400x0 thumb stands
      in while the original loads, so the frame is never blank.
- [x] Real error state with a working retry (the attempt counter matters — without it the
      browser re-serves the failed response from cache and "Try again" does nothing).
- [x] **Layout seam built** (`lg:flex-row`): Task 2's line-items panel becomes the second
      child with no rewrite. Left *unrendered* rather than rendered empty — an empty panel
      is a promise the product cannot keep yet, and it would eat half a laptop screen today.
- [x] **Privacy, which the brief did not raise and this task forces.** A receipt image *is*
      the vendor and the line items, so it is exactly what tier-3 redaction hides.
      `lib/privacy.ts` now empties `attachments` on a redacted row, and `/api/attachment`
      refuses the bytes independently — the first stops the UI *offering* the image, only
      the second stops a partner who kept the URL. **Both are needed.** 404 not 403, so the
      response cannot confirm a transaction id exists.
- [x] `npm run check:attachments` — round-trips a real image through PocketBase and asserts
      the proxy refuses a signed-out caller. Its first fixture was a hand-rolled 64x64 JPEG
      and it reported "the thumb is not resizing": true and meaningless, since PocketBase
      returns the original when the source is smaller than the thumb. **A fixture that
      cannot fail the test it is in is worse than no test.**

**4 · Tasks 1 + 6 together — record kinds and attribution** — ✅ **done 2026-08-23** `[Technical][Scalability]`

> ### 🛑 Findings, measured 2026-08-22 — read before designing anything here
>
> The brief marks four things "report before changing". All four were run against the real
> seeded household, not reasoned about. Two of them change what Task 1 can be.
>
> **1. Recording that you saved money LOWERS your H-Score. Demonstrated, not suspected.**
> Against the live tenant: inserting one RM500 record on the Savings bucket with
> `direction: "out"` moved the score **81 → 79** (savingsRate 12.4 → 11.0 pts). The same
> record as `direction: "in"` changed **nothing at all**.
> The cause is in `hscoreData.ts`: `savingsMonthly = max(0, savingsAllocated −
> savingsWithdrawn)`, where `savingsAllocated` comes **only from allocation edges** (the
> plan) and `savingsWithdrawn` is *transactions against a tier-2 bucket*. So a transaction
> can only ever **reduce** savings, never increase it. `direction: "in"` rows are filtered
> out of `spend` entirely, so they are invisible to the criterion.
> **Consequence for Task 1:** `+ Savings` — the brief's headline example, "a transfer, not
> income" — would either lower the user's score or do nothing. It cannot be made correct
> without changing H-Score computation, and the standing constraint says to **stop and flag**
> when a task appears to need that. This is that case.
>
> **2. `category → bucket` is NOT deterministic, so `From bucket` cannot simply be dropped.**
> The seeded household has **9 tier-1 buckets** (Rent · Utilities · Education · Transport ·
> Kids & School · Statutory · Income Tax · Insurance · Bills & Subscriptions) and **3 tier-3**
> (Groceries · Personal — Aiman · Personal — Siti). "Must-paid" therefore maps to nine
> different buckets, and households can create more at any tier from `FlexibleInput`.
> Per the brief's own condition, removing the field would **relocate** the ambiguity, not
> remove it. A `−` record still has to land somewhere specific.
>
> **3. Income is declared, never recorded.** `grossIncomeMonthly` sums `income_source`
> **nodes** (`props.monthly_amount`). No transaction, in any direction, has ever counted as
> income. So Task 1's `+ Income` would write a row H-Score ignores completely — the same
> shape of problem as (1).
>
> **4. H-Score is computed at HOUSEHOLD level, entirely.** `getScoreInputs(tenantId)` filters
> by tenant and never by member; income is summed across the household. There is no
> per-person score to preserve or break. *(Reported, not changed.)*
>
> **What is still needed from a human:**
> - **The attribution axis** — who *paid* vs who *benefited*. The brief recommends who-paid;
>   that is the default I would take, naming the field for what it holds and leaving a seam.
> - **The privacy stance** — (1) transparent · (2) individual-private-by-default, joint
>   shared *(brief's recommendation)* · (3) per-record toggle. This one genuinely shapes the
>   product and is not mine to pick; note that (2) is close to what `privacy.ts` already
>   enforces for tier-3 buckets, so it is also the cheapest.
> - **Whether H-Score may change** to make `+ Savings` and `+ Income` mean anything. Without
>   that, Task 1 ships a control that silently does the wrong thing.
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

**5 · Task 8 — H-Score: show where the number came from** — ✅ **done 2026-08-22** `[Technical][ESG]`
> 🛑 **Answered 2026-08-22, from the measurements above.** "Transfers are not income — verify
> what the current implementation does": **no transaction is ever income.** Income comes only
> from `income_source` nodes, so the criterion cannot be fooled by a transfer today — but it
> also cannot see a real salary credit. And a savings record *reduces* the savings rate
> (finding 1). Both belong in this task's "say what's missing" surface: they are exactly the
> case where a criterion is low from **how the data is modelled** rather than from the
> household's finances.
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

**6 · Task 9 — Goals under `More`** — ✅ **done 2026-08-23** `[ESG][Commercial]`
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

**7 · Task 11 — Chart names and explanations: one source, used everywhere** — ✅ **done 2026-08-22** `[Technical][Commercial]`
- [x] **`lib/charts.ts`** — stable id, name, one-line description, the longer "when to use
      this", icon and gallery shot. `/graph`, `/gallery` and the demo all read from it. The
      registry deliberately owns names and prose only, not how to draw anything: a registry
      that also owned layout would drag every chart library into every bundle that merely
      wants a label.
- 🛑 **The drift was not the one the brief predicted, and what it hid was worse.** `/graph`
      did *not* ship untranslated labels — it rendered `mode.<id>` keys correctly, and the
      `label` field beside them in `MODES` was **dead English nothing had ever read** (a wrong
      value in it would have looked fine forever). The damage was inside the translations,
      which nobody had reason to compare side by side:
      · **zh / zh-Hant named the TREEMAP "树状图" / "樹狀圖" — literally "tree diagram", the
      name of a different chart in the same switcher.** A Chinese user picking a chart got the
      wrong one. Now 矩形树图 / 矩形樹圖, the standard terms.
      · **Tamil had the identical collision** — மரவரைபடம் (tree-diagram) for treemap against
      மரம் (tree). Now கட்டப் படம்.
      · **"Organic" was translated by the word, not the meaning, and landed on the FOOD sense
      in three languages** — 有机布局 · 有機圖 · இயற்கை all read "organic produce". Translated
      by meaning now (网络图 · 網絡圖 · வலைப் படம் · Rangkaian · नेटवर्क). English keeps
      "Organic" because the Gallery's wording wins; `charts.ts` records why it is still the
      weakest name in the set and what a better one would be.
      **This is what a registry is for: the names only look wrong once something forces them
      into one list.**
- [x] Every surface consumes it. A chart's name is defined in exactly one place, or they drift
      apart again within a few releases. **The Gallery's existing names win**; change the
      other surface.
- 🛑 **Reconciled, and it differs in BOTH directions** (written into `charts.ts`, not silently
      absorbed): `Progress Bars` → the Gallery's **Budget** (it is budget-vs-actual on a shared
      RM scale, not a progress meter) · `Node-Link Diagram` → the Gallery's **Organic** ·
      Sankey, Tree, Treemap agree. **`Horizontal Bar Chart` and `Summary Metrics` have no
      Gallery entry AND no renderer** — 7.4 lists Horizontal Bar separately from Progress Bars,
      so it is a chart that does not exist yet, and Summary Metrics is arguably a stat row
      rather than a chart at all. **The Gallery ships a seventh 7.4 omits: `Flow`**, live today
      at `/graph?mode=flow`. The priority order stands and `CHART_ORDER` follows it.
- [x] The explanation travels with the chart — a disclosure on `/graph`, **open by default on
      the Sankey** for exactly the reason the brief gives, and in the showcase caption.
- [x] Registry entries are **keys, never literal strings** — and they point at the *existing*
      `mode.*`, `g.caption.*` and `gallery.*.b` keys rather than a new set, which would have
      been the very drift this task exists to remove.
- [x] **The demo's missing Graph Showcase** is now `app/GraphShowcase.tsx`, the *same*
      component `/gallery` uses — not a copy. No login, explanations included, **deep-linkable
      per chart** via the URL hash (`/demo#chart=treemap`), which survives a reload and needs
      no server, so it works from the static snapshot with the origin machine off.
      `replaceState` rather than assigning `location.hash`, or Back would walk the user through
      every chart they had looked at instead of leaving the page.
- ⬜ **Live rendering over the demo's own ledger waits on Task 7.5's seed data**, which does not
      exist yet; the showcase shows the Gallery's figures, which is what survives with no
      database. The registry is where the live version drops in — the names and explanations
      already come from one place. *(Lazy-loading per renderer belongs with that, not with
      static images.)*
- 🐛 **Two layout bugs, found by measuring at 375px rather than looking.** The demo's column was
      missing `w-full`: `mx-auto` on a flex item in a **column** parent suppresses cross-axis
      stretch, so it sized to *fit-content*, any horizontally-scrolling child drove its
      min-content up, and `max-w-lg` capped the blow-out at exactly **512px** — which is why a
      375px phone scrolled sideways by 137px regardless of what was actually too wide.
      `min-w-0` does **not** fix that; the size was never coming from the automatic minimum.
      **The Dashboard tab was already overflowing to 401px before any of this work existed.**
      All four demo tabs now measure 375 at 375.

**8 · Task 7 — Dashboard** — 🔶 **part done 2026-08-23** `[Technical][Relevance]`
> Its blockers have all landed. Done so far: **every chart survives 0 / 1 / 2 / 200+ items**
> (`check:charts`, now a gate) and **the Sankey consumes the three kinds** — a transfer
> terminates at its goal instead of drawing as money leaving, proven by `check:attribution`.
>
> ✅ **Sankey at 375px — done 2026-08-23, and it was a real bug on the live site.**
> `min-width: 680px` on a 375px phone dragged the WHOLE PAGE to 738px — header, nav and
> all scrolling sideways — because `<main>` lacked `w-full` and grew to fit rather than
> letting the chart container clip. The brief's first-choice strategy is taken, split
> across the two mechanisms that can actually deliver it: **layout in CSS**
> (`min-w-0 sm:min-w-[680px]`), because it has to be right in the server-rendered HTML or
> the first paint overflows; **aggregation in JS**, because folding twelve bands to six is
> a re-render rather than a layout shift and can safely follow hydration.
> Two approaches were tried and rejected first: a ResizeObserver on the chart's own box fed
> back on itself (it measured the element `minWidth` was inflating, so the box always
> reported ≥640 and the floor never came off), and a JS-only width arrived after the page
> had already jumped. **Verified 320 / 375 / 768: the page is now exactly the viewport
> width at each.**
>
> ⬜ **Still open, and the largest single item in the brief is among them:**
> **Ask Honey "what if?"** (parse → compute → narrate, the model never doing arithmetic,
> working with no key, asking for a price rather than guessing one, and the privacy check
> where partner B must not extract partner A's records) · the **Dashboard rebuild** itself
> (remove `Add a spend`, edits opening the *same* editor as Record, and the 🛑 that its
> filter must never write back to Record's default) · **live translation** including chart
> labels drawn into SVG · **Sankey at 375px** (pick one of the three narrow-width strategies
> and verify at 320px) · **view instrumentation** so Tree/Treemap/Node-Link get pruned on
> evidence · **demo seeds** exercising all seven types.
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
- [x] ~~**Ask Honey — "what if?"**~~ — ✅ **DONE 2026-08-23. Rebuilt as three stages, and
      the rebuild found two real defects in what was already shipped.**

  **`parse → compute → narrate`**, in `askIntent.ts` → `askCompute.ts` → `askNarrate.ts`,
  orchestrated by `copilot.ts`. 51 checks in `npm run check:ask`.

  ✅ **The model never does arithmetic — and is not trusted not to.** Stage 2 produces
  every number and publishes them as an allowlist; stage 3 extracts every figure from the
  model's prose and discards the whole answer if one is not on it. *"Never invent figures"
  was already in the system prompt.* A system prompt is a request made of a probabilistic
  system; `verifyNumbers` is the enforcement. The failure mode being defended against is
  not a wild lie — it is a plausible extra figure in an otherwise-correct sentence.

  ✅ **Stage 2 works with no model at all.** The template is the floor, not the fallback:
  fully i18n'd, always correct, and identical in its numbers. AI changes the wording and
  nothing else.

  🛑 **The previous version had the model doing the arithmetic**, and kept a
  deterministic path only for when no API key was set — so the two paths answered with
  different rigour, and *which one you got depended on an environment variable.*

  🛑 **PRIVACY — the leak was already live, exactly where the brief said to look.**
  `askHoney` read the whole household with no notion of who was asking, while the record
  list on the same screen honoured Task 6's `visibility` / `paid_by`. **The list said no
  and the chat box said yes, about the same rows.** Now every fact that could carry
  record-level detail goes through `getSpendRecords(..., { viewerMemberId, redact })` —
  the same filter, in the same query, as the list. H-Score, income and bucket allocations
  stay household-level on purpose: both partners already see them, and a shared score that
  changed depending on who asked would be a worse lie.
  **Proven discriminating**: with the filter B sees RM4,634; without it, RM991,158 — so
  the check fails against the old behaviour rather than passing vacuously.

  ✅ **No price is ever guessed.** "Can I afford a TV?" asks for one and says why it
  will not invent one. Guessing turns a budgeting tool into a product recommender — a
  different product with a different risk profile — and a looked-up price is someone
  else's TV. A model that helpfully fills one in is caught by `validateIntent`.

  ✅ **Consequence, not verdict.** *"RM2,000 fits inside the RM5,103.72 of headroom left
  this month. It would take your buffer from 6.5 to 6.5 months, and your H-Score from 81 to
  75."* Never "you can afford this" — asserted by a check.

  ✅ **Scope held at the TYPE level, not just in the prompt.** `IntentKind` is an
  allowlist, so there is no code path that answers "which unit trust?" at all. Declines run
  FIRST and win: *"should I invest my RM5,000 bonus?"* used to parse as `afford(5000)` and
  get a confident, irrelevant answer — **the number is what makes the wrong reading look
  right.** Declines route to the licensed directory rather than dead-ending.

  🛑 **A one-off is not a new habit — found by testing against the live household.**
  A single RM2,000 holiday came out as a **13-point** H-Score drop, because subtracting a
  lump sum from `savingsMonthly` — a 90-day AVERAGE — models a family that stopped
  saving permanently. Worse, it was **charged twice**: once against the savings flow and
  again against the pot. Now the flow absorbs what it can across the window and only the
  excess touches the buffer. Same purchase: **81 → 75, buffer unchanged.** RM50,000 still
  correctly empties it (81 → 50).

  ✅ **Honest about thin data.** Below 8 records or 14 days, Honey **declines to project
  and says why** rather than forecasting with a disclaimer stapled on. Above it, the
  confidence is stated in the sentence itself, not in a footnote.

  ✅ **Persistent, visible scope line** under the chat surface — never in settings,
  because the person who needs it is the one about to act on an answer. Both badges now say
  the numbers were **calculated**, because in both cases they were; the old "AI" /
  "rule-based" pair flattered the wrong path.

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
- [x] No microphone permission prompt fires anywhere in the app — `npm run check:mic`
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

### ⏸ Where we left off — 2026-08-25, 11:00

**Everything below is deployed and verified AT THE ORIGIN
(`honeymoney-app.domcloud.dev`) and invisible at `honeymoney.app`, for one reason.**

- [ ] 🛑 **PURGE THE CLOUDFLARE CACHE. Nothing else today reaches a judge until this is
      done.** Dashboard → honeymoney.app → **Caching → Configuration → Purge Everything**.
      Two separate poisonings, one fix:
      - A stylesheet 404 was cached under `max-age=14400` while Passenger was respawning
        mid-deploy, so **the site renders completely unstyled**. The origin serves that file
        200. A cached 404 on a content-hashed asset cannot be rebuilt away — the hash IS the
        content, so every later build emits the same filename and inherits the entry.
      - `/deck` still hands out the **pre-merge PDF** — the one with `fatique` and RM348k.
        Five correct deploys today; the edge has served none of them.
      - `deploy/domcloud/push-build.ps1` now verifies every asset at the origin before
        reporting success, so this cannot recur. It cannot clear what is already cached.
      - Confirm after: `curl -s https://honeymoney.app/deck/HoneyMoney_Pitch_Deck_MAIC2026.pdf | md5sum`
        → `c0a6330ba7b2579259208d8b47c8b872`, and `cd web && node scripts/check-tap.mjs https://honeymoney.app`.

**Deck punch list — 10 items, 8 done.** Slide-by-slide reference, with the exact text for
each: <https://claude.ai/code/artifact/04040f56-39de-4ff3-be8e-29a357497c2f>

Fixed and shipped: `fatigue`; `local-first` → `household knowledge graph` in the Tech Lead
bio (the last place that phrase survived — see the data-custody block below); the
RinggitPlus statistic **with its source inline**; sponsored seats back on the Phase 2 card
so slides 8 and 9 agree on Year-2 revenue; the redundant "mth"; slides 11 and 12 renumbered;
RM384k and DeepSeek/Qwen preserved throughout. Current deck: 12 pages, 2.5 MB, 1,265
extractable words, `c0a6330b`, identical in `docs/deck`, `web/public/deck` and `Submission/`.

- [ ] **Slide 6 — the deck still has no answer to "how do you stop the AI inventing
      numbers?"** The tagline edit went in instead of the verification claim. Drop this into
      the empty band beside the "$300 credit" line: *"The AI proposes; the user commits —
      nothing is saved until they confirm it. Our code works out every figure, and any number
      it didn't produce discards the whole answer."* Both halves are true and both are in the
      code (`SpendCapture`: capture never saves on its own · `askNarrate.ts`: numbers checked
      against the compute stage's allowlist, one unrecognised figure discards the answer).
      This is the strongest Technical Feasibility claim available and it is currently absent.
- [ ] **Slide 6 — the tagline is set TWICE and the two copies now disagree.** The white pill
      reads "…knowledge graph **for all user-verified inputs**."; the letter-spaced banner
      under the title still ends "…KNOWLEDGE GRAPH." Match them or revert the pill. Note the
      banner is tracked caps and grows fast — check it does not shrink or wrap.
- [ ] **Slide 10 has no page number at all.** It used to be stamped `09` (a duplicate of
      slide 9); the renumbering pass fixed 11 and 12 and deleted 10 rather than setting it.
      Slides 2–9, 11, 12 are correct.
- [ ] Slide 3 — "public pages served 24/7 from Cloudflare's edge" (the small half of the
      restore-the-operational-facts item).
- [ ] Polish, none of them costing a mark: `Must ‑Paid` carries a non-breaking hyphen plus a
      stray space (retype the label, find-and-replace will not catch it); the closing slide
      holds three stacked copies of the Problems/Solutions text box — it RENDERS correctly,
      but copy-paste and screen readers get "FragmFragm ented, messy…".

**Also shipped today, live and verified:** mobile `/record` unfrozen (see the Shipped block
above — 372 KB → 49 KB, 4 450 → 255 DOM nodes, 43 → 61 fps under a 4× CPU throttle, all five
tabs hit-tested tappable); `/graph`'s header reduced to the currency switcher; `npm run
check:tap` added; `build-deck-pdf.mjs` now refuses to render the stale HTML over a Canva
export (reads the Producer via `pdfinfo`, `--force` to override).

- [ ] **Editorial source is now Canva, not `PITCH_DECK.html`.** The `.pptx` is committed.
      The HTML deck and the shipped deck are different documents — the HTML one still carries
      the RinggitPlus statistic and the "Honey never does the maths" paragraph. Decide whether
      to retire `PITCH_DECK.html` or keep it in step; leaving it is fine now that the build
      script refuses to clobber, but a stale second deck in the repo will confuse someone.

### 🧭 Data-custody position — decided 2026-08-25, NOT yet built

**Where we want to be: we sell the software, we are not the custodian of the household's
money records.** Recorded here because the discussion that produced it also corrected a
premise the team was carrying, and because saying it in the present tense before the code
exists is the single most dangerous thing we can do in this submission.

**The premise that was wrong.** "We cannot store private data, so we only store the trend"
is not what HoneyMoney does. It stores full records — `transactions` carries amount,
currency, vendor, date, category, `receipt_ref` and attachments — and `docs/PRIVACY.md`
already says so, in English and Malay: *"Money records you enter: amounts, dates, who paid,
which bucket, any note or photo you attach, and any receipt text you scan"* (§What we
collect), *"store your records"* (§Why), *"servers in Singapore"* (§Where). It has to: the
ledger, the audit trail, the H-Score, the graph and `/records` all read those rows. And
`visibility: "private"` means private FROM THE PARTNER — a query filter
(`visibility != 'private' || paid_by = you`), not encryption, not absence. Anyone asked
"can you see my private spending?" answers "your partner cannot; we operate the database,
and the notice says so." Volunteered it reads as rigour; extracted it reads as a gap.

**"Trends under an anonymised opaque ID" does not get us there either.** That is
PSEUDONYMISATION. A per-user trend row is a cohort of one, and our own
`web/src/lib/aggregateDisclosure.ts` already states the standard we are held to:
*"Anonymised does not mean 'the name column was removed'; it means the reader cannot work
out who, and small groups defeat that on their own."* `MIN_COHORT = 10` in that file is a
contractual promise in `docs/LOI_TEMPLATE.md` §5, not a tuning parameter. Spending patterns
are near-fingerprints, so a per-user trend row stays personal data under PDPA — the full
re-architecture cost, almost none of the legal relief.

**So split the claim by RELATIONSHIP rather than trying to make one mechanism carry both:**

| Relationship | Mechanism | The word we may use |
|---|---|---|
| User ↔ employer/sponsor | cross-user aggregates, suppressed below k=10 | **anonymised** — accurate, already coded, already in the LOI |
| User ↔ HoneyMoney | end-to-end encryption; we hold ciphertext we cannot read | **we sell software, not access to your money** |

End-to-end encryption, not local-only storage, is the version that ships. The hard part of
"records live on the user's own phone" is not storage, it is THE HOUSEHOLD: two partners on
two devices need a shared must-paid view AND private personal records, which needs sync,
which needs something in the middle. Local-only also throws away the daily off-machine
backup, cross-device access, and makes a lost phone a lost financial history. Encryption
keeps all three and still answers "can you read it?" with no.

**Hard rules until the code exists:**
- [ ] **Do not edit `docs/PRIVACY.md` to describe the plan.** It is accurate today and it is
      in the submission pack. A notice describing storage we have not built is a false
      statement to real data subjects — a PDPA problem, not a pitch problem. Code first,
      notice second.
- [ ] **Nothing in the present tense in the deck.** Slide 11's "local-first knowledge graph"
      is exactly this overclaim and is already on the punch list; it is the one place the
      phrase survives after being removed everywhere else, and it contradicts the privacy
      notice submitted beside it.
- [ ] Roadmap wording, when we add it: *"Phase 2 — household records encrypted so we cannot
      read them; employer reporting aggregate-only, suppressed below ten participants."*

**Already true and worth saying today:** we have never held a bank credential and have no
bank connection — every record is one the user entered; receipt OCR runs in the browser;
no analytics SDKs or data brokers, visit counts only with no IP and no account link; and
the k≥10 suppression rule exists as a function BEFORE the feature that needs it.

- [ ] **Who are `Peter OKORONKWO` and `JENNIFER` (×2)?** The live database holds **16
      households · 9 users · 249 transactions**. Three are the demo personas (Rahman,
      Aisha, Nadia & Faiz) and most of the rest are ours (Just Fifty, kiawchua, ww.pong ×2,
      Alvin Chua, Site Admin ×2, Diag ×2). Those three do not match the team. If they are
      outside sign-ups on a live public site then we are not "only storing our own study"
      — they are data subjects with access, correction and withdrawal rights against
      records on the Singapore server, today. Identify them before saying anything public
      about data custody.

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
    (`89163e8`) and the Cloudflare Pages project is live at `honeymoney-ci3.pages.dev`.
12. [x] ~~**Point honeymoney.app at Pages**~~ — ✅ **DONE 2026-08-23. The apex is
    fronted by Cloudflare's edge, and the laptop is no longer a single point of
    failure for the public site.**

    `honeymoney.app/` and `/gallery` now answer with
    `X-HoneyMoney-Served: edge-snapshot` — served from Cloudflare, not from this
    machine. `/dashboard` and `/record` still reach the origin, which is the
    design: public pages survive the laptop being off, and the signed-in app
    degrades to a real offline page instead of a Cloudflare 1033.

    🛑 **Why this took three days: the 2026-08-20 "four dashboard clicks" was
    undoable.** The domain and the Pages project were in **two different
    Cloudflare accounts** — the zone under Justfifty1976, the project under
    Youngpong — so the Custom domains page the instruction described did not
    exist in the account being looked at. Rebuilt in the domain's account as
    `honeymoney-ci3.pages.dev`.

    🛑 **And the records were `Type: Tunnel`, not CNAME.** Cloudflare manages
    those specially: the Edit dialog only offers a tunnel to point at, and "Add
    record" refuses with *"An A, AAAA, or CNAME record with that host already
    exists"* because the Tunnel record occupies the name. **Delete, then add** —
    editing is not available for that type.

    ⚠️ **THE MISTAKE THAT NEARLY BROKE THE SIGNED-IN APP, and the lesson.**
    Deleting the three Tunnel rows took `origin.honeymoney.app` with them. That
    hostname is not decoration: it is `ORIGIN_HOST` in `deploy/pages/_worker.js`,
    the address every dynamic route is proxied to. With it gone the apex still
    looked healthy — the public pages were being served by Pages — while
    `/dashboard`, `/record` and every API call had nowhere to go. **A green
    homepage proved nothing about the app.**
    Restored with `cloudflared tunnel route dns honeymoney origin.honeymoney.app`
    and verified 200 before moving on.
    **If you ever rebuild this DNS: the apex and `www` point at Pages; `origin`
    points at the tunnel; deleting `origin` breaks everything a user logs in for.**

    ✅ **`www.honeymoney.app` restored** as a proxied CNAME to
    `honeymoney-ci3.pages.dev` — it was briefly dead between the Tunnel record
    being deleted and the CNAME being added. Both hostnames now answer
    `edge-snapshot`.

    **The final DNS shape, worth keeping:**

    | name | type | target | why |
    |---|---|---|---|
    | `honeymoney.app` | CNAME (proxied) | `honeymoney-ci3.pages.dev` | public pages from the edge |
    | `www` | CNAME (proxied) | `honeymoney-ci3.pages.dev` | same |
    | `origin` | **Tunnel** (proxied) | the `honeymoney` tunnel | **what the worker proxies to — never repoint this** |

    ✅ **`verify-uptime.ps1` is fully green**, including **APEX FRONTED BY PAGES**
    for the first time since the item was written.

    ℹ️ Both custom domains still read `status: pending` in the Pages API. That is
    Cloudflare's own certificate bookkeeping catching up and does not gate
    serving — the apex is already answering from the edge. It should clear on its
    own; if it has not within a day, remove and re-add the domain in the project.

    ↩️ **Rollback:** `cloudflared tunnel route dns honeymoney honeymoney.app`
    puts the apex back on the tunnel.

    ⬜ The old project still exists in the Youngpong account at
    `honeymoney-e84.pages.dev`. Delete it once `www` is green, so nobody deploys
    to the wrong one.

    ⚠️ Re-run `npm run site:build && npm run site:deploy` after **any** change to
    a public page — the snapshot is point-in-time and does not update itself.
    `CLOUDFLARE_ACCOUNT_ID` (a Windows **User** env var) now points at the
    domain's account; a shell opened before 2026-08-23 still carries the old
    value and will deploy to the wrong account.

13. [ ] **DOM Cloud** (https://domcloud.co) as the always-on host, so `/graph`, `/record`,
    `/dashboard`, `/hscore`, `/goals` and `/api/*` survive the laptop being off. Verified
    against their docs 2026-08-23 — an earlier version of this item got two things wrong.

    **Why this one and not the obvious names:** every Cloudflare compute product is
    serverless with no persistent writable disk, and PocketBase is a Go binary that writes
    `data.db` to one — so the Tunnel to the laptop is not a shortcut, it is the consequence
    of needing a disk from a vendor that does not rent them. Oracle's always-free tier is
    used up. Google Cloud's e2-micro is genuinely free forever but **requires a credit
    card** and is US-region only. Alibaba's KL region has the best latency for Malaysia but
    its free tier is a *trial* that starts billing.

    ✅ **Free, permanently, with no credit card** — the only option checked that clears all
    three. Signup needs an invitation code **unless a GitHub account 6+ months old with at
    least one follower is linked**, which `justfifty` satisfies. SGP region, so <100ms from
    Malaysia. Non-sudo SSH and a real persistent filesystem; "anything that runs in Linux"
    may be installed, which is all PocketBase needs.

    ✅ **The storage blocker is cleared.** It was real: `.next` 713 MB + `node_modules`
    587 MB = **1.3 GB before PocketBase, `pb_data` or a single receipt**, against 1.5 GB
    free / 5 GiB Lite. `output: "standalone"` is now in `web/next.config.ts`
    **behind `NEXT_STANDALONE=1`** — opt-in, because `next start` (how this laptop serves
    the live site) refuses to run against a standalone build, and Next says so out loud.
    The result is **65 MB on disk, 21 MB over the wire** — measured by a real
    `deploy/domcloud/push-build.ps1 -DryRun`, not estimated. `node_modules` never reaches
    the host at all. The standalone server was also booted locally and served `/` and
    `/demo` at 200 before any of this was written down.

    ⚠️ **ARM only** — x64 servers are not offered on the free tier, so the `linux_arm64`
    PocketBase build, not the `amd64` one that runs here.

    ℹ️ **2 GB/month outbound**, resetting on the 1st. Survivable *because* Cloudflare Pages
    already fronts the public pages: only signed-in dynamic routes would reach this origin.

    ✅ **The inactivity policy is milder than this item used to claim.** It is not a monthly
    login: the plan extends **60 days on each login**, and **using over 50 MB of monthly
    traffic extends it too** — so a site with real users renews itself. If it does lapse
    there are 14 days to log back in before deletion. Still worth a calendar reminder while
    traffic is low.

    ### What it actually costs, checked 2026-08-23

    | | cost | card? | storage | notes |
    |---|---|---|---|---|
    | **DOM Cloud free** | **$0** | **no** | 1.5 GB | needs the GitHub trust link |
    | DOM Cloud Lite | $1.50/mo · **RM84/yr** | yes | 5 GiB | managed platform |
    | **RackNerd KVM VPS** | **$11.29/yr · RM53/yr** | yes | **21 GB + 1 GB RAM + 1.5 TB** | root, unmanaged |
    | PocketHost | **$9.99/mo** | yes | 250 MB DB | ❌ no longer free |

    🛑 **PocketHost was suggested here earlier as a free, card-free option. It is not one.**
    Checked against their pricing page today: **$9.99/month**, or $59.99/year. The free tier
    that made it worth naming is gone. Repeating a remembered price without checking it is
    how a plan acquires a step that cannot be taken.

    ⚠️ **RackNerd is genuinely cheaper than DOM Cloud's paid tier and not close** — RM53/yr
    against RM84/yr, for **4× the storage, 75× the bandwidth and root access.** The catch is
    not the price, it is that *unmanaged* means owning the OS: firewall, TLS renewal, systemd
    units, security patches. That is a standing obligation attached to a box holding a
    household's financial records, and it does not pause for a busy month. DOM Cloud's
    RM31/yr premium buys the platform being someone else's job.

    ✅ **The free path is not exhausted yet.** Trust is granted by a GitHub account **6+
    months old with ≥1 follower**. `justfifty` (created 2026-07-08, 0 followers) fails both —
    and *age cannot be fixed*, so it would not qualify until Jan 2027. **`integrations-space`
    (created 2013, 2 followers) satisfies both** and is already authenticated on this
    machine. Re-link that one before paying anything.

    ⬜ Order of work, database LAST: `output: "standalone"` → deploy Next.js there pointing
    at *this* laptop's PocketBase through the tunnel (proves the app runs elsewhere without
    risking data) → move `pb_data` → repoint the R2 backup job and carry
    `.pb-encryption-key` across, or the new host cannot open its own backups.

    ### 2026-08-23 — a year of DOM Cloud was bought, and the migration is built

    Everything that does not need the account is done and lives in
    **`deploy/domcloud/`** (runbook in its README): `app.deploy.yml`, two PocketBase
    variants, `start-app.sh` / `pb-start.sh` / `pb-run.sh`, `push-build.ps1` (build here,
    ship 21 MB over SSH) and `migrate-pocketbase.ps1` (backup → key → restore → read back).

    ✅ **The target is Lite, and `pb.deploy.yml` is the deployment.** Superseded by the
    2026-08-24 entry below; recorded here because this item originally read as though Kit
    were the destination and Lite a waiting room. It is not. Kit is unplanned.
    - **`pb.deploy.yml` — in use.** NGINX starts PocketBase per request via Passenger. The
      site is up 24/7. PocketBase's own scheduled backup cannot be relied on, so the
      backup is triggered from *outside* by `deploy/backup-pocketbase.ps1` on the
      `HoneyMoney-Backup` schedule — an arrangement that does not depend on the host's
      process policy at all, which is the more robust one on any plan.
      Open-source Passenger has no per-app instance cap, so under real concurrency two
      processes could open one `data.db` — safe against corruption under WAL, not against
      two processes disagreeing about cached settings. Kept in view, but proportionate:
      this origin serves single-digit signed-in users with Pages fronting every public
      page. Revisit if that changes, not before.
    - **`pb.deploy.kit.yml` — unused.** Kept only so the daemon arrangement is already
      solved if the plan is ever raised for traffic or storage. It is not a to-do, and
      DOM Cloud caps any process at 3 hours without the `docker` feature it asks for, so
      pasting it on Lite would be a fair-use violation rather than an optimisation.

    ⚠️ **Ship the app before the ledger, and point it at the tunnel first.** An app running
    on DOM Cloud against *this* laptop's PocketBase proves the host works while costing
    nothing if it does not. `origin` stays on the tunnel throughout; the new names are
    `app.` and `pb.`, so the cutover and its undo are each one DNS edit.

    ⚠️ **PocketBase is pinned to 0.39.6** — the version that wrote `pb_data` — not the 0.40.0
    that is current. A newer binary runs its own one-way data migrations on first start.

    ⬜ **Three things still need the dashboard**, because this machine holds no credential
    for the account: add `deploy/domcloud/id_domcloud.pub` (generated here, private half
    gitignored and never sent) as an SSH key, create the two websites, and paste the
    deployment scripts. Everything after that is `push-build.ps1`.

    🛑 **Not before the 31 Aug gate.** What a judge opens — `/`, `/demo`, `/deck` — is
    already 24/7 on Cloudflare's edge, and the signed-in app matters at the live pitch,
    where the laptop is open. Migrating the ledger under deadline pressure risks the one
    thing that cannot be recovered from.

    ### 2026-08-24 — committed, and two defects found by running it rather than reading it

    The migration is now **in the repo** (`931d0a1`), which it was not: `deploy/domcloud/`
    had been untracked since the day it was written, so the entire runbook existed on one
    laptop's disk and in no backup.

    ✅ **The 65 MB figure is measured, again, end to end.** `push-build.ps1 -DryRun` ran
    clean today: builds into `.next-dc`, stages `standalone/` + `static/` + `public/`,
    bundle **65 MB**, tarball written, exit 0. The storage blocker is genuinely gone, not
    provisionally gone.

    🛑 **Nothing ever shipped the PocketBase start script — the site would have deployed
    clean and then refused to start.** Both variants invoked a file
    (`app_start_command: bash ./pb-start.sh`, `bash ~/public_html/pb-run.sh`) that no path
    created. `push-build.ps1` ships `start-app.sh` over SSH to the *app* site; the
    PocketBase site is a pasted deployment script and nothing else, and the private repo
    rules out DOM Cloud's `source:` clone. Worse, `migrate-pocketbase.ps1` tests for
    `pb-run.sh` and falls back to *"passenger variant: will spawn on first request"* — so
    on a Kit site with the daemon script missing it would have printed a reassuring
    sentence about the wrong variant. Fixed by having each YAML **write its own** start
    script: the deployment runs on the host before any `scp` could, so a file the
    deployment writes itself has no ordering window. Generated by
    `deploy/domcloud/sync-embeds.mjs`; `npm run check:domcloud` fails on drift, because
    `pb-run.sh` is what passes `--encryptionEnv` and a stale copy is one that silently
    forgot the key.

    ⚠️ **`core.autocrlf=true` would have handed bash `set -euo pipefail\r`.** There was no
    `.gitattributes`, so a fresh clone on this Windows machine turns every `.sh` into CRLF
    — including `start-app.sh`, which `push-build.ps1` copies into the bundle verbatim and
    Passenger then executes. It fails only on the host, with an error naming an option
    nobody wrote. `*.sh text eol=lf` now pins it.

    ✅ **Verified, not asserted.** Both YAMLs parse; the write-command was extracted from
    each and *executed* in a sandbox; the resulting `pb-start.sh` and `pb-run.sh` diff
    identical to their sources with the executable bit set. The drift check was confirmed
    to **fail** against a modified source (exit 1) before being trusted to pass.

    ✅ **The plan is LITE** (5 GB / 20 GB / x64), bought 2026-08-24 → **`pb.deploy.yml`**,
    the Passenger variant. Checked against DOM Cloud's own docs rather than remembered:
    `docker` is *"only starting with Kit Plan or higher"*, and `docker` is what lifts the
    3-hour process cap.

    **Lite does NOT mean the site sleeps.** Worth stating because the cap sounds like it
    does: under Passenger, NGINX starts the app when a request arrives, so a visitor gets
    an answer at any hour. What Lite denies is a process resident *between* requests. The
    single consequence that matters here is that **PocketBase's own nightly cron backup
    will not fire**, because at 3am with no visitors there is no process for the cron to
    live in. Sizing is generous, not tight: 5 GB against a 65 MB bundle + 26 MB `pb_data`,
    20 GB against an origin that only serves signed-in routes.

    🛑 **The backup that compensates for that was broken for exactly this use, and had no
    schedule at all.** `deploy/backup-pocketbase.ps1` gated on `Get-NetTCPConnection
    -LocalPort 8090` — a *local* port, whatever `-PbUrl` said. After the migration the
    laptop's own PocketBase is stopped, so the gate would have waited 60s and reported
    *"PocketBase never came up on 8090"* every night while `pb.honeymoney.app` sat there
    healthy and unbacked. The gate now follows `$PbUrl`: loopback still checks the port,
    anything else polls `/api/health` — which is also what *spawns* a stopped Passenger
    app, so a slow first answer is the mechanism working. Verified three ways: loopback
    branch backs up; a non-loopback hostname resolving to 127.0.0.1 (`127.0.0.1.nip.io`)
    exercises the health branch and backs up; an unreachable host fails cleanly at 63s
    instead of hanging.

    ⚠️ And it was never scheduled — `HoneyMoney`, `-Demo`, `-Nudge`, `-Purge` existed,
    a backup task did not, so the last one before today was 2026-08-23 03:16 and manual.
    Registered **`HoneyMoney-Backup`**, daily 03:15, `StartWhenAvailable` because this
    laptop is off most nights. **After the migration it needs
    `-PbUrl https://pb.honeymoney.app` added, or it will faithfully back up the stale
    local copy and log success** — the failure mode being guarded against is a green light
    on the wrong database.

    ⬜ **Worth checking once the site exists:** whether Lite permits a host-side cron to
    curl its own `/api/backups`. If it does, the laptop leaves the backup loop entirely on
    Lite. The docs do not say either way, and this has not been tested — do not plan on it.

    ### 2026-08-24 (later) — PocketBase is LIVE on DOM Cloud, and the ledger is on it

    ✅ **`honeymoney-pb.domcloud.dev` is serving**, Lite plan, `sgp` (ARM64). `/api/health`
    200, valid Let's Encrypt chain, `robots.txt` in place, SSH by key as `honeymoney-pb`,
    PocketBase reporting **0.39.6** — the pin held on a host that would otherwise have
    taken the current release.

    ✅ **The ledger is migrated and VERIFIED BY READING IT BACK**, not by trusting the
    restore's exit code. Every collection matched local counts: transactions 242, nodes
    155, edges 77, ledger 20, members 13, tenants 9, app_users 8, hscore_snapshots 5,
    costs 1. 24 collections restored including `tenant_ai_keys`. The laptop's `pb_data` was
    never touched and the remote's previous copy is kept as `pb_data.replaced.<ts>`.

    🛑 **Five defects were found by deploying rather than by reading.** In order:
    `set -e` (the runner injects it, so the version guard's `HAVE=$(test -x …)` aborted the
    deploy on a fresh host and left Passenger serving *"bash: ./pb-start.sh: No such file
    or directory"*); **no SSH-keys page exists** in DOM Cloud, so the key now installs
    itself from the deployment script; `min_instances` and `add_header` are **silently
    dropped** by the runner's allowlists, the latter meaning the superuser UI was never
    actually `noindex` — a `robots.txt` does that job now; and two **BOM** bugs below.

    🛑 **PowerShell's pipeline writes a UTF-8 BOM, and it broke the migration twice.**
    `"text" | ssh 'cat > file'` prepends `EF BB BF`. So `~/.env.pocketbase` began
    `﻿PB_ENCRYPTION_KEY=…`, which defines a variable *named* `﻿PB_ENCRYPTION_KEY`
    while `PB_ENCRYPTION_KEY` stays empty — `pb-start.sh` then omitted `--encryptionEnv`
    and PocketBase refused to open the encrypted `pb_data`. The restore had worked
    perfectly; it simply could not be opened. The same BOM turned the restore script's
    first line into `set: command not found`, so the restore ran **without** error handling
    during the one operation that most needs it. Both now write via an explicit BOM-less
    encoder and `scp`, never a pipe, and the script refuses to ship a file that still
    starts with a BOM. It also verifies the remote shell can *read* the key back, since an
    unreadable key and a missing one are indistinguishable until the 500.

    ⚠️ **Windows OpenSSH rejects a key whose ACL others can read** and then falls back to
    prompting for a password — which in an unattended run is a hang, not an error. A key
    generated inside the repo folder inherits exactly that ACL, and Git Bash's ssh does not
    check it, so the same key worked from one shell and hung in another. The migration
    script now repairs the ACL itself, idempotently.

    ### 2026-08-24 (evening) — honeymoney.app is 24/7, and there is one database again

    ✅ **The app runs on DOM Cloud** at `honeymoney-app.domcloud.dev` and
    **`honeymoney.app` now serves its signed-in half from there.** One constant in
    `deploy/pages/_worker.js` — `ORIGIN_HOST`, moved off the laptop's tunnel. No DNS
    change, no new vendor, the public URL untouched.

    🛑 **The first deploy of that changed nothing, and every check said it worked.**
    `wrangler.toml` sets `pages_build_output_dir = "dist"`, so the worker that ships is
    `dist/_worker.js`, written by `scripts/build-static-site.mjs` — not the file that was
    edited. Deploying without rebuilding shipped the previous day's worker. The deployment
    was Production on `main`; every route returned 200; `/api/health` was byte-identical
    between origins; build IDs and chunk hashes matched. **Two correct copies of one app
    cannot be told apart from their answers.** It was settled by asking the DESTINATION:
    a tagged request to honeymoney.app, then grep on DOM Cloud's nginx access log. Absent
    before the rebuild, present after — logged as HTTP/2.0 where direct curl logs
    HTTP/1.1. **Order is `site:build` then `site:deploy`**, and that is also the rollback
    order.

    ✅ **The two-database problem is closed.** `web/.env.local` now points at
    `https://honeymoney-pb.domcloud.dev` with the rotated password, so on the laptop's
    next restart it reads the same database the public site does. `HoneyMoney-Backup` was
    repointed with `-PbUrl` and **run to prove it** — a backup created on the live
    database, verified present. Without that flag the script defaults to
    `127.0.0.1:8090`, which is now a stale copy: it would have reported success nightly
    while backing up the wrong database.

    ✅ **Backup history is continuous.** The DOM Cloud PocketBase inherited the R2 S3
    settings with `pb_data`, so both instances write to the same bucket. A final laptop
    snapshot was taken before the switch and sits alongside the new ones.

    ⚠️ **One window remains until the laptop is restarted.** The process serving port 3000
    started before the env change and still holds `POCKETBASE_URL=127.0.0.1:8090` in
    memory, so `origin.honeymoney.app` — still resolving, still reachable — would write to
    the stale copy. Nothing routes there any more (the worker does not), so it takes
    someone typing that hostname deliberately. **Use honeymoney.app until the restart.**
    The restart needs `deploy/install-restart-task.ps1` run once, elevated; that is the
    same step blocking the `/setup` AI engine picker.

15. [ ] **Per-household AI keys — Ask Honey without an admin.** Raised 2026-08-23.

    ✅ **Shipped now, because it needed no data model:** `/setup`'s AI section stopped
    *describing* the engine and started *probing* it. **Test AI connection** calls
    `/api/ai/check`, which asks each configured provider to reply "OK", and the panel
    distinguishes the three states that need different actions — **not configured**, **key
    set but rejected**, and **answering, with latency**. Collapsing the middle one into
    "not set up" sends people to re-paste a key that was never the problem. Each engine
    carries its own enable steps (Groq · Gemini · Ollama), and the panel says where Ask
    Honey then appears, which is the Dashboard.

    ✅ **`/setup` is now reachable from `/more`.** It never was — the hamburger was the
    only way in, so a phone user who tapped **More** looking for AI settings found the
    ledger, the household and the guide, and no way to switch the AI on. That is the
    literal report this item came from.

    ✅ **Per-household keys are now shipped too, encrypted.** The reason to hesitate was
    real and is answered rather than deferred: a household AI key is a live billable
    credential sitting beside a family's ledger, and PocketBase's settings encryption does
    **not** extend to collection fields — so a plain `text` column would put it in every
    backup zip in the clear. `web/src/lib/aiKeys.ts` encrypts with **AES-256-GCM** under
    `AI_SECRETS_KEY` before PocketBase ever sees the value.

    - **GCM, not CBC**, because it authenticates. A tampered ciphertext must refuse to open
      rather than decrypt to garbage that then gets sent to a provider as if it were a key.
    - **No master key, no storage.** Saving is refused with instructions; it never
      downgrades to plaintext. A silent plaintext fallback is invisible precisely because
      everything appears to work.
    - **`key_cipher` and `key_last4`, never `key`.** The last four characters answer "is the
      key I think is here the one that is here?" and nothing else. A stored key is never
      sent back to a browser.
    - **Superuser-only**, verified: all five API rules are `null`, so no browser can read
      the collection. Confirmed by reading `_collections` out of a throwaway database.
    - **Owner-only to change**, via `manage_members`. A key is billed to whoever issued it.
    - **Validated on save**, against the live provider, so a wrong key fails in front of the
      person who can fix it instead of inside an unrelated question about their savings.
    - **Scrubbed from errors.** Gemini takes the key as a *query parameter*, so an upstream
      change is all it would take for a URL to reach a browser and a log.

    ✅ **`npm run check:aikeys`** measures the claim rather than asserting it: round trip,
    **ciphertext does not contain the key in any obvious encoding** (a "cipher" that merely
    base64-encoded would pass a round-trip test and fail this one), tampering refuses to
    open, a different master key cannot open it, and a malformed `AI_SECRETS_KEY` is
    rejected rather than stretched to fit. 9/9.

    ⚠️ **A bug this found, worth keeping.** Scrubbing the key out of error messages wrapped
    every error in a fresh `Error` — which discarded `AuthError`'s status and turned every
    signed-out `POST /api/ai/key` into a **500 instead of a 401**. The scrubbing was right;
    the wrapping threw the status away. Caught by curling the route signed out, not by the
    type checker, which was perfectly happy.

    ⚠️ **`AI_SECRETS_KEY` is now load-bearing, and it fails SOFTLY** — unlike
    `deploy/.pb-encryption-key`, which stops PocketBase dead. A host restored without it
    keeps the rows and cannot read any of them: households drop silently back to the
    server's engine and their saved key is simply gone. It is in `.env.example` and in the
    DOM Cloud runbook's env block for that reason.

    ⬜ **Still open:** the migration is applied on a throwaway database, not on the live one —
    it lands on the next PocketBase restart. And key **rotation reminders** and a
    per-household **spend cap** are not built; `ai_usage` already records enough to add both.

14. [x] ~~**Back up PocketBase off this machine.**~~ — ✅ **DONE 2026-08-23. The ledger
    now exists in more than one place, and a backup pulled back out of R2 has been
    restored and verified.**

    Found 2026-08-22: `pb_data` had **no `backups/` directory at all** — the entire ledger
    existed in exactly one place, on a laptop that is off most of the week.

    ✅ **PocketBase uploads to Cloudflare R2**, nightly `0 3 * * *`, keeping 14. Bucket
    `honeymoney-backups` in the Justfifty1976 account. Configured by
    `deploy/setup-r2-backups.mjs`, which also took a real backup **and listed it back from
    R2** — a configured backup target that has never been written to is a guess.
    ✅ **Round-trip proven**: the zip was downloaded out of R2 with `wrangler r2 object get`
    and restored by `deploy/test-restore.ps1`. Restoring a local file only ever proved the
    local file.

    🛑 **THE ENCRYPTION KEY IS NOW AS CRITICAL AS THE BACKUPS THEMSELVES, and an earlier
    version of this item said the opposite.** It claimed a backup would restore without the
    key and merely lose the settings block. **Measured 2026-08-23 — it does not start at
    all:**

        invalid settings db data or missing encryption key ""

    Verified both ways against the same R2 zip: without the key PocketBase exits
    immediately; with it, it starts and the ledger reads. So `deploy/.pb-encryption-key` is
    not a convenience protecting SMTP and S3 fields — **it is required to open any backup
    taken since encryption was switched on.**
    ⬜ **Put that key in a password manager.** Not in a HoneyMoney backup (it would be
    encrypting itself) and not only on this laptop (the machine the backups exist to survive).
    **A perfect backup you cannot open is not a backup.**

    ✅ Settings encryption itself is on — PocketBase starts with
    `--encryptionEnv=PB_ENCRYPTION_KEY`, the key passed as an env var rather than on the
    command line where anything able to list processes could read it. **This had to come
    before R2**: the S3 credentials live in settings, settings live in `data.db`, and
    `data.db` is the file being uploaded, so an unencrypted backup would carry the keys to
    its own bucket. `setup-r2-backups.mjs` refuses to configure S3 unless encryption is on,
    so the ordering cannot be tripped later by someone in a hurry.

    ### 🛑 The capacity limit, and why it is the retention multiplier rather than the ledger

    Measured today: 9 households, 241 records, `data.db` 1.8 MB, `storage/` **empty** — no
    receipts uploaded yet. The ledger is negligible. **Receipt images are what grows**, and
    every backup is a FULL copy:

    | | |
    |---|---|
    | R2 free tier | 10 GB, zero egress |
    | Retention | **14 full copies** |
    | ⇒ max live data | ~**700 MB** |
    | at ~250 KB/receipt (1600px q0.85) | ~**2,800 receipts across all households** |

    That 14× is the real constraint. Enormous headroom today; worth handling before there
    are real users rather than after.

    ⬜ **Do not warn or quota users — engineer it away.** A storage message is a poor first
    impression for a product whose pitch is logging spend without friction. Three cheaper
    levers, in order:
      1. **Retention shape** — 7 daily + 4 weekly is ~11 copies with better coverage than 14
         dailies, and buys back headroom immediately.
      2. **Age out receipt IMAGES at 12–18 months, keep the records forever.** Nobody audits
         a two-year-old kopi receipt, and the ledger stays complete.
      3. **Size check in `verify-uptime.ps1`** so 50% of R2 is discovered on a Tuesday rather
         than 100% during a demo.

    ⬜ **Not git, deliberately.** `pb_data/` is gitignored and must stay so: it is real
    household financial data and the repo link goes to MAIC judges; SQLite is binary and
    rewrites wholesale, so every backup would add ~2 MB to a history that can never be
    reclaimed (~770 MB/year); and backups need to be *restorable*, not *versioned*.
    Google Drive would work but has no S3 API, so it would need rclone or the sync client
    running **on the laptop** — adding a moving part to the machine whose reliability is the
    thing being designed away.

_Last updated: 2026-08-22_
