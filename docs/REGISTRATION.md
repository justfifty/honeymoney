# MAIC Nexus Challenge 2026 — Registration Pack (HoneyMoney)

> Everything needed to register HoneyMoney for the MAIC Nexus Challenge, Track **T3
> — AI for Financial Services & Fintech**. Hand this to whoever registers.
> **Portal:** <https://maicnexus.com/en/application> · Register: <https://maicnexus.com/en/register> · Sign in: <https://maicnexus.com/en/login>
> ⚠️ Field names/fees/exact eligibility can change — **verify against the portal + the
> Rules & Regulations (R&R) at <https://maicnexus.com/en/tracks> before final submit.**

---

## 0. Do this FIRST — the eligibility gate (a fail here = instant out)

- [ ] **≥1 Malaysian citizen (MyKad holder) on the team.** PRs / international students do **not** count. **← Member 1 (PONG Woon Wei) is Singaporean, so this rests entirely on Member 2 (the friend): he must be a Malaysian MyKad holder and provide the number. Confirm before registering — no MyKad = ineligible.**
- [ ] **One person = one team** (no cross-team participation).
- [ ] **Track locked = T3** (Financial Services & Fintech). Commit, no hedging.
- [ ] **Genuine commit history** — HoneyMoney already has real, non-backdated commits; keep committing through submission (never backdate). Repo: `github.com/justfifty/honeymoney`.
- [ ] Confirm **team size min/max** and any age/status limits in the R&R.

---

## 1. Timeline (register early — applications are open)

| Stage | When | Gate |
|---|---|---|
| Launch | 11 Jun 2026 | applications open |
| **Application window** | Jun–Aug 2026 | **register + submit materials** |
| Preliminary judging | Sep 2026 | online review |
| Preliminary results | end Sep 2026 | → semi-finalists |
| Semi-Final | Oct 2026 (KL) | live demos |
| Grand Final | Nov 2026 | forum + awards |

**Action: register + submit the mandatory set as early as possible** (don't wait for the deadline). You can keep improving the product after registering.

---

## 2. Registration steps

1. Go to <https://maicnexus.com/en/register> → **create an account** (use a team email you'll monitor).
2. Sign in → **Start Application** (<https://maicnexus.com/en/application>).
3. Select track: **T3 — AI for Financial Services & Fintech**.
4. Fill the team + project fields (content ready in §3–§5 below).
5. Upload the **mandatory documents** (§6).
6. Add **artifact links** (§7) and **member profiles** (§8).
7. Review against the R&R checklist → **Submit**. Save the confirmation.

---

## 3. Team information to have ready

For **each** member (have IDs on hand):

| Field | Notes |
|---|---|
| Full name | as per IC/passport |
| Role | e.g. Founder/CEO, Tech Lead, Product, Business/GTM |
| Nationality | **flag the Malaysian citizen(s) clearly** |
| IC / MyKad no. | for the Malaysian member (eligibility proof) |
| Email + phone | reachable through Nov 2026 |
| LinkedIn / GitHub | optional but strengthens profiles |
| Short bio | 2–3 sentences (template in §8) |

**Team lead / primary contact:** PONG Woon Wei — <justfifty1976@gmail.com> / +65 9067 4823

---

## 4. Project fields (ready to paste)

**Project name:** HoneyMoney

**One-liner / tagline:**
> A personal financial wellness app, AI-supported, with no tracking fatigue.

**Elevator pitch (2–3 sentences):**
> HoneyMoney turns a household's money into a living knowledge graph — an AI-supported
> financial wellness app that gives couples **funding transparency and spending
> autonomy without surveillance**. Forward an e-wallet screenshot and the AI reads it;
> our companion "Honey" warns you *before* spending velocity threatens a shared goal.
> The same graph engine scales from a household to a small business.

**Track & why (T3 — Fintech):**
> Inclusive personal finance for Malaysian households and micro-businesses: cross
> e-wallet capture (Touch 'n Go, MAE, GrabPay, ShopeePay), an alternative
> "graph-path-consistency" reliability signal as a foundation for inclusive credit,
> PDPA-aligned local-first data, and alignment with BNM's financial-inclusion agenda.

**Problem:**
> Household financial stress drives marital friction and workplace presenteeism
> (~9 lost productive days/employee/year). Existing budgeting apps fail Malaysians
> three ways: they feel like surveillance, they demand manual data entry that people
> abandon, and they store flat data that can't reason about goals.

**Solution / what it does:**
> A **3-Bucket model** — Fixed Non-Negotiables, a Future Shield auto-savings %, and
> private personal wallets where tracking *stops* (autonomy over surveillance). Money
> is modelled as a **knowledge graph** (income → buckets → spend → goals), so Honey can
> warn a couple structurally when one bucket's spending threatens a shared goal.
> **Zero-integration capture**: forward a screenshot to Telegram, or use on-device OCR
> + voice that cost **no AI tokens** and keep data on the device. Marital-safe AI
> (never exposes a partner's private wallet). Multi-currency, multi-language, mobile
> PWA, **local-first (PDPA-friendly)**.

**Commercial model:**
> B2B2C **employee financial wellness** (employers sponsor seats) + free consumer tier
> with a built-in **family-referral** growth loop. Near-100% gross margin on a
> zero-cost infra stack. Non-dilutive funding path via Cradle CIP Spark.

**Impact / ESG:**
> Financial resilience for underbanked households, reduced money-stress and better
> workplace wellbeing, mapped to **SDG 1 (No Poverty), 3 (Good Health), 8 (Decent
> Work)** and Malaysia's **MADANI** agenda.

**Tech stack (one line):**
> Next.js 16 + PocketBase local-first knowledge graph + multi-provider AI (Google
> Gemini Flash / Groq / Ollama) + Telegram bot. Live, self-hosted, over HTTPS.

---

## 5. Project summary (1–2 page attachment — ready to export as PDF)

**HoneyMoney — funding transparency, spending autonomy.**

*The problem.* In Malaysian households, money is the #1 source of conflict, and that
stress follows people to work as lost productivity. Budgeting apps have failed to fix
it: they surveil every ringgit, demand manual entry until users quit, and store data
too flat to warn anyone before a goal slips.

*Our solution.* HoneyMoney models a household's money as a **living knowledge graph**
and applies a simple, brandable **3-Bucket method**: Fixed Non-Negotiables (rent,
bills), a **Future Shield** auto-savings percentage, and **private personal wallets
where tracking stops**. Because the graph knows how income flows into buckets and out
to real spending, our AI companion **"Honey"** can see — structurally — when one
bucket's spending velocity is about to push a shared goal weeks later, and nudge the
couple *before* it happens. Capture is frictionless and privacy-first: forward an
e-wallet or receipt screenshot to a Telegram bot, or use **on-device OCR and voice
that consume no AI tokens** and never leave the device.

*Why it's technically credible.* The same graph engine serves a **household, a family,
and a small business** with zero schema changes (three live personas in the product).
AI is **swappable and optional** across Gemini Flash, Groq, and local Ollama, with a
per-call token ledger for cost transparency. The app is **local-first**: data stays on
the user's own machine, which is both a privacy moat and a genuine PDPA story.

*Market & model.* We lead with a free consumer/household tier (family-referral growth)
and monetise via **B2B2C employee financial wellness**, where employers sponsor seats —
a category with strong demand and no incumbent occupying the Malaysia + couples + cross
e-wallet cell. Infra cost is effectively zero, so gross margin is high; Cradle CIP Spark
is our realistic non-dilutive entry.

*Impact.* Financial resilience for underbanked households, less money-driven conflict,
healthier workplaces — mapped to SDG 1/3/8 and the MADANI agenda.

*Status.* Working product live at **honeymoney.app** — dashboard, six-view knowledge-
graph gallery, time-schedule spending audit, multi-currency/-language capture, admin
analytics, and a cost/AI-token ledger — with a genuine, non-backdated commit history.

*Team.* [Name] — [role]; [Name] — [role] (**Malaysian citizen**); … Ask: [funding /
pilot / mentorship you want].

---

## 6. Mandatory documents to upload

**All three required PDFs are generated and ready in `docs/deck/` — upload these files directly:**

- [x] **Pitch deck** (PDF) — slide-per-criterion (Technical / Commercial / Relevance / Scalability / ESG), 12 slides. **→ `docs/deck/HoneyMoney_Pitch_Deck_MAIC2026.pdf`** (source: `PITCH_DECK.html`).
- [x] **Project summary** (1 page, PDF) — problem / solution / credibility / market / impact / status / team. **→ `docs/deck/HoneyMoney_Project_Summary_MAIC2026.pdf`** (source: `PROJECT_SUMMARY.html`; text also in §5 above).
- [x] **AI disclosure statement** (PDF) — stack matches the shipped build (PocketBase local-first + multi-provider AI). **→ `docs/deck/HoneyMoney_AI_Disclosure_MAIC2026.pdf`** (source: `AI_DISCLOSURE.html`; also `docs/AI_DISCLOSURE.md`).

> Before upload, open each PDF once and confirm it renders. To regenerate after an edit, see `docs/deck/README.md` (headless Chrome/Edge one-liners).

**Recommended (treat as required — top teams all submit):**

- [ ] **Demo video (≤3 min)** — screenshot → parsed txn → Honey insight → dashboard. *Status: to record; then replace the placeholder link in §7.*
- [ ] **Artifact link** — live app + repo (see §7).
- [ ] **Member profiles** (§8), Malaysian citizen flagged.

**Still to fill in before submit (human input needed):**

- [ ] Real team member names + roles (replace `[Name]`/`[Member N]` in the deck slide 11, the project summary PDF, and §3/§8).
- [ ] **Malaysian citizen's MyKad number** — the eligibility proof (see §0). Do not submit without this confirmed.

---

## 7. Artifact links (paste into the form)

- **Live app (primary artifact):** https://honeymoney.app
- **Source repo:** https://github.com/justfifty/honeymoney *(currently **private** — a plain click gives a 404 until access is granted; you retain all IP either way).*
- **Demo video:** https://example.com/honeymoney-demo-coming-soon *(placeholder, replace after upload)*

**Granting repo access (the link is private):**

- *Add a collaborator* (a teammate/judge with a GitHub username) — repo → **Settings → Collaborators → Add people**, or CLI: `gh repo add-collaborator justfifty/honeymoney <github-username>`.
- *Or make public temporarily* — CLI: `gh repo edit justfifty/honeymoney --visibility public --accept-visibility-change-consequences` (revert with `--visibility private` after judging).

> Tip: the live URL is served from a team machine — **keep that PC on/awake during the
> judging windows**, or move to a small always-on VPS before Preliminary (Sep).

---

## 8. Member profiles

> ⚠️ **Eligibility:** Member 1 (PONG Woon Wei) is **Singaporean — not a Malaysian
> citizen**, so he does **not** satisfy the T3 eligibility gate on his own. **Member 2
> (the friend) MUST be a Malaysian citizen with a valid MyKad, and that MyKad number
> must be provided.** If neither member holds a MyKad, the team is **ineligible** for T3
> — resolve this before registering (see §0).

### Member 1 — filled

```
Name:            PONG Woon Wei
Role:            Tech Lead
Nationality:     Singaporean   (Malaysian citizen: NO)
IC/MyKad (MY):   n/a — not the Malaysian member
Email / phone:   justfifty1976@gmail.com / +65 9067 4823
LinkedIn/GitHub: https://github.com/justfifty/honeymoney
Bio: Architect-trained and a buildingSMART Singapore–accredited Tier 2 Digital Tech
     Lead. A self-taught developer with a strong enthusiasm for app building, he leads
     HoneyMoney's product architecture and engineering — designing the local-first
     knowledge-graph model and the multi-provider AI pipeline behind the app.
```

### Member 2 — the friend (REQUIRED Malaysian citizen — fill in)

```
Name:            ____________________
Role:            Engineering & Growth (community / content)
Nationality:     Malaysian   (Malaysian citizen: YES)   ← required for T3
IC/MyKad (MY):   ____________________   ← eligibility proof, must be provided
Email / phone:   ____________________
LinkedIn/GitHub: ____________________
Bio: An engineer and content creator who leads HoneyMoney's go-to-market and community
     growth, pairing hands-on technical understanding with an audience-building instinct
     to bring the app to Malaysian households. Malaysian citizen (MyKad holder).
```

---

## 9. Final submit checklist

- [ ] Account created, application started, **Track = T3** selected
- [ ] Team fields complete; **Malaysian citizen flagged + IC provided**
- [ ] Pitch deck, project summary, AI disclosure uploaded (PDF)
- [ ] Demo video linked (or noted as coming)
- [ ] Live URL + repo linked; repo access sorted for judges
- [ ] Everything cross-checked against the **R&R** (<https://maicnexus.com/en/tracks>)
- [ ] **Submitted** + confirmation saved
- [ ] Keep committing real work through Nov 2026 (no backdating)

_Last updated: 2026-07-10._
