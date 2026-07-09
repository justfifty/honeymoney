# MARKET_STRATEGY.md — competition, value proposition, demand & monetization

> Synthesis of a multi-agent research sweep (2026-07-09) into HoneyMoney's
> competitive position and go-to-market. **Sourcing honesty:** many figures below
> came from web research flagged by the researchers as needing a **primary-source
> re-check before they go in a pitch deck** (marked ⚠️). Directional conclusions are
> high-confidence; exact numbers are not. Pull live figures from LHDN, BNM, KWSP,
> AKPK before quoting.

---

## 0. The one-paragraph thesis

Every salable app HoneyMoney competes with is **account-bound, single-user, and locked to US/UK/EU bank rails**. **None** ingests a Malaysian e-wallet, **none** does a true 3-bucket envelope model, and **only two (Monarch, Origin — both US-only) have a real couples product**. "Marital financial harmony" as a brand is **owned by nobody**. HoneyMoney's defensible wedge is the **intersection no incumbent occupies**: e-wallet-first capture (screenshot → Telegram → AI OCR, no bank API) × envelope behavior-change × couples/family-native privacy × personal→family→business on one graph × sold B2B2C through Malaysian HR.

---

## 1. Who we actually compete with (the salable/commercial set)

### A. Global AI-first PFM (the "smart money app" cluster)
Cleo, Copilot, Rocket Money, Origin, **Monarch** (the benchmark), Emma, Plum, Snoop.
- **Price anchor: ~USD 80–199/yr** (RM 370–920). Monarch $99.99/yr (couples free); YNAB $109/yr.
- **Reality:** most "AI" is ML categorization. Only Origin & Monarch have serious assistants — both **assistive, not agentic**, English/US-context only.
- **Structural weakness for us to exploit:** US/UK/EU-only; Plaid/open-banking dependent (doesn't exist for Malaysian consumers); no e-wallet ingestion; Copilot has **no Android** (fatal in Android-first SEA); pricing is steep for the SEA mass market.

### B. Envelope / zero-based budgeting (our methodology twin)
**YNAB** ($109/yr — the cult method + community moat), Goodbudget ($80/yr), EveryDollar (Ramsey, $79.99/yr), **Actual Budget** (open-source, MIT — our architectural reference).
- **Their #1 churn driver is manual entry.** That is precisely what our screenshot-capture removes while keeping the discipline. None has MY/SEA bank feeds or a free/employer-subsidized tier.
- **Lesson:** the *method is the moat* (YNAB's "Four Rules"). We must **name and brand the 3-bucket method**.

### C. Couples / family finance (the clearest white space)
**The pure-play couples category is a graveyard** — Zeta, Plenty, Ivella, Tandem all shut/absorbed 2024–2025 (interchange-only economics failed). Survivors: **Honeydue** (free, US/EU, maintenance mode; best-in-class per-account hide/share privacy — the bar we must match) and **Monarch** (mine/theirs/ours "Shared Views", US-only, no multi-currency).
- **Nobody owns the "fewer money fights / marital harmony" brand** — it's generic ad copy everywhere, despite money being a top-2 divorce predictor (⚠️ trace KSU/Pew/Ramsey/Bankrate stats to primary before slide use).

### D. Malaysian consumer money apps & neobanks (the local incumbents)
TNG eWallet **GO+/GOfinance**, GXBank (Pockets), Boost Bank (Jars), BigPay, **Ryt Bank (Ryt AI)** — the closest AI-native local player, plus MyMy, Setel.
- **All single-user and account-bound.** GO+/Pockets/Jars are *goal savings sub-accounts*, **not income-proportional spend envelopes**. None does shared/marital budgeting; Ryt Bank's one-device-per-account model is *structurally hostile* to couples.
- Malaysia's payments are **fragmented across many wallets** — so no single app sees the whole household. Our cross-wallet screenshot capture is the only practical unifier.

### E. Malaysian SME accounting SaaS (the business-tier neighbors)
Bukku (RM0–135/mo), Financio (RM50–135/mo), AutoCount (RM70–180/mo cloud), SQL Account (RM79–109/mo), Biztory. All **e-Invoice/MyInvois-ready**; several have payroll (EPF/SOCSO/EIS/PCB).
- **Verdict (confirmed): the SME accounting market is compliance-saturated and financial-wellness-empty.** None serves the owner's cashflow anxiety or employees' money health. **Interoperate, don't replace** — we are the wellness/behavior layer, they issue the statutory e-invoices.

### F. Earned-Wage-Access & employee wellness — our real B2B channel rival
**Paywatch** (MY leader, bank-backed via HLB, RM2/withdrawal, US$30M raised), HariGaji, Setlary, Payd; regional Wagely/GajiGesa; UK/US benchmarks Wagestream (employer-pays PEPM) & Salary Finance (lender).
- **Critical GTM finding:** in Malaysia the norm is **employee pays a small per-withdrawal fee; the employer pays ~nothing.** "Zero cost to employer" is table stakes. The **UK "employer pays a per-employee-per-month subscription" model has NOT crossed into SEA.** Any plan that assumes Malaysian employers will pay a Wagestream-style PEPM is fighting the market.
- **Regulatory tailwind for us:** EWA sits in a grey zone; the Consumer Credit Act 2025 / new SKP (in force 1 Mar 2026) is tightening around credit-like, fee/tip-heavy models. A **non-credit, behavior-based wellness product carries less regulatory risk** than fee-charging EWA.

---

## 2. Value proposition, per competitor cluster

| Vs. | HoneyMoney's defensible edge |
|---|---|
| Global AI PFM | e-wallet-first capture (no open-banking dependency), Android-first, agentic BM/Manglish AI, couples-native, ringgit pricing |
| Envelope apps | YNAB-style intentionality **without the manual-entry churn** (capture = a screenshot forward); free/employer-subsidized tier they don't have |
| Couples apps | Match Honeydue privacy + Monarch mine/theirs/ours, then **own the marital-harmony brand nobody claims**, on local rails, funded by HR not fragile interchange |
| Local neobanks/e-wallets | The **household** layer above fragmented wallets; true envelopes + shared budget vs. their goal-jars |
| SME accounting | The **wellness/cashflow-behavior** layer they lack; feed their e-Invoice, don't fight it |
| EWA / wellness | Address the **cause (behavior)** not just liquidity; span the whole household + the owner's SME cashflow; lower regulatory risk |

---

## 3. Demand drivers (why anyone pays) — Malaysian, cite primary before use

**Consumer pain (structural, well-documented):**
- **Household debt ~84% of GDP** (BNM Governor, Aug 2025; ⚠️ verify latest). Youth: **~53,000 under-30s owe ~RM1.9bn** (AKPK 2024 ⚠️).
- **EPF adequacy: ~64% of active members below Basic Savings** (KWSP, Oct 2024 ⚠️). Median 30-yo ~RM18k.
- **Financial anxiety:** RinggitPlus RMFLS — ~55% anxious about finances, ~53% spend all/more than they earn (⚠️ private survey).
- **Fragmented e-wallets:** ~95% use ≥1 e-wallet; TNG ~28M+ users; e-payments per capita ~409–432 in 2024 (BNM ⚠️ reconcile figure). → the "where did our money go across 5 wallets" pain only cross-wallet capture solves.

**Employer/SME pain & forcing function:**
- **LHDN e-Invoicing cascade:** Phase 4 (turnover >RM1m) **live 1 Jan 2026**; **<RM1m exempted**. A large, freshly-digitized SME cohort needs cashflow tooling now (primary: hasil.gov.my).
- **Presenteeism/financial stress → productivity loss** (⚠️ softly sourced — RMFLS + single academic studies; do NOT quote a headline "RM X billion" without a named source).
- **Financial-wellness benefit market** growing (~9.5% CAGR globally; ~47% of employers plan to offer by 2026 ⚠️ vendor data). Origin distributes internationally *only* via employers — validating the HR channel.

---

## 4. Monetization & the honest GTM

**Pricing strategy.** Global PFM anchors at RM370–920/yr D2C — too steep for the SEA mass market. Our leverage is **B2B2C: the employer/sponsor pays, the app is free/subsidized to the household** — removing the paywall that caps every incumbent's adoption — while we capture per-seat SaaS revenue. But per §1F, **Malaysian employers resist paying**, so:
- **Lead with a free consumer tier** (the showcase), monetize via (a) a modest consumer premium well below the global anchor on SEA purchasing power, and (b) B2B where a sponsor pays — but expect to *prove* ROI, not assume it.
- **SME tier**: a low RM/month band comparable to Bukku/Financio (RM35–135/mo), positioned as *cashflow wellness + e-Invoice-adjacent*, not accounting.

**Growth mechanics that fit this category:**
- **Family/couples referral is a built-in K-factor** — inviting a spouse *is* the core feature. Milestone shares ("we funded our Future Shield"). Employer-seeded distribution (a whole company onboards at once) is the B2B2C multiplier.
- **⚠️ MLM / network-marketing distribution: DO NOT.** For a product handling salary/financial data sold to HR, an MLM model is a **credibility killer** — HR procurement, grant panels, and MAIC judges read it as a trust/compliance risk, and it clashes with the "we *reduce* financial harm" mission. Use enterprise B2B sales + in-product family referral instead.
- **Crowdfunding / ECF** (pitchIN): realistic **after** traction, not day one.

**Funding stack (realistic for a pre-revenue MY team):**
- **Cradle CIP Spark — up to RM150k, non-dilutive — the single most accessible real money. Primary target.**
- **MDEC Malaysia Digital (MD) status** — tax + ecosystem (value only when profitable); apply while pre-revenue.
- Pre-accelerators: **1337 Alpha Startups** (free, no equity), **Antler** (day-zero, ~10–12% dilution ⚠️).
- **Indirect only** (via their VCs, later stage): Khazanah Future Malaysia, **Jelawang Capital** (the 2024 merger of MAVCAP + Penjana — many old guides are now wrong), Dana Penjana.
- **BNM/SC sandboxes = regulatory relief, not funding**, and only once we touch a regulated activity (we deliberately don't hold funds → stay a PFM tool, outside BNM licensing).

---

## 5. AI-token ROI & where AI actually earns its cost

The competition validates that **"AI" is mostly a categorization/branding layer** — real agentic AI is rare and a differentiator. To maximize ROI per token:
- **Tier the AI.** Cheap/free path first, premium AI only where it changes a decision.
- **No-token capture fallback (open-source, MIT/Apache):** **tesseract.js** (in-browser receipt OCR — no Python sidecar) and **whisper.cpp** (on-device voice → spend entry; covers Malay/Chinese/Tamil/Hindi). This proves "runs at RM 0/month," removes the Gemini-cost dependency, and the **on-device angle directly answers the PDPA/data-residency objection HR will raise** (Gemini = data leaving Malaysia). Gemini stays the *premium* path.
- **Spend tokens on the moat, not the plumbing:** the forward-looking "Honey" insight ("your food velocity pushes Future Shield 6 weeks later"), the marital-safe framing, and cross-wallet reconciliation — not on OCR that a free library does.
- **Agentic angle for the award:** a Honey agent that reads the graph, proposes a rebalance, and (with confirmation) applies it — genuinely agentic, and no local incumbent has it (Ryt AI executes payments but doesn't coach a budget).

---

## 6. Concrete, grounded moves (avoid over-engineering)

1. **Match the couples privacy bar on day one** — Honeydue's hide/share per account/node maps natively onto our graph (flag a wallet/edge shared vs private). This is our deepest emotional lock-in.
2. **Own the marital-harmony brand** — position around *fewer money fights* + a **no-questions-asked Personal-autonomy wallet**; no competitor claims this.
3. **Ship the RM-0 capture fallback** (tesseract.js + whisper.cpp) — cost story + PDPA story + accessibility.
4. **Name & brand the 3-bucket method** (à la YNAB's Four Rules) — the method is the retention moat.
5. **Stay a PFM tool, not a lender/fund-holder/e-invoice-issuer** — integrate MyInvois/AutoCount for SME; refer (don't replicate) Versa/KDI/StashAway for the Future Shield bucket. Keeps us out of BNM/SC licensing and CCA scope.
6. **GTM realism:** lead free/consumer + sponsor-subsidized; prove ROI; don't assume Malaysian employers pay PEPM like the UK.

---

## 7. Competitor quick-reference (verify prices before pitch)

| App | Category | Price (⚠️ verify) | Geo | Couples? | e-wallet? |
|---|---|---|---|---|---|
| YNAB | Envelope | $109/yr | US/EU | Share sub | No |
| Monarch | AI PFM | $99.99/yr | US(+CA) | **Yes (best)** | No |
| Copilot | AI PFM | $95/yr | US, iOS-only | No | No |
| Cleo | AI PFM | $5.99–14.99/mo | US | No | No |
| Honeydue | Couples | Free | US/EU | Yes | No |
| Actual | Envelope (OSS) | Free/MIT | Anywhere (manual) | Limited | No |
| TNG GO+ | e-wallet+save | Free (fund fee) | **MY** | No | own only |
| GXBank/Boost | Neobank | Free (NIM) | **MY** | No | own only |
| Ryt Bank | AI neobank | Free (NIM) | **MY** | No (1-device) | own only |
| Paywatch | EWA | RM2/withdrawal | **MY** | No | — |
| Bukku/Financio/AutoCount/SQL | SME acct | RM35–180/mo | **MY** | n/a | n/a |

**HoneyMoney sits in the empty cell of this table:** MY + envelope + couples + AI + cross-e-wallet. No row above occupies it.

---

_Full raw research (with inline citations) is preserved in the session task outputs. Before any figure here appears in the MAIC deck, re-fetch it from the primary source — LHDN, BNM, KWSP, AKPK, or the vendor's own live pricing page._
