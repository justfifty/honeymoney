# HoneyMoney voice & compliance guide

The marital-safe, "educational-not-advice" voice guide and the pre-publish gate for the
**finance-content** skill. Read `finance-frameworks.md` and `malaysia-facts.md` alongside this.

## The voice in one line
**Forward-looking, blame-free, grounded in the user's own numbers — a calm ally, never a scold or a
salesperson.** "Happy wife, happy life; healthy workforce." Warmth of "Honey"/honeycomb + the calm of
a trustworthy advisor.

## Marital-safe & non-surveillance (the product thesis, made verbal)
- **Never itemise or moralise Bucket 3** (the Spendings bucket). Autonomy
  over surveillance is the whole point. No "you spent RM80 on coffee again."
- **Frame as a shared team problem, not a person's fault.** "Our Savings goal" not "your
  overspending." Money conflict predicts divorce independent of income — neutral framing is the
  feature. ([finance-frameworks.md](finance-frameworks.md) couples section)
- **Lead with status + a forward action, not a past verdict.** Good: "At this pace, Savings
  reaches its goal ~6 weeks later than planned — want to rebalance RM120?" Bad: "You overspent on
  groceries."
- **Offer, don't command.** Options and trade-offs, ending in a question the couple decides together.

## Educational, NOT financial advice (legal lane)
- Regulated advice = a specific recommendation to an identifiable person. Stay in **general
  education**: illustrate frameworks, show the math, let the user decide. [src](https://www.freeprivacypolicy.com/blog/financial-disclaimers/)
- **Never** say "you should buy/sell/invest in X", name specific investment products or issuers, or
  promise/imply returns.
- **Never** present one number as universal ("save 20%") — always "depends on your situation."
- **Malaysia:** financial planning/advice is licensed (SC / BNM). Route product & investment decisions
  to licensed professionals. **Confirm the current SC/BNM licensing boundary before any
  product-adjacent copy — UNVERIFIED specifics.**
- Keep the persistent disclaimer intact (`docs/DISCLAIMER.md`, mirrored at `/guide`): informational
  /educational only · not a substitute for a licensed professional · user bears their own decisions.
  50–100 words suffices.

## PDPA-honest (only claim what the app does)
- Do not invent retention/sharing/security claims. State only the real behaviour: local-first
  (data stays on the device), tenant isolation, screenshots parsed-then-discarded (`receipt_ref` is a
  pointer, not the image), k-anonymity for corporate roll-ups (suppress cohorts < 5).
- Financial + biometric data is **sensitive** under the PDPA Amendment 2024. If copy touches consent,
  breach, DPO, or portability, keep it accurate to `malaysia-facts.md` — don't overstate.

## Refer distressed users to real help
When copy addresses debt distress, point to **AKPK** (free, a BNM subsidiary — hotline 03-2616 7766)
and licensed professionals. Include the honest DMP-on-CCRIS caveat when recommending the DMP. This is
both ethical and trust-building for judges. ([malaysia-facts.md](malaysia-facts.md) AKPK section)

## Do / Don't quick table
| Do | Don't |
|---|---|
| "Many households aim for…", "One common approach is…", "You could consider…" | "You should…", "The best investment is…" |
| Show the framework + the user's numbers, let them choose | Present a single number as universally correct |
| Neutral, forward-looking, blame-free | Shame, moralise, use fear, itemise Bucket 3 |
| Cite statutory figures with effective dates | State a rate/relief without verifying to a primary source |
| Refer to AKPK / licensed pros for real advice | Imply the app diagnoses or guarantees outcomes |
| EN + BM in-product, graceful zh/ta/hi fallback | Ship English-only in-product copy |
| Route money through `format.ts`; label FX indicative | Hard-code RM strings or imply live FX |

## Pre-publish gate (all must pass)
1. **Advice-free?** No specific buy/sell/product recommendation; no promised returns.
2. **Marital-safe?** Blame-free, forward-looking; Bucket 3 not itemised/moralised.
3. **Numbers verified?** Every statutory figure traced to `malaysia-facts.md` with an effective date;
   nothing UNVERIFIED shipped.
4. **Framework-accurate?** Claims match `finance-frameworks.md`; hybrid framing used for the buckets.
5. **PDPA-honest?** Only real app behaviour stated.
6. **Disclaimer intact?** Link/text to `/guide` + `docs/DISCLAIMER.md` preserved.
7. **Localised?** EN + BM present for in-product strings; layout survives longer languages + 9
   currencies; money via `fmtMoney`.
8. **Renders?** Verified in the real app in both a household and a business persona (verify/run skill).
