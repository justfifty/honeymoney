---
name: web-design
description: >-
  Audit and redesign HoneyMoney's real pages (landing, dashboard, /graph gallery, guide, auth)
  against researched, current fintech web-design best practices — conversion, trust/credibility,
  dashboard & data-viz UX, mobile-first PWA, accessibility (WCAG 2.2 AA), and light/dark theming.
  Produces a concrete audit + prioritized redesign and applies the changes in Tailwind v4.
  Use whenever improving look/feel, layout, conversion, trust, responsiveness, a11y, or theming of
  any page. Triggers on: "redesign", "improve the landing page", "make it look better/more
  professional", "design audit", "UX review", "conversion", "trust signals", "responsive",
  "accessibility/contrast", "dark mode", "hero", "CTA", "spacing/typography".
---

# HoneyMoney — Web design skill

Turn "make it look better" into a **measured audit → prioritized fixes → applied redesign** that a
Malaysian fintech judge and a first-time user both trust. Ground every decision in the researched
best-practice reference, not taste alone.

## When to use
- Improving or rebuilding the look, layout, conversion, trust, responsiveness, a11y, or theming of a
  page: `web/src/app/page.tsx` (landing), `dashboard/`, `graph/` (the six-view gallery), `guide/`,
  `login`/`signup`, `admin/`, `SiteHeader`/`SiteFooter`/`HeaderNav`.
- Reviewing a design before a demo/submission; producing a design audit.

## When NOT to use
- Chart colors, palettes, KPI-tile/legend/axis specifics → use the **dataviz** skill (this skill
  defers to it for anything inside a chart).
- A shareable HTML mockup/one-pager artifact → use the **artifact-design** skill.
- Money/legal copy → use the **finance-content** skill.

## Design system context (work within this — don't fight it)
- **Stack:** Next.js 16 (App Router, RSC) + **Tailwind v4** (`@tailwindcss/postcss`). ⚠️ This Next.js
  has breaking changes vs training data — see `web/AGENTS.md`; read `node_modules/next/dist/docs/`
  before non-trivial component changes.
- **Charts are hand-rolled SVG** (no chart lib), deterministic (server == client render), each mark
  hover-labelled; color encodes **entity/status, never rank**, every mark has a text label (the
  accessible secondary encoding). Keep that contract when restyling `/graph`.
- **Mobile-first, installable PWA** (`web/src/app/manifest.ts`) — never force-install.
- **Light + dark** must both be first-class. Respect `prefers-color-scheme` and any theme toggle;
  verify contrast in *both*.
- **Multilingual + multi-currency:** layouts must survive longer BM/zh/ta/hi strings and 9 currency
  formats without breaking (no fixed-width text buttons, no truncation of money).
- **Brand:** "Honey"/honeycomb warmth + financial trust. Warm accent, calm neutrals; avoid the cold,
  surveillance-y bank-app feel — that's the product's whole differentiator.

## Principles (full detail in `references/design-patterns.md`)
Distilled priorities, in order:
1. **Trust first.** Finance = credibility. Real social proof, transparent claims, security/privacy
   signals, no dark patterns. See the trust section of the reference.
2. **Clarity over cleverness.** One primary action per view; generous whitespace; a real typographic
   scale; progressive disclosure of complexity (buckets/graph reveal depth on demand).
3. **Show money respectfully.** Never a wall of numbers; lead with status ("on track / at risk"),
   let detail expand. Mirror the app's non-surveillance ethos in the UI.
4. **Mobile-thumb-first.** ≥44px touch targets, primary actions in the thumb zone, fast Core Web
   Vitals, no layout shift.
5. **Accessible by construction.** WCAG 2.2 AA contrast, keyboard nav, focus-visible, text
   alternatives for every chart, motion respects `prefers-reduced-motion`.
6. **Convert honestly.** Clear value prop above the fold, CTA repeated after social proof,
   friction-free path to "try it," pricing/benefit transparency.

## Workflow (audit → propose → apply → verify)
1. **Capture the current state.** Read the target page(s); if useful, run the app (**run** skill) and
   screenshot desktop + mobile, light + dark. Note what's actually there — don't redesign blind.
2. **Audit** against `references/design-checklist.md` (~25 pass/fail checks). Produce a short table:
   check → pass/fail → the fix. Score conversion, trust, clarity, mobile, a11y separately.
3. **Prioritize.** Rank fixes by impact × effort. Call out the 3–5 highest-leverage changes first;
   don't boil the ocean.
4. **Propose** concretely — reference specific components, spacing, type scale, and (where helpful)
   an example pattern from `references/fintech-examples.md`. For a bigger rethink, an
   **artifact-design** mockup can de-risk before touching code.
5. **Apply** in Tailwind v4, reusing existing tokens/utilities and the SVG-chart contract. Keep
   changes reviewable; don't rewrite working systems for style.
6. **Verify (required):** both themes, mobile + desktop, keyboard-only pass, contrast check on
   changed colors, and a longer-language / alternate-currency pass so nothing overflows. Use the
   **verify**/**run** skill to observe it in the real app, not just typecheck.

## Reference files (load as needed)
- `references/design-patterns.md` — the cited best-practice rules (conversion, trust, dashboard/
  data-viz, mobile/PWA, a11y, visual style, financial-UI specifics, anti-patterns).
- `references/design-checklist.md` — the ~25 pass/fail audit checks + the anti-patterns list, as a
  runnable review sheet.
- `references/fintech-examples.md` — annotated best-in-class fintech/SaaS patterns to borrow from
  (and what to avoid).

## Related skills
`dataviz` (inside charts) · `artifact-design` (mockups/one-pagers) · `finance-content` (the words) ·
`verify` / `run` (see it work).
