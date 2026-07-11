# Design audit checklist — HoneyMoney

Runnable pass/fail sheet for the **web-design** skill. Score each section separately, then list the
3–5 highest impact×effort fixes. Rationale + sources in `design-patterns.md`.

## Landing / conversion
- [ ] Exactly one primary CTA, repeated in hero + after benefits + bottom
- [ ] Hero states an **outcome** (not features) and a trust signal within 5s
- [ ] Trust bar (badges / partner / privacy signals) directly below hero, not in footer
- [ ] Named testimonial + rating immediately above the signup form
- [ ] Signup asks only minimum fields; heavier verification deferred
- [ ] Reassurance microcopy + trust signal beside submit button and sensitive fields

## Trust
- [ ] Visible security/privacy signals at the point of decision (honest ones only — no unearned certs)
- [ ] Fees / terms / permissions surfaced just-in-time, never buried
- [ ] Data-sharing defaults OFF; granular consent toggles present
- [ ] Insight copy is neutral/observational, never judgmental (mirror the marital-safe rule)
- [ ] Bucket 3 (personal wallet) spend never itemised or moralised in the UI

## Dashboard / dataviz (/dashboard, /graph)
- [ ] 3–5 top KPIs at top-left; ≤7 competing elements above the fold
- [ ] Progressive disclosure ≤2 levels (summary → drill-down)
- [ ] One hero number per screen; detail behind expand
- [ ] Chart type matches intent (bar = compare, line = trend, sparkline = dense series)
- [ ] Every chart has an empty / first-run state that teaches + one action
- [ ] SVG-chart contract intact: deterministic, per-mark text label, color = entity/status not rank

## Mobile / PWA
- [ ] Touch targets ≥44pt/48dp (WCAG floor 24px); primary actions in bottom thumb zone
- [ ] Custom `beforeinstallprompt` install flow (no default banner), never force-installed
- [ ] `viewport-fit=cover` + safe-area insets; browser chrome hidden in standalone
- [ ] LCP < 2.5s, INP < 200ms, CLS < 0.1 verified on mobile
- [ ] Offline/reload restores in-progress input

## Accessibility (WCAG 2.2 AA)
- [ ] Text contrast ≥4.5:1 (≥3:1 large); non-text/chart marks ≥3:1 vs adjacent
- [ ] No color-only encoding — labels/patterns/icons added
- [ ] Every chart has a text alt + data-table fallback
- [ ] Full keyboard nav + visible focus-visible ring
- [ ] Genuine `prefers-color-scheme` dark theme (not inverted); contrast verified in BOTH themes
- [ ] `prefers-reduced-motion` respected

## Financial / i18n specifics
- [ ] One-tap hide/blur balances available
- [ ] All money routed through `format.ts`; locale-correct RM; FX labelled indicative until live
- [ ] Language switch (EN/BM/zh/ta/hi) doesn't break layout — no truncation/overflow on longer strings
- [ ] 9-currency formats fit their containers

---

## Anti-patterns to fail on sight
- Hidden/late fees; drip pricing
- Roach motel (hard-to-cancel/close)
- Confirmshaming, fake urgency, fake scarcity
- Preselected paid add-ons; silent trial-to-paid rollovers
- Privacy-Zuckering / data-sharing on by default
- Disguised ads (promos posing as features)
- Trust-less bare-minimal UI in a money context
- Vague/ambiguous error messages on payment/money flows
- Judgmental "stop overspending" tone
- Trust badges buried in the footer
- >7 elements or >2 drill-down levels on a dashboard
- Blank/broken-looking empty states with no guidance
- Color-only chart encoding; charts baked into images
- Intrusive default PWA install banners; content under the notch

## Output format for an audit
Produce a table: `Check | Page | Pass/Fail | Fix (concrete) | Impact | Effort`. Then a ranked
"Top 5 to fix first" and, for a larger rethink, an optional **artifact-design** mockup before code.
