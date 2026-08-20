---
name: expense-capture
description: >-
  Design, build and audit every way a daily expense gets into HoneyMoney — type, voice, receipt
  photo / e-wallet screenshot, statement import, Telegram forward — against a hard friction
  budget and the 3-minute time-to-value target (signup → first expense → first Honey insight).
  Covers capture-surface design, AI-parse confirmation UX, confidence & provenance, duplicate
  handling, correction-as-training, offline/zero-token paths, empty states and the habit loop.
  Use whenever touching SpendCapture, AddTransaction, FlexibleInput, StatementImport, the
  Telegram path, voice/receipt parsing, onboarding, or anything measured in taps-to-logged.
  Triggers on: "add expense", "capture", "quick add", "voice input", "scan receipt", "OCR",
  "statement import", "Telegram bot", "onboarding", "time to value", "3-minute", "first run",
  "empty state", "too many taps", "logging friction", "habit".
---

Base directory: `.claude/skills/expense-capture`

# HoneyMoney — Expense capture skill

Capture is where this product lives or dies. Every other feature — the graph, the buckets, the
Honey insight, the whole pitch — is downstream of somebody bothering to log a RM 6.50 coffee.
The research is unambiguous: **manual entry collapses after about two weeks**, and the deciding
factor is how many taps stand between opening the app and being done.

## The two numbers that govern every decision here

1. **Friction budget: ≤ 2 taps from app-open to a logged expense.** If capture takes six taps and
   a login, it does not become a habit. This is a hard budget, not an aspiration.
2. **Time-to-value: < 3 minutes** from landing on the site to seeing a Honey insight derived from
   the user's *own* first expense. Top-quartile products deliver first value in under five
   minutes; fintech averages **5% activation** against 54.8% for AI tools, and >90% of users
   never complete onboarding at all. Three minutes is the target because it is also the demo
   runtime — see the **demo-video** skill.

Any change that increases taps-to-logged or seconds-to-first-insight needs an explicit reason.

## When to use
- Building or changing a capture surface: `graph/SpendCapture.tsx` (the shared engine),
  `dashboard/AddTransaction.tsx`, `graph/FlexibleInput.tsx`, `import/StatementImport.tsx`.
- The parse layer: `lib/voiceParse.ts`, `lib/receipt.ts`, `lib/statement.ts`, `lib/dedupe.ts`,
  `lib/telegram.ts`.
- **Onboarding / first-run / empty states** — everything on the path to the first logged expense.
- Auditing taps, confirmation UX, confidence display, provenance, or duplicate handling.

## When NOT to use
- Where the captured data *lands* (nodes, edges, ledger) → **knowledge-graph** skill.
- Who is allowed to capture, and whose envelope it hits → **money-model** skill.
- Page-level layout/visual polish → **web-design** skill.
- The wording of prompts, hints and errors → **finance-content** skill.

## The five capture paths (verified in code)

| Path | Surface | Parse | Cost | Best for |
|---|---|---|---|---|
| **Type** | `SpendCapture` | none, `confidence = 1` | free | rent, transfers, anything with no artefact |
| **Voice** | `SpendCapture` | `lib/voiceParse.ts` — **on-device, zero-token**, Unicode-first, isomorphic (browser offline, server fallback) | free | the coffee; hands-busy; the fastest path |
| **Photo** | `SpendCapture` | `lib/receipt.ts` — agentic PERCEIVE → GROUND → DECIDE → EXPLAIN | 1 vision call | paper receipts, e-wallet screenshots |
| **Statement** | `StatementImport` | `lib/statement.ts` — PDF **text layer**, exact amounts, reconciles to the printed balance | 1 text call | catching up a whole month |
| **Telegram** | bot → `ingestReceipt` | as photo | 1 vision call | capture without opening the app at all |

**Most people mix all three of the fast paths across a week** — voice for the coffee, scan for
the grocery receipt, typing for the rent transfer. Do not push users onto one "correct" path;
make all three the same two taps from the same place.

## Non-negotiable rules

1. **The AI proposes; the human confirms.** Nothing AI-parsed is written silently.
   `lib/receipt.ts` is explicit: *nothing is written; the agent proposes; the human confirms.*
2. **Confirmation is one screen, pre-filled, editable, one button.** Not a wizard. The user
   should be able to accept a correct parse without reading it carefully, and fix a wrong one
   without starting over.
3. **A correction is training data, not an inconvenience.** When the user overrides a bucket, the
   household's own filing history is what decides next time — the graph grounds the model, not
   the model's imagination.
4. **Show provenance, always.** `source` (`manual`/`voice`/`photo`/`import`/`telegram`) renders
   as a chip. A user must be able to see *how* any number got there.
5. **Confidence gates the UI, not the data.** `parse_confidence = 1` for typed. Below threshold →
   surface the uncertain field highlighted and focused, don't hide the doubt.
6. **Duplicates are the normal case.** Statement rows are checked arithmetically against stored
   transactions *and* the rest of the batch (`lib/dedupe.ts`); a match arrives **un-ticked**.
   Never silently drop or silently double-count.
7. **Reconcile and say so.** The importer totals what it found against the balance the bank
   printed and reports a mismatch out loud. Silently dropping three rows out of ninety is worse
   than failing.
8. **Never block capture on the network or the AI.** Voice parses on-device with zero tokens.
   If a provider is down, typing must still work and must say why the clever path is unavailable.
9. **Never lose a half-entered expense.** A dropped connection, a navigation, a locked phone —
   the draft survives.
10. **Zero-state is a capture surface.** An empty household must offer capture in the first
    screenful, not a tour.

Full detail in `references/capture-patterns.md`. The tap-by-tap audit sheet is
`references/friction-audit.md`.

## The 3-minute path

The only sequence that matters. Every step has a budget:

```
0:00  Land           → value proposition + ONE primary action           (   0 taps)
0:15  Try it         → demo data visible, read-only, no signup wall     (   1 tap )
0:45  Sign up        → email + password, nothing else. Buckets seeded   ( ~4 taps)
1:15  First capture  → voice/photo/type, pre-filled, confirm            (   2 taps)
1:45  It lands       → bucket updates, provenance chip, undo offered
2:00  First insight  → Honey reads THEIR number, not the demo's
2:30  The graph      → one tap, sankey, "here's where it went"
3:00  The hook       → invite a partner, or set one goal
```

**Design consequences:** buckets must be seeded at signup (a user must never meet an empty
bucket list); the first insight must fire on **one** transaction, not wait for enough data; and
"try the demo" must never be behind auth.

## Workflow
1. **Count the taps first.** Walk the current path on a phone-width viewport and write the number
   down. You cannot improve what you didn't measure.
2. **Audit** against `references/friction-audit.md`.
3. **Fix the worst tap**, not the prettiest thing. Removing one required field usually beats a
   restyle.
4. **Keep the paths symmetrical.** Anything added to `SpendCapture` reaches the dashboard and the
   graph at once — that's why it's shared. Don't fork behaviour into one caller.
5. **Verify:** phone viewport, one-handed; a wrong parse corrected; a duplicate; provider down;
   offline; a non-MYR amount; a non-English voice input (the Unicode path exists because
   `[a-z]` silently broke 星巴克 / ஸ்டார்பக்ஸ் / स्टारबक्स into digits only — never regress it).

## Reference files
- `references/capture-patterns.md` — per-path design rules, the confirmation contract, confidence
  & provenance, duplicates, offline, and the researched evidence.
- `references/friction-audit.md` — the tap-count audit sheet, the 3-minute funnel with
  per-step budgets, and the anti-patterns list.

## Related skills
**knowledge-graph** (where it lands) · **money-model** (whose money) · **web-design** (the page) ·
**finance-content** (the words) · **demo-video** (filming the same 3 minutes).
