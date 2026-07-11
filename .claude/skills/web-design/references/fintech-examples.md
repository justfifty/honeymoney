# Fintech design patterns worth borrowing (annotated)

Concrete, best-in-class patterns to adapt for HoneyMoney — and what to avoid. Pair with
`design-patterns.md` (the rules) and `design-checklist.md` (the audit).

## Patterns to borrow
| Source | Pattern | How to adapt for HoneyMoney |
|---|---|---|
| **Wise** | Live fee/FX calculator *in the hero* — see the exact number before signup. [ex](https://www.eleken.co/blog-posts/trusted-fintech-ui-examples) | Put a mini **bucket-split or projection preview** in the hero: enter an income, watch it split into the 3 buckets live. Transparency *is* the pitch. |
| **Chime** | Single hero number, everything else calm/tucked away — "builds calm." [ex](https://www.eleken.co/blog-posts/fintech-ux-best-practices) | Dashboard leads with one status ("On track" / net position); bucket detail expands. Matches the non-surveillance ethos. |
| **Stripe** | Metrics front-and-center, semantic color (green +/red −), clean type scale, adapts mobile↔web. [ex](https://www.webglo.org/stripe-mercury-and-the-modern-business-finance-stack/) | Use consistent status color across the six SVG lenses; keep the type scale bold-headline / restrained-body. |
| **Mercury** | Soft muted gradients + heavy whitespace = "sleek, trustworthy" without loudness. [ex](https://www.stripedhorse.com/blog/best-financial-website-designs) | Warm-honey accent over calm neutrals; use gradient sparingly to express depth, not decoration. |
| **Revolut / Monzo** | One-tap **hide balances**, granular privacy toggles, plain activity log. [ex](https://thisisglance.com/learning-centre/what-makes-users-trust-a-banking-app) | Add a blur/hide toggle for public use; keep data-sharing OFF by default; show a plain "what we store" view. |
| **NN/G dashboards** | 3-tier: KPI tiles → trend charts → tables behind a click; ≤2 disclosure levels. [ex](https://uxpilot.ai/blogs/dashboard-design-principles) | `/dashboard` = bucket status tiles first, `/graph` = the drill-down lenses. Don't stack >7 elements above the fold. |

## Trust-signal placement (HoneyMoney-honest version)
Substitute *earned* signals for badges the app doesn't hold. HoneyMoney's genuine trust story:
- **"Your data never leaves your device"** (local-first PocketBase) — a stronger, truer claim than a
  borrowed cert badge. Surface it near the CTA.
- **PDPA-aware**, tenant isolation, screenshots parsed-then-discarded, Bucket 3 not itemised.
- **Real named testimonials** once you have pilot users / the signed corporate LOI.
- **Open, honest FX**: label indicative rates as indicative until a live source is wired.
> Never display an ISO/PCI/SOC badge you haven't actually earned — a false trust signal is a dark
> pattern and a disqualifier risk. [dark patterns](https://www.theuxda.com/blog/dark-patterns-in-digital-banking-compromise-financial-brands)

## Empty / first-run states (finance apps live or die here)
A new household has zero transactions on day one — a blank chart reads as "broken."
[ex](https://www.onething.design/post/budget-app-design) Every chart/section needs:
1. A one-line explanation of what the metric means.
2. A sample/preview (the seeded demo persona is perfect for this).
3. Exactly one clear action ("Add your first income" / "Link Telegram").

## What to avoid (seen failing in finance UIs)
- Borrowed/loud maximalist visuals that read as "not a serious money app."
- Trust badges dumped in the footer instead of beside the decision.
- Judgmental insight copy ("stop overspending") — breaks the marital-safe promise.
- Charts that rely on color alone or bake text into an image — inaccessible and untranslatable.
- Intrusive default PWA install banner instead of an intent-driven custom prompt.
- Walls of numbers with no hero figure and no progressive disclosure.

## Galleries to browse for current craft
- Land-book / Awwwards fintech collections (visual trend calibration).
- Stripe, Wise, Mercury, Revolut, Monzo, Chime marketing + product (referenced above).
- Refactoring UI (spacing/type/color fundamentals) · Laws of UX (heuristics).
