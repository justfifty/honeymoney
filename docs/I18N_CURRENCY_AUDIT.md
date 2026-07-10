# Language & Currency Audit — HoneyMoney (2026-07-10)

Read-only audit of all 5 language packs + all 9 currencies across every tab, run by
concurrent agents against the live app. Goal: confirm displayed items are "captured
fully" (translated + not truncated) per language, and that currencies convert correctly.

**TL;DR:**
- **Layout is safe** — no truncation, clipping, or overflow in any language/script/currency (desktop or mobile). The "items captured fully" concern is clean *visually*.
- **Translation coverage is the real gap** — only the `/graph` route uses the dictionary at all; the other tabs + global header/footer are hardcoded English in every language.
- **Currency conversion is genuinely solid** (all 9 work), with a few "RM" leaks and an indicative-FX caveat.
- **Bonus bug found:** `/graph` overflows horizontally on mobile (fixed 920px Sankey width) — not locale-related.

---

## 1. Language coverage

Dictionary = `web/src/lib/i18n.ts`. English is the canonical **33-key** set. A string
translates **only** if routed through `t(locale, key)`. Today **only `/graph` calls `t()`**.

| Locale | Dict coverage | Tabs that translate | Script truncation |
| --- | --- | --- | --- |
| `en` English | 33/33 (baseline) | — | — |
| `ms` Malay | **33/33 complete** | only `/graph` chrome | none |
| `zh` Chinese (Simplified) | 10/33 (~30%) | only `/graph` chrome | none |
| `zh-Hant` Chinese (Traditional) | **absent — locale does not exist** | — | — |
| `hi` Hindi | 8/33 (~24%) | only `/graph` chrome | none (Devanagari matras render clean) |
| `ta` Tamil | 8/33 (~24%) | only `/graph` chrome | none (Tamil fits, though it runs longer) |

### The architectural gap (applies to every language)
These are **hardcoded English** and never pass through `t()`, so they don't translate in *any* locale:
- **Whole tabs:** `page.tsx` (landing), `dashboard/page.tsx`, `records/page.tsx`, `guide/page.tsx` — none read `?lang=`.
- **Global chrome (every page):** `SiteHeader.tsx` (nav, Log in/Sign up), `SiteFooter.tsx` (tagline, nav).
- **Even inside the translated `/graph`:** per-mode `CAPTION` (`graph/page.tsx:56-63`), legend labels (`:394-407`), Flow column headers (`:318-320`), person-lens stat labels (`:191-194`), empty state (`:233-239`), closing paragraph (`:420-424`); `SankeyFlow.tsx` column headers (`:205-207`); all field labels/toasts in `FlexibleInput.tsx` and `SpendCapture.tsx`; `PeopleMenu.tsx` "People"/roster strings.

> Net effect: switch to 中文 / हिन्दी / தமிழ் and you get a handful of translated words on `/graph` and an otherwise fully-English app. Malay is the same shape — its dictionary is 100% complete, but it still only reaches `/graph`.

### Why nothing truncates (important nuance)
The elements most at risk of overflow — the 6 mode pills, the lens pills, 3 of the 4 stat
cards — are exactly the keys **missing** from zh/hi/ta, so they render short English
fallbacks. **If the dictionaries are completed, re-test** the mode-pill row
(`graph/page.tsx:213-227`) and the 4-up stat grid (`:184`) on mobile with the longer
Tamil/Devanagari strings.

---

## 2. Currency

Currency logic = `web/src/lib/format.ts`. Display currency = `?ccy=`. **Core formatting is solid.**

| Code | Picker symbol | Locale | Decimals | 1 MYR ≈ |
| --- | --- | --- | --- | --- |
| MYR | RM | en-MY | 2 | 1 (base) |
| SGD | S$ | en-SG | 2 | 0.30 |
| THB | ฿ | th-TH | 2 | 7.7 |
| CNY | ¥ | zh-CN | 2 | 1.55 |
| HKD | HK$ | zh-HK | 2 | 1.73 |
| TWD | NT$ | zh-TW | **0** | 7.1 |
| JPY | ¥ | ja-JP | **0** | 34 |
| USD | $ | en-US | 2 | 0.22 |
| GBP | £ | en-GB | 2 | 0.17 |

- All 9 present; amounts convert correctly on `/graph` and `/records`; **zero-decimal JPY/TWD handled correctly**; thousands separators right; **no overflow** even at 6-figure JPY/TWD values.
- **Hardcoded-"RM" leaks (don't convert with `?ccy=`):**
  - `focusView.ts:111,198` — Income-lens dropdown hints show "RM …/mo" in *every* currency (most visible leak on the currency-aware graph). **Top fix.**
  - `dashboard/page.tsx` (+ `AddTransaction.tsx`) — Dashboard is **MYR-only**: no `CurrencySwitcher`, no `?ccy=`, uses `rm()`.
  - Lower-visibility: Organic edge tooltips (`focusView.ts:126-141` → `NetworkGraph.tsx:158`), `graphView.ts:67-92`, Honey text `projection.ts:204`, `SpendCapture.tsx:121`, and the AI prompt `gemini.ts:132` ("Use RM for amounts").
  - *Not leaks:* Admin cost ledger is USD by design.
- **FX caveat:** rates are **hardcoded/indicative**, and one flat current rate is applied to *all* history (misstates old records). `/records` shows a "≈ indicative rate" note; **`/graph` does not** — add it there too.

---

## 3. Bonus bug (not i18n): `/graph` mobile horizontal overflow
`SankeyFlow.tsx` uses a fixed `W = 920`, so `/graph` scrolls sideways on phones (~356px
overflow at 390px width, identical across locales). Landing/dashboard/records are fine.
Fix: make the Sankey width responsive (viewBox + `width:100%`, or cap to container).

---

## 4. Prioritised fix checklist

**Quick wins (hours):**
- [ ] Complete `zh`, `hi`, `ta` dictionaries to 33/33 (needs correct translations; native review advised).
- [ ] Add the `zh-Hant` locale slot (4 edits in `i18n.ts`; switcher auto-picks it up) + a Traditional dict.
- [ ] Make Income-lens hints currency-aware (`focusView.ts:111,198` → `fmtMoney`).
- [ ] Add "≈ indicative rate" caveat to `/graph`.
- [ ] Fix the mobile Sankey width (responsive).

**Bigger (multi-day, locale-agnostic):**
- [ ] Route `?lang=` into `dashboard`, `records`, `guide`, landing + `SiteHeader`/`SiteFooter`; wrap their chrome in `t()`; extend the key set (~30-40 new keys).
- [ ] Extract the graph-tab hardcoded strings (`CAPTION`, legend, `SankeyFlow` headers, `FlexibleInput`/`SpendCapture`/`PeopleMenu`) into keys.
- [ ] Decide Dashboard currency: add `?ccy=` support or explicitly scope it MYR-only.
- [ ] For real use: live FX + store the rate per transaction date.

**Guardrail:** add a lint/test that flags user-visible JSX string literals under `app/**` not inside `t()`.

---

## 5. Recommendation for the pitch (honesty check)
- **Currency is a real strength** — 9 currencies convert cleanly on `/graph` and `/records`. Demo it confidently (just avoid the Dashboard for currency, and mention rates are indicative).
- **Language is not yet "multi-language support"** — it's **Malay-complete + a multi-language *architecture*** (others scaffolded). Describe it that way, or invest to complete it, so it survives a judge switching locales live.
