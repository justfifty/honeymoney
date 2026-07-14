---
name: finance-content
description: >-
  Write and apply accurate, on-brand personal / family / business financial-management
  content for HoneyMoney — grounded in the 3-bucket model, the financial knowledge graph,
  and Malaysian statutory facts (EPF/SOCSO/EIS/PCB), in a marital-safe, "educational-not-advice"
  voice, using the free multi-provider AI stack (Groq · Gemini · Ollama). Use whenever
  producing or editing money-guidance copy: Honey insights & prompts, /guide and FAQ pages,
  landing/marketing copy, i18n strings, disclaimers, tips, onboarding, or notification text.
  Triggers on: "financial content", "Honey insight/prompt", "money tip", "budgeting copy",
  "guide page", "FAQ", "disclaimer", "financial-wellness content", "explain the buckets".
---

# HoneyMoney — Financial content skill

Produce money-guidance content that is **accurate, legally careful, on-brand, and grounded in the
app's real data model** — not generic budgeting fluff. Every piece must survive a judge, a lawyer,
and a stressed couple reading it at 11pm.

## When to use
- Writing or editing any user-facing money guidance: **Honey** insights, the AI system prompts that
  generate them, `/guide`, FAQ, onboarding, tips, notifications, landing/marketing copy, disclaimers.
- Adding or translating i18n strings that carry financial meaning.
- Explaining a HoneyMoney concept (buckets, graph, projection, personas) in-product or in docs.

## When NOT to use
- Pure code/architecture changes with no user-facing money language → just edit code.
- Design/layout work → use the **web-design** skill.
- Charts/palettes → use the **dataviz** skill.

## Non-negotiable guardrails (read `references/voice-and-compliance.md`)
1. **Educational, not advice.** Never "you should buy/sell/invest in X." Frame as options, questions,
   and trade-offs grounded in *their* numbers. No guarantees, no returns promised. Keep the
   disclaimer link intact (`docs/DISCLAIMER.md`, mirrored at `/guide`).
2. **Marital-safe & non-surveillance.** Forward-looking and blame-free. Never itemise or moralise
   Bucket 3 (Spendings) — autonomy over surveillance is the product thesis. Prefer
   "want to rebalance RM120?" over "you overspent on food again."
3. **PDPA-aware.** Don't invent data retention/sharing claims. Financial data is sensitive; only state
   what the app actually does (parse then discard raw images; tenant isolation; k-anonymity for
   corporate roll-ups).
4. **Malaysian facts must be verified.** EPF/SOCSO/EIS/PCB rates, reliefs, minimum wage, AKPK
   referrals — copy exact current figures from `references/malaysia-facts.md` (primary-sourced) and
   cite the effective date. If a number isn't in there and verified, do **not** publish it — flag it.
5. **Currency & language.** Money strings must format through `web/src/lib/format.ts` (`fmtMoney`,
   `CURRENCIES`, MYR base). New copy that ships in-product needs at least EN + BM via
   `web/src/lib/i18n.ts` (graceful English fallback for zh/ta/hi).

## The domain you are writing about (keep content consistent with this)
- **3-Bucket model — "funding transparency, spending autonomy":** Bucket 1 Must-paid →
  Bucket 2 Savings (10–20%, auto-routed *before* spending) → Bucket 3 Spendings
  (capped, **not tracked**). Persona labels live in `moneyView.ts::CATEGORY_META`
  (household: Must-paid / Savings / Spendings · business: Operating Costs / Reserves &
  Growth / Owner & Distributions).
- **Financial knowledge graph:** money = nodes (`income_source · bucket · wallet · vendor ·
  obligation · goal · asset · member`) + typed temporal edges (`FUNDS · ALLOCATES_PCT ·
  ALLOCATES_FIXED · ROUTED_TO · SPENT_AT · OWES · CONTRIBUTES_TO · OWNS`). Honey reasons over
  **structure**, not rows — that's the differentiator. Say "graph model," not "graph database."
- **Projection = the insight engine:** `web/src/lib/projection.ts` walks allocations and extrapolates
  spend velocity to month-end → per bucket `on_track | at_risk | over_budget | unfunded`. Good copy
  turns "you spent more on food" into "at this velocity your Savings goal slips ~6 weeks."
- **Three personas, one engine:** personal (Aisha, solo) · family (Rahman household) · business
  (café). Content should switch framing by `tenant.kind`, never by a schema change.
- See `references/finance-frameworks.md` for how the 3-bucket model maps to 50/30/20,
  pay-yourself-first, envelope/zero-based, emergency-fund and debt frameworks — cite these to sound
  credible, and to answer "how is this different from 50/30/20?"

## Using the free AI / agentic stack
- **Text generation** goes through `web/src/lib/ai.ts::aiGenerate(prompt, opts)` — one entrypoint over
  three free-tier providers chosen by `AI_PROVIDER`: **Groq** (fast free cloud), **Gemini Flash**
  (also OCR), **Ollama** (local, zero-token). Always pass `opts.fn` and `opts.meta` so usage lands in
  the `ai_usage` ledger (visible in `/admin`, `/api/usage`, feeds the MAIC AI disclosure).
- **Honey insight** copy/prompts live in `web/src/lib/gemini.ts::honeyInsight` and the rule-based
  fallback in `projection.ts::ruleBasedInsight` (keyed off `i18n.ts` `honey.*`). When you change the
  persona/prompt, update **both** the AI prompt and the deterministic fallback so the demo always
  works offline.
- **Zero-token paths exist** (on-device OCR `tesseract.js`, browser voice) — never write copy implying
  AI is required. AI is the *optional premium* path; the app runs at RM 0 without it.
- Verify providers live with `GET /api/ai/check` before relying on generated copy in a demo.
- Full provider setup + free-tier limits: `docs/AI_SETUP.md`.

## Workflow (generate → verify → apply)
1. **Scope**: what artifact, which persona(s), which locale(s), where it ships (file path).
2. **Ground**: pull the real numbers/labels from the graph/projection or the persona seed — don't
   invent figures. Reuse `CATEGORY_META`, `fmtMoney`, `i18n` keys.
3. **Draft** against the voice + framework references. If drafting many variants, you may use
   `aiGenerate` — but *you* fact-check every claim.
4. **Fact-check** every Malaysian statutory number against `references/malaysia-facts.md`; every
   framework claim against `references/finance-frameworks.md`. Unverifiable → cut or flag.
5. **Compliance gate** (`references/voice-and-compliance.md` checklist): advice-free? marital-safe?
   Bucket 3 not itemised? disclaimer intact? PDPA-honest?
6. **Apply**: write to the real file (i18n keys for in-product copy; `docs/` for guides; prompt files
   for Honey). Add EN + BM strings; keep zh/ta/hi fallbacks graceful.
7. **Verify** it renders (the **verify**/**run** skill) and reads correctly in both personas + a
   second language.

## Where content lives
| Content | File(s) |
|---|---|
| Honey AI prompt / persona | `web/src/lib/gemini.ts` |
| Honey deterministic fallback | `web/src/lib/projection.ts` (`ruleBasedInsight`) + `i18n.ts` `honey.*` |
| In-product copy / labels | `web/src/lib/i18n.ts`, `web/src/lib/dataLabels.ts` |
| Bucket / persona labels | `web/src/lib/moneyView.ts` (`CATEGORY_META`, `ROLE_OPTIONS`) |
| Money / currency formatting | `web/src/lib/format.ts` |
| Guide, disclaimer, FAQ | `web/src/app/guide/page.tsx`, `docs/DISCLAIMER.md`, `docs/USER_GUIDE.md` |
| Marketing / landing copy | `web/src/app/page.tsx`, `docs/growth/` |

## Reference files (load as needed)
- `references/finance-frameworks.md` — budgeting/saving/debt frameworks + how the 3-bucket model maps
  to them (cited).
- `references/malaysia-facts.md` — verified EPF/SOCSO/EIS/PCB/min-wage/AKPK figures with effective
  dates + primary sources. **Single source of truth for numbers.**
- `references/voice-and-compliance.md` — the marital-safe voice guide, "educational-not-advice"
  phrasing, PDPA do/don't, and the pre-publish checklist.
