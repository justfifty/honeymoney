# Capture patterns — per-path design rules

Verified against `web/src/app/graph/SpendCapture.tsx`, `dashboard/AddTransaction.tsx`,
`graph/FlexibleInput.tsx`, `import/StatementImport.tsx`, `lib/voiceParse.ts`, `lib/receipt.ts`,
`lib/statement.ts`, `lib/dedupe.ts`, `lib/telegram.ts`, `app/manifest.ts`.

---

## 0. The evidence

| Finding | Design consequence |
|---|---|
| Manual entry has **high abandonment after week two** — people track diligently, then stop because logging feels like work | Automation isn't a premium feature; it's the retention mechanism |
| **"If capturing a receipt takes six taps and a login, it will not become a habit"** | ≤ 2 taps, hard budget |
| Receipts not captured **within 24 hours are probably never logged** | Same-day nudge; make catch-up cheap (statement import) |
| Successful apps offer **all three** of voice / scan / type — most people use all three in one week | Never force one path; symmetrical affordances |
| Voice raises logging *frequency* — seconds of speech vs. multiple taps — but **accuracy degrades in noise** | Voice is fastest AND needs the confirmation step; both are true |
| Best pattern = **natural-language parsing + a confirmation step**; avoid rigid command formats and avoid skipping human review | Exactly the `SpendCapture` contract |
| Fintech activation averages **5%** (vs 54.8% for AI tools); >90% never complete onboarding; top-quartile TTV is **under five minutes** | The 3-minute target is aggressive but not fantasy |

---

## 1. `SpendCapture` — the shared engine

One component backs both the dashboard (`AddTransaction`) and the graph (`FlexibleInput`). That
is deliberate and load-bearing:

> "This form used to be typing-only: no voice, no scan, no currency, no date. It was the odd one
> out — the /graph form had capture and this, the one on the page people actually live on, did
> not." — `AddTransaction.tsx`

**Rule: a capability added to `SpendCapture` must appear in every caller, at the same tap depth.**
Asymmetry between "the page people live on" and anywhere else is the exact bug that was fixed.

### The confirmation contract
Every AI-assisted path resolves to the same screen:

```
[ vendor        ] ← pre-filled, focused if uncertain
[ amount   ccy  ] ← pre-filled; currency defaults to the tenant base (MYR)
[ bucket   ▾    ] ← chosen by the household's OWN filing history, not a global guess
[ date          ] ← defaults to today, local
[ member   ▾    ] ← only when the household has more than one person
                  ⟨ one-line explanation of what the agent decided and why ⟩
[  Save  ]        ← one button
```

- **Pre-filled and editable**, never read-only-then-edit.
- **One button.** No "Next → Review → Confirm".
- **The uncertain field is the focused field.** If confidence is low on the amount, that's where
  the cursor goes.
- **The explanation is one line**, and it is the agent's actual reasoning
  (`lib/receipt.ts` step 4 EXPLAIN), not boilerplate.

---

## 2. Voice — the zero-token path

`lib/voiceParse.ts` runs **on-device**, is **isomorphic** (no `node:` imports, so the browser
parses offline and the server uses the same code as a provider fallback), and is **Unicode-first**.

**The Unicode rule is a regression trap with history.** The original parser used `[a-z]` and
`[^a-z'&\-\s]`, which cannot match 星巴克, ஸ்டார்பக்ஸ் or स्टारबक्स. For Chinese, Tamil and Hindi
every letter was stripped, the vendor came back `undefined`, and only the ASCII digits the ASR
emits survived — the reported "it only recognises numbers" bug. Everything here uses `\p{L}` with
the `/u` flag and assumes nothing about space-separated words.

**Never reintroduce an ASCII-only character class in this file.** Any test suite touching voice
must include a non-Latin transcript.

Design rules:
- Push-to-talk, not always-listening. Explicit start, visible listening state, easy cancel.
- Show the **transcript** alongside the parse. When the parse is wrong the user needs to see
  whether the ASR or the parser failed.
- Noise degrades accuracy — so voice always lands on the confirmation screen. Never straight-to-save.
- Zero tokens means voice must keep working when every AI provider is down or unconfigured.

---

## 3. Photo — the agentic receipt loop

`lib/receipt.ts` is deliberately **not** "one call to read the image":

```
1. PERCEIVE  vision model reads the receipt / e-wallet screenshot
2. GROUND    fetch the household's real buckets, vendors, recent spend,
             and which bucket they file each vendor under.
             ── no later step may invent an id ──
3. DECIDE    the household's own filing history picks the bucket where it has one;
             ARITHMETIC (not the model) decides duplicates;
             a text model, given only real options, fills the rest —
             spots a subscription, flags anything anomalous vs this household's history
4. EXPLAIN   one plain-English line the user can act on
```

This is the strongest technical story in the capture stack and the reason the app can claim
"grounded in your graph" rather than "we call an LLM". Protect the ordering:

- **GROUND before DECIDE, always.** A model choosing a bucket from a free-text guess instead of
  the household's real bucket list is a correctness bug and a trust bug.
- **Arithmetic decides duplicates**, not the model.
- **Nothing is written.** The proposal is state in the client until the human confirms.
- Accept **e-wallet screenshots**, not only paper receipts — in Malaysia that's the majority
  artefact (see the Malaysian context in the **money-model** skill).

---

## 4. Statement import — the catch-up path

`lib/statement.ts` exists because *a receipt is one payment; a statement is a month of them*.
Three design commitments, all of which are testable claims:

1. **Exact amounts.** Read the PDF's **text layer**, not an OCR of it — a bank's PDF already
   contains `1,234.56` as characters. Nothing guesses at a digit. A *scanned* statement has no
   text layer; that path is vision **and it says so out loud**.
2. **Duplicates are the normal case.** You scanned the ZUS receipt on Tuesday; the card statement
   lists it too. January's import overlaps February's statement. Every row is checked
   arithmetically against stored transactions and against the rest of the batch; **a match
   arrives un-ticked**, visible, with the reason.
3. **It reconciles.** Total what was found against the balance the bank printed; report a
   mismatch explicitly. *"An importer that silently drops three rows out of ninety is worse than
   useless."*

Import also accepts a **photo/screenshot** for multi-transaction scanning, not only PDF.

UX rules: a reviewable table with per-row tick, obvious un-ticked-because-duplicate reason, a
running total against the statement's own total, and a single commit. Never auto-commit a batch.

---

## 5. Telegram — capture without opening the app

`resolveTenantByChannel` maps a chat id → tenant via `channel_links` (unique on
`channel + external_id`, `linkChannel` idempotent). Forwarded receipts land through
`ingestReceipt` with `source = "telegram"` and no logged-in actor — the ledger records the
channel as the actor.

This is the lowest-friction path that exists (zero taps in HoneyMoney at all) and the strongest
demo beat. Rules:
- The bot **replies with what it recorded** and a correction affordance. A silent write is a trust
  failure on a channel the user can't see the books through.
- Linking must be a one-time, obvious step in `/setup`.
- Because there's no interactive actor, `parse_confidence` and `source` matter more, not less.

---

## 6. PWA & mobile capture

`app/manifest.ts` is installable (`display: standalone`, maskable icon, theme `#FF7518`) with
**no service worker** — a deliberate choice to avoid stale-cache surprises during the demo. Never
force the install prompt; installing is a user choice (`IosInstallHint` / `InstallPrompt`).

**Known opportunity — Web Share Target.** An installed PWA can register in the OS share sheet via
the `share_target` manifest member, so a user could share a receipt photo or an e-wallet
screenshot *straight from the gallery into HoneyMoney* — the true one-tap capture. Caveats before
implementing: only **installed** PWAs register; `method: "POST"` (needed for files) requires a
service worker, which conflicts with the current no-SW decision; iOS support is absent. Treat it
as a deliberate trade, not a free win.

Camera capture uses `getUserMedia()`; a plain `<input type="file" accept="image/*" capture>` is
one tap and works everywhere including iOS — prefer it unless live preview is genuinely needed.

---

## 7. Cross-cutting rules

**Provenance.** `source` renders as a chip everywhere a transaction is listed. A user must always
be able to see whether a number was typed, spoken, scanned, imported, or forwarded.

**Confidence.** `parse_confidence = 1` when typed. Below threshold, the UI surfaces doubt — it
does not hide it and does not refuse to proceed. Confidence changes *presentation*, never
*storage*.

**Correction as training.** When the user overrides the proposed bucket, that correction becomes
the household's filing history and drives the next decision. Say so in the UI once — it converts
a moment of annoyance into evidence the app is learning.

**Offline / degraded.** Voice works with zero tokens. Typing always works. If a provider is
unconfigured or down, say which capability is unavailable and why — never present a dead button.

**Draft safety.** A half-entered expense survives a navigation, a lost connection, and a locked
screen.

**Undo.** Every write offers an immediate undo. Void-not-delete makes this cheap
(see **knowledge-graph**).

**Multi-currency.** Amounts store in MYR; what the user actually typed plus the rate and rate
source persist in `raw.entered`. Never discard the entered figure.

---

## Sources
- [Voice Expense Tracking: Log Spending Without Touching Your Phone — Receiptix](https://receiptix.io/blog/2025/01/30/using-voice-for-quick-expense-tracking-the-easiest-way-to-manage-your-money)
- [AI Expense Tracker vs Manual: Which Approach Works Better? — Finny](https://getfinny.app/blog/ai-expense-tracking-vs-manual)
- [How to Automate Receipt Collection for Expense Tracking — Finny](https://getfinny.app/blog/automate-receipt-collection-expense-tracking)
- [Best App That Scans Receipts for Your Budget — Finny](https://getfinny.app/blog/app-that-scans-receipts-for-budget)
- [15 Must-Have Features of Expense Tracking Apps — RipenApps](https://ripenapps.com/blog/expense-tracking-app-features/)
- [share_target — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target)
- [PWA Capabilities — web.dev](https://web.dev/learn/pwa/capabilities)
