# HoneyMoney — Demo Video Script (MAIC Nexus 2026, Track T3)

**Target length:** 2:45 (hard cap 3:00). **Format:** screen recording of the live
app + Telegram, with voiceover (VO). **Goal:** show a *working* end-to-end path —
capture → confirm → **ask Honey** → graph → projection → proactive nudge — while
touching every judging criterion.

> Record at 1080p. Calm, confident tone beats a rushed one. Every screen is real
> (no mockups — a disqualifier). Captions always on for muted viewing.
> Word budget ≈ 150 wpm → keep narration under ~410 words. Hook in the first 8s.

---

## Shot list (beat → seconds → rubric)

| Time | On screen | Voiceover | Caption | Rubric |
| --- | --- | --- | --- | --- |
| **0:00–0:08** | Cold open on a messy pile of e-wallet screenshots / a couple tense over a phone (no title card). | "In Malaysian homes, money is the number-one thing couples fight about — and that stress follows them to work." | *Money = #1 household conflict* | Relevance |
| **0:08–0:20** | Cut to HoneyMoney at **honeymoney.app** (logo in motion). | "HoneyMoney gives couples funding transparency and spending autonomy — no tracking fatigue. Here's the whole loop, live." | *honeymoney.app — live product* | Commercial |
| **0:20–0:33** | The **3-Bucket** dashboard: Must-paid · Savings · Spendings. | "Money flows into three buckets — Must-paid, Savings that auto-sets aside *before* you spend, and Spendings: the private bucket, where tracking simply stops." | *3 buckets · autonomy over surveillance* | Relevance · ESG |
| **0:33–0:58** | On **/graph**, use **SpendCapture**: 📷 *Scan receipt* (on-device OCR prefills vendor+amount) — optionally 🎤 *Speak* "25 ringgit at Speedmart". Then confirm the bucket on the dashboard **Add spend** form. | "Capture is frictionless and private — scan a receipt or just say the spend. It runs on-device, costs zero AI tokens, and you confirm the bucket before anything saves. The human always decides." | *Scan or speak — on-device, zero tokens, you confirm* | Technical · ESG |
| **0:58–1:24** | **Ask Honey** panel on the dashboard. Type: *"Can we afford RM2,000 for a Raya trip?"* → grounded answer appears. Then click the chip *"What's my EPF on RM4,000?"* → statutory answer. | "Now just ask, in plain language — can we afford two thousand ringgit for Raya? Honey reasons over *your own* plan and answers, grounded in your numbers, never judging. It even explains your EPF and take-home — real Malaysian figures, not guesses." | *Ask Honey — grounded in your plan, advice-free* | **Technical · Commercial · Relevance** |
| **1:24–1:42** | The **knowledge-graph** view (Sankey / organic): income → buckets → spend → goal. | "Under the hood, your money is a living knowledge graph — income into buckets, out to spending, toward goals. That structure is *why* Honey's answers are grounded, not made up." | *A real money graph — grounded, not guessed* | Technical |
| **1:42–2:02** | **Dashboard**: forward projection updating; scroll to the **Subscriptions & bills radar** (recurring charges + monthly total). | "The dashboard projects the month forward — and the subscription radar surfaces every recurring bill and duplicate. Money quietly leaking, found." | *Forward projection + subscription radar* | Technical · Commercial |
| **2:02–2:14** | Pre-staged **Telegram** screenshot: Honey's proactive nudge ("…heading over plan — rebalance together?"). | "And Honey is proactive — it messages you on Telegram *before* a bucket slips, not after." | *Proactive: warns before the shortfall* | Commercial · ESG |
| **2:14–2:30** | Quick pass: multi-currency/-language toggle; admin **AI cost/token ledger**; three personas. | "It's local-first — your data stays on your machine, a real PDPA story — with swappable free AI across Gemini, Groq, and local Ollama, and one engine for a person, a family, or a business." | *Local-first · multi-provider AI · one engine, 3 personas* | ESG · Scalability |
| **2:30–2:40** | Split card: free household tier + employer-sponsored seat + paid business tier; SDG 1/3/8. | "Free for households — we monetise through employers sponsoring wellness seats, and a paid business tier — mapped to SDG 1, 3, and 8." | *B2B2C wellness · SDG 1·3·8* | Commercial · ESG |
| **2:40–2:45** | End card: logo, **honeymoney.app**, "MAIC Nexus 2026 · Track T3". | "HoneyMoney — plan together, without policing each other. Live now." | *honeymoney.app* | — |

---

## Recording checklist

- [x] **Demo data already lights up the AI** (verified 2026-07-16): the demo household
      has **14 recurring subscriptions** for the radar and an **over-budget bucket** so
      Honey's insight + nudge have something real to say. No extra seeding needed.
- [ ] **(Optional but higher-wow) set a free `GROQ_API_KEY` or `GEMINI_API_KEY`** before
      recording, so the co-pilot answers *free-form* questions live instead of the
      rule-based fallback. The fallback is reliable and won't fail on stage if you skip this.
- [ ] **Pre-stage the co-pilot question** ("Can we afford RM2,000 for a Raya trip?") and
      the **EPF chip** so beat 0:58 is one clean take.
- [ ] **Pre-stage the Telegram nudge screenshot** — trigger it once via
      `POST /api/insight/nudge` (header `x-purge-secret: <ACCOUNT_PURGE_SECRET>`, needs
      Telegram configured), screenshot Honey's message, and cut to it at 2:02.
- [ ] Do a silent screen-capture pass first, then record VO over it.
- [ ] Keep the PC/app awake and on a stable connection.
- [ ] Only real screens. Export 1080p MP4 → YouTube (unlisted) or Drive link.
- [ ] Replace the placeholder link in `docs/REGISTRATION.md` §7 with the final URL.

## Upload metadata

- **Title:** HoneyMoney — MAIC Nexus 2026 (Track T3) Demo
- **Duration:** aim 2:15–2:50 (hard cap 3:00)
- **Description:** one-line pitch + `https://honeymoney.app` + repo link.

---

## The generated explainer (2026-08-25)

The shipped `HoneyMoney_Demo_MAIC2026.mp4` is built by `scripts/build-demo-video.mjs`,
not recorded. **Its narration script is the `vo` strings in that file** — 24 beats
running problem → 3-Bucket method → capture → three household shapes → six graph
views → consolidated dashboard → **the four H-Score tiers, one per beat** → the
Academy quiz → the product directory → business model → Malaysia impact →
on-device privacy → CTA, at 2:53 with `en-US-AvaMultilingualNeural`.

Three things about it are worth knowing before editing the beat sheet:

- **Pages pan, they do not sit still.** `scroll: <cssY>` moves the crop window
  from the beat's `y` down to that offset across the beat, eased at both ends, so
  a six-second beat shows what a visitor would actually scroll past instead of one
  frozen screenful. Values are CSS pixels at that beat's own `vw`.
- **Narrow pages are captured narrow.** `vw: NARROW` (1280) re-renders a page at
  a 1280px CSS viewport and 1.5× device pixels — still 1920 real pixels wide, so
  nothing is upscaled. `/demo`, `/dashboard`, `/guide` and `/learn` put their
  content in a ~512–672px column; at 1920 that column is 27% of the frame and
  body text lands unreadably small on the finished video.
- **The four tiers are four URLs.** `/demo?persona=individual|couple|family|thriving`
  (and `&tab=`, `&dir=`) was added to the app so each band, and the product
  directory, can be addressed rather than clicked — which is what makes them
  filmable at all, and linkable in a message or a document.

Two deployment notes, both learned the hard way:

- The video is captured from `DEMO_SITE` (default `https://honeymoney.app`). Any
  app change you want on screen has to be live there first — including on the
  **Cloudflare Pages snapshot**, which serves `/demo`, `/learn` and `/` to
  anonymous visitors and is rendered from the DOM Cloud origin, not this laptop.
  Capture from `DEMO_SITE=http://localhost:3000` only as a stopgap.
- `npm run build` on this machine **overwrites the build the live site is serving**
  and changes `_next/static` hashes. The edge serves `/_next/static/*` from the
  Pages snapshot, so a rebuild that is not followed by `npm run site:publish`
  leaves honeymoney.app rendering with no stylesheet at all. See
  `deploy/pages/README.md`.

The shot list above remains the target for a *human-recorded* version. Record over
the same beat sheet: the `vo` lines are already timed, and the video regenerates
from the live site with `node scripts/build-demo-video.mjs`, so the frames can
never drift from what a judge sees.
