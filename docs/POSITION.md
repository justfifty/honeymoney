# Standing Declaration — where HoneyMoney is, and what moves it

**HoneyMoney · Team JUST50**
Version 1.0 · 26 August 2026
Privacy lead: **Chua Kia Wah (Alvin Chua)** · Technical lead: **PONG Woon Wei**

> This document exists because the most useful thing a small team can produce,
> when asked "were you being careful?", is a **dated and reasoned account of what
> they knew and what they decided** — not a policy written to sound reassuring.
>
> Everything below was verified against the live system on the date above, not
> inferred from the code or from an older document. Two of the corrections in
> §5 exist because that distinction turned out to matter.

---

## 1. What JUST50 is, today

**Not yet a company.** JUST50 is two individuals building a product together.
Documents name JUST50 as the operator because that is the entity the product
belongs to and will belong to; the legal person carrying every obligation in
this document is currently **Chua Kia Wah and PONG Woon Wei, personally, jointly
and without limit**.

Nothing in the terms of service changes that. A limitation of liability protects
the operator against a user; it does nothing about the fact that "the operator"
is presently two people's own names. **Incorporation is the instrument that
changes it, and it is the single highest-value item on the path in §4.**

Team composition matters for two obligations and is recorded here so neither is
worked out from scratch later:

| | |
|---|---|
| Chua Kia Wah | Malaysian citizen. Business lead. Privacy lead and contact point. |
| PONG Woon Wei | Singaporean. Technical lead. Deputy. |

The privacy-lead assignment follows from the first row: a Malaysian privacy
contact is what the residency expectation points to, so it is not arbitrary and
should not be swapped without noticing that.

---

## 2. What the system holds

Verified against the production database, 26 August 2026.

| | Count |
|---|---|
| Accounts | 9 |
| Households, excluding 3 demo personas | 13 |
| **Transactions entered by real people** | **22** |
| Transactions belonging to demo personas | 228 |
| Consent records | 14 |

**Almost everything in the database is seeded demonstration data.** The real
content is the founders' own records plus a small number of test households.

This is the number that sets the proportion of everything else in this document.
The realistic risk today is **losing our own data, not a regulatory finding**.
That reverses the moment somebody outside the team enters real spending, which
is why §4 exists.

Two exceptions worth naming rather than averaging away:

- **One account cannot be identified.** "Peter OKORONKWO", registered 20 August,
  zero transactions. A name and an email are personal data with or without
  financial records attached. Either identify the account or erase it. An
  unexplained third party in a production database is how "it is only us" stops
  being true without anyone noticing.
- **Most households have no consent record.** The `consents` ledger arrived with
  notice version 2026-08-24; accounts created before it have nothing recorded,
  including one household with ten transactions. Acceptable while the data is
  the founders' own. Not acceptable for anyone else.

---

## 3. What is true right now — the commitments that already hold

These are not intentions. Each is enforced by code that fails closed, and where
a test exists it is named so a reader can run it.

| Commitment | How it is enforced | Verify with |
|---|---|---|
| AI is off unless the household consents | `lib/aiGuard.ts` gate in `askHoney`, the receipt route and the statement route; falls back to the deterministic template | `hasConsent` callers |
| A model never produces a number | `askCompute.ts` computes every figure; `verifyNumbers` discards prose containing any figure it did not compute | `npm run check:ask` |
| A cloud model receives no household data | `toWire()` sends an intent name, slot names and a locale — no figures, no labels, no free text | `npm run check:ask` (8 wire assertions) |
| Documents never reach a cloud model when a local one exists | `dataClass` is required at the type level; class 2 routes to Ollama where configured; `aiVision` is pinned to class 2 | `lib/ai.ts` |
| Backups leave encrypted | AES-256-GCM before upload; the key never enters the bucket | `node deploy/backup-vault.mjs verify` |
| What crossed the boundary is recorded | `data_class`, `local`, `egress_bytes` on `ai_usage` — never the payload | migration `1756200001` |
| A partner cannot read private spending through chat | Ask Honey uses the same viewer filter as the record list | `npm run check:ask` (privacy block) |
| Nothing is recommended to anybody | `directory.ts` has no score, rank or rating field, and `getListings()` refuses a household id | `lib/directory.ts` |
| No DPO is claimed | Below threshold; reasoning and review date in `BREACH_PROCEDURE.md` §1 | — |

**The single point of failure is `deploy/.pb-backup-key`.** Every backup in R2
is unreadable without it, by Cloudflare and by us. An offline copy is the one
protection on this page that no code can provide.

---

## 4. What moves us to the next state

Each row is a trigger, not a date. Crossing one changes what is required, and
the action beside it is what it forces.

| Trigger | What it forces |
|---|---|
| **Anyone outside the team enters real spending** | DOM Cloud and Cloudflare processor agreements signed first. Consent back-filled or re-asked. This is the big one. |
| **Incorporation** | Controller becomes the company. Re-paper both processor agreements in its name. Founders' agreement executed at the same time, not after. |
| **Households reach the thousands** | DPO appointment and notification to the Commissioner. Re-read `BREACH_PROCEDURE.md` §1. |
| **Clinic or pharmacy receipts become routine** | Health data is sensitive personal data — a stricter regime and a lower threshold. Receipts must be local-only by then. |
| **Employer or sponsor pilot** | Processing for an organisation. Small-cell floor (`aggregateDisclosure.ts`, k≥10) becomes load-bearing. New processor terms. |
| **Any always-on profiling** | Systematic monitoring. Also the point at which the directory would stop being a catalogue — which is why it will not. |
| **First referral revenue** | Counsel on BNM/SC licensing **before** the money, not after. `PARTNER_OFFERS_ENABLED` stays `false` until then. |
| **Migration off DOM Cloud** | Their agreement must be in place before data moves, and the register updated the same day. |

---

## 5. What we got wrong, and how

Kept because a register that only records conclusions is less trustworthy than
one that records corrections.

- **The processor register named a host we were not using.** It described DOM
  Cloud as holding everything in Singapore; a later reading of `DEPLOY.md` said
  the deployment was local-first and the register was "corrected" to say DOM
  Cloud held nothing. **Both were wrong in turn.** `web/.env.local` settles it:
  `POCKETBASE_URL=https://honeymoney-pb.domcloud.dev`. The database is on DOM
  Cloud; the *application server* is what runs locally. **Verify a register
  against the running configuration, never against the document describing the
  deployment.**
- **A check reported an empty bucket that held thirteen plaintext database
  copies.** The listing parser assumed an XML field order the provider does not
  use, matched nothing, and returned a false all-clear — the worst thing a check
  can return. Fixed, and the lesson is in the code comment.
- **A consent was collected for a year and never enforced.** `hasConsent()` had
  no callers anywhere in the application while signup wrote the answer and the
  settings screen rendered it.
- **An egress path nobody was watching.** `honeyInsight()` sent household bucket
  labels and exact figures to a cloud model on every dashboard load. It surfaced
  only because `dataClass` was made a required field and the compiler asked.

---

## 6. Standing position

At the scale in §2, with the controls in §3, we consider the current
arrangement proportionate, and we have written down in §4 what changes it.

We are not claiming compliance we have not tested, we are not claiming
anonymisation we do not have, and where a conclusion rests on an unverified
reading of guidance we have said so in the document that carries it.

Signed — Team JUST50

| | | |
|---|---|---|
| Chua Kia Wah | Privacy lead | ____________________ |
| PONG Woon Wei | Technical lead | ____________________ |

> Review this document when any trigger in §4 fires, and in any case before
> launch. Record the review date and reviewer here:
>
> | Reviewed | By | Notes |
> |---|---|---|
> | 26 Aug 2026 | (initial) | Created. §2 verified against live database. |
