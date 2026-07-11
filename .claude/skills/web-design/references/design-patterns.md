# Fintech web-design best practices (2025–2026) — cited rules

Grounding reference for the **web-design** skill. Every rule is an imperative + one-line rationale +
source. Applied to HoneyMoney: mobile-first installable PWA, Malaysian households + SMEs, warm
"Honey" brand, hand-rolled SVG charts, light + dark, multilingual (EN/BM/zh/ta/hi), multi-currency.

Benchmark to beat: fintech median landing conversion **~8.4%** (vs 6.6% cross-industry); **copy** is
the highest-leverage variable (50–80% lifts documented).
[src](https://wsa.design/news/high-converting-landing-pages-for-fintech-websites-structure-copy-and-data-insights)

---

## 1. Landing-page & conversion
1. **Order the page:** Hero → Trust bar → Product explainer → Benefits → How-it-works → Social proof →
   Conversion → Compliance/disclaimer. Visitors need a linear trust-then-act path.
   [src](https://wsa.design/news/high-converting-landing-pages-for-fintech-websites-structure-copy-and-data-insights)
2. **One primary CTA per page, repeated** (hero, mid-page after benefits, bottom). Single-goal pages
   convert 2.4–2.8× higher; repetition catches scanners and deep-readers. [src](https://wsa.design/news/high-converting-landing-pages-for-fintech-websites-structure-copy-and-data-insights)
3. **Hero states an outcome + first trust signal within 5s** — outcome headline, not a feature list.
   A headline test lifted conversion 78% over 2,200 sessions. [src](https://wsa.design/news/high-converting-landing-pages-for-fintech-websites-structure-copy-and-data-insights)
4. **Make the core promise interactive in the hero** where possible (à la Wise's live fee
   calculator). For HoneyMoney: a mini bucket-split or projection preview beats a static screenshot.
   [src](https://www.eleken.co/blog-posts/trusted-fintech-ui-examples)
5. **Put social proof (named testimonial + rating) directly above the conversion form.** Proof
   adjacent to the decision point lifts completion. [src](https://wsa.design/news/high-converting-landing-pages-for-fintech-websites-structure-copy-and-data-insights)
6. **Ask only minimum fields at signup; defer KYC.** Friction at the door kills conversion.

## 2. Trust & credibility (without the surveillance feel — HoneyMoney's core differentiator)
1. **Show security, don't just claim it:** visible lock/encryption + cert badges (ISO 27001, PCI DSS,
   SOC 2) at the point of decision. Displaying them raised willingness to enter financial credentials
   **31%**. [src](https://eseospace.com/blog/trust-signals-in-fintech-security/) *(For HoneyMoney,
   substitute honest local equivalents: PDPA-aware, data-never-leaves-the-device, tenant isolation —
   never claim a certification you don't hold.)*
2. **Move trust signals out of the footer, next to CTAs and sensitive fields.** A badge footer→hero
   move took a page 2.1%→3.4% with no other change. [src](https://wsa.design/news/high-converting-landing-pages-for-fintech-websites-structure-copy-and-data-insights)
3. **Frame insights as neutral observations, never judgments** ("Travel is 20% higher this month" —
   not "Stop overspending"). Avoids the scolding/surveillance feel. [src](https://www.eleken.co/blog-posts/fintech-ux-best-practices)
   This is the UI mirror of the finance-content marital-safe rule.
4. **Surface fees, terms, permissions just-in-time**, not buried in T&Cs. Strongest differentiator vs
   legacy-bank distrust. [src](https://phenomenonstudio.com/article/fintech-ux-design-patterns-that-build-trust-and-credibility/)
5. **Make privacy legible:** PIN/biometric lock, granular permission toggles, plain activity log,
   data-sharing **OFF by default**. Users must see safety to believe it. [src](https://thisisglance.com/learning-centre/what-makes-users-trust-a-banking-app)
6. **Use named, credentialed testimonials** (person + company + title), not anonymous quotes. [src](https://wsa.design/news/high-converting-landing-pages-for-fintech-websites-structure-copy-and-data-insights)

## 3. Dashboard & data-visualization UX (applies to /dashboard and /graph)
1. **Top 3–5 KPIs at top-left** (F/Z scan); keep **≤7 competing elements** above the fold — users
   abandon busier dashboards. [src](https://uxpilot.ai/blogs/dashboard-design-principles)
2. **Progressive disclosure, max 2 levels:** summary tiles → drill-down on click. Beyond 2 levels,
   usability drops. [src](https://www.nngroup.com/articles/progressive-disclosure/)
3. **Three-tier layout:** KPI tiles (top) → trend charts (middle) → granular tables (behind a click).
   [src](https://uxpilot.ai/blogs/dashboard-design-principles)
4. **Match chart to intent:** bars = comparison, lines = trend, sparklines for dense series. Keeps
   financial series readable/accessible. [src](https://www.smashingmagazine.com/2024/02/accessibility-standards-empower-better-chart-visual-design/)
   *(HoneyMoney already does this across its six SVG lenses — preserve the intent mapping.)*
5. **Design first-run empty states as onboarding:** explain the metric, show a sample, give one
   action. A blank chart reads as "broken." [src](https://www.onething.design/post/budget-app-design)
6. **Lead with one hero number** (net position / current balance); tuck the rest under expanders —
   restraint "builds calm," the right emotion for money. [src](https://www.eleken.co/blog-posts/fintech-ux-best-practices)

## 4. Mobile-first & PWA (the app is an installable PWA — `manifest.ts`)
1. **Touch targets ≥44×44pt (Apple) / 48×48dp (Material); WCAG 2.2 SC 2.5.8 hard floor 24×24 CSS px
   with spacing.** Prevents costly mis-taps on money actions. [src](https://inkbotdesign.com/mobile-ux/)
2. **Anchor primary actions in the bottom-third thumb zone;** use bottom nav. One-handed reach arc is
   the lower third. [src](https://inkbotdesign.com/mobile-ux/)
3. **Own the install prompt:** capture `beforeinstallprompt`, `preventDefault()`, store it, call
   `prompt()` from custom UI only in `display-mode: browser`. Never the intrusive default banner.
   [src](https://firt.dev/pwa-design-tips/)
4. **`viewport-fit=cover` + `env(safe-area-inset-*)` padding; hide browser chrome in standalone.**
   Keeps content off the notch, feels native. [src](https://firt.dev/pwa-design-tips/)
5. **Core Web Vitals: LCP < 2.5s, INP < 200ms, CLS < 0.1.** A 1s mobile delay cuts conversions up to
   20%; 53% abandon pages > 3s. [src](https://wsa.design/news/high-converting-landing-pages-for-fintech-websites-structure-copy-and-data-insights)
6. **Restore in-progress state on reload/offline** (iOS reloads PWAs on exit; check
   `document.wasDiscarded`). Never lose a half-entered transaction. [src](https://firt.dev/pwa-design-tips/)

## 5. Accessibility — WCAG 2.2 AA (non-negotiable; also unlocks more usable chart shades)
1. **Text contrast ≥ 4.5:1 normal, ≥ 3:1 large** (≥24px, or ≥18.66px bold). SC 1.4.3. [src](https://webaim.org/articles/contrast/)
2. **Non-text contrast ≥ 3:1** for UI components AND graphical objects (chart bars/lines/nodes, focus
   states) vs adjacent colors. SC 1.4.11. [src](https://webaim.org/articles/contrast/)
3. **Never encode meaning by color alone** (SC 1.4.1) — add labels/patterns/icons/direct data labels
   to every chart. [src](https://www.smashingmagazine.com/2024/02/accessibility-standards-empower-better-chart-visual-design/)
   *(HoneyMoney's SVG charts already text-label every mark — keep that contract.)*
4. **Every chart gets a text alternative + accessible data-table fallback.** [src](https://it.wisc.edu/learn/make-it-accessible/accessible-data-visualizations/)
5. **Full keyboard nav + visible focus; honor `prefers-color-scheme` for a genuine dark theme** (not
   inverted colors). Dark backgrounds unlock more contrast-compliant chart shades (61 vs 40 in the
   Google palette). [src](https://www.smashingmagazine.com/2024/02/accessibility-standards-empower-better-chart-visual-design/)
6. **Reserve the highest-contrast fill for the one mark you want noticed; mute the rest.** Directs
   attention while staying compliant. [src](https://www.smashingmagazine.com/2024/02/accessibility-standards-empower-better-chart-visual-design/)

## 6. Modern visual style that still converts (2025/26)
1. **Generous whitespace, app-like layout** — signals the calm, premium, trustworthy tone finance
   demands. [src](https://www.wearetg.com/blog/web-design-trends/)
2. **Bold high-contrast type scale** (variable fonts; large headline, restrained body) —
   "maximalist-minimalism": one loud element, everything else quiet. [src](https://www.nopanicdesign.com/blog/web-design-trends-2026-colors-fonts/)
3. **Glassmorphism/translucency only to express depth hierarchy**, never blanket decoration. [src](https://www.webbb.ai/blog/glassmorphism-the-coolest-ui-trend-right-now)
4. **Soft, fading gradients + muted palettes** over loud ones — reads "sleek/contemporary" (Mercury)
   without undermining trust. [src](https://www.stripedhorse.com/blog/best-financial-website-designs)
5. **Micro-interactions = functional feedback, not flair** — confirm taps, transitions, loading,
   success/error. Respect `prefers-reduced-motion`. [src](https://www.digitalupward.com/blog/2026-web-design-trends-glassmorphism-micro-animations-ai-magic/)
6. **Semantic color, consistently:** green = positive, red = negative/alert; adapt every layout to
   mobile + web (Stripe model). [src](https://www.webglo.org/stripe-mercury-and-the-modern-business-finance-stack/)

## 7. Financial-product specifics
1. **One focal number per screen**, everything else drill-down. Respects attention + emotional state.
   [src](https://www.eleken.co/blog-posts/fintech-ux-best-practices)
2. **One-tap "hide balances" / privacy blur** for public use. [src](https://gapsystudio.com/blog/ux-design-financial-services/)
3. **Goals/budgets as progress (bars/rings) showing remaining, not just spent** — motivates without
   shaming. [src](https://www.onething.design/post/budget-app-design)
4. **Locale-correct currency + transparent conversion** (real-time rate + explicit markup, Wise
   style). RM formatting + honest FX = trust and compliance. [src](https://www.eleken.co/blog-posts/trusted-fintech-ui-examples)
   *(HoneyMoney: route all money through `format.ts`; FX is currently indicative — label it.)*
5. **Design for language switching:** allow longer BM/中文/Tamil strings, keep numerals/currency
   stable, never bake text into images/charts. [src](https://www.webstacks.com/blog/fintech-ux-design)
6. **Let users customize dashboard/theme/notifications** — perceived control over sensitive data
   raises satisfaction + retention. [src](https://datacalculus.com/en/blog/technology-information-and-internet/uxui-designer/designing-financial-application-interfaces-uxui-best-practices)

## 8. Anti-patterns that kill trust/conversion — see `design-checklist.md` for the flat list
Hidden/late fees; roach motel; confirmshaming/fake urgency; preselected add-ons & silent trial
rollovers; privacy-Zuckering (data-sharing on by default); disguised ads; trust-less bare-minimal UI;
vague payment errors; judgmental tone; buried trust badges; >7 elements / >2 drill levels; blank
empty states; color-only chart encoding; intrusive default install banners; content under the notch.
[dark patterns src](https://www.theuxda.com/blog/dark-patterns-in-digital-banking-compromise-financial-brands)
· [minimal-UI risk src](https://foundey.com/blog/fintech-ux-design)

---

### Highest-value primary sources
- NN/G Progressive Disclosure — https://www.nngroup.com/articles/progressive-disclosure/
- WebAIM Contrast & Color — https://webaim.org/articles/contrast/
- Smashing, Accessible Chart Design — https://www.smashingmagazine.com/2024/02/accessibility-standards-empower-better-chart-visual-design/
- WSA Fintech Landing Pages (measurable) — https://wsa.design/news/high-converting-landing-pages-for-fintech-websites-structure-copy-and-data-insights
- UXDA Dark Patterns in Banking — https://www.theuxda.com/blog/dark-patterns-in-digital-banking-compromise-financial-brands
- firt.dev PWA Design Tips — https://firt.dev/pwa-design-tips/
- Eleken Fintech UX Best Practices — https://www.eleken.co/blog-posts/fintech-ux-best-practices
