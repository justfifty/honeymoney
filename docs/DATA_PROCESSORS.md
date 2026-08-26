# Data Processors & Cross-Border Transfers

**HoneyMoney · Team JUST50**
Version 1.0 · 24 August 2026 · Owner: Privacy lead (Alvin Chua)

> Two obligations in one document, because they concern the same facts.
>
> The 2024 PDPA amendments place direct obligations on data **processors** and
> require the controller to have terms in place with them. Separately, personal
> data leaving Malaysia is a **cross-border transfer** that must be disclosed and
> justified. Every third party below is one, the other, or both.
>
> This register is the answer to "who else touches your users' data?" — a
> question that has to be answerable in writing, on demand, and quickly during an
> incident.

---

## 1. Register of processors

> **Corrected twice on 26 August 2026 — read this before the table.**
>
> An earlier correction today claimed DOM Cloud was not a processor, on the
> strength of `DEPLOY.md` saying honeymoney.app is served "local-first from the
> Windows PC". That was wrong, and wrong in the direction that matters.
> `web/.env.local` sets `POCKETBASE_URL=https://honeymoney-pb.domcloud.dev`:
> **the production database is on DOM Cloud.** What is local-first is the
> Next.js app server, not the data.
>
> The original register was right. This note stays in place rather than being
> tidied away, because "we checked and reversed ourselves" is a fact a reviewer
> is entitled to see, and because the near-miss is the argument for verifying a
> register against the running configuration rather than against the deployment
> document that describes it.

| Processor | What they process | Where | Terms in place |
|---|---|---|---|
| **DOM Cloud** | **The production PocketBase database** — every household's transactions, nodes, edges, members, H-Score, consents, ledger. Confirmed live at `honeymoney-pb.domcloud.dev`. | Singapore | ❌ **Standard DPA not accepted** |
| **The PC** (not a processor) | The Next.js application server, reached through the tunnel. Holds no database of its own; a stale local PocketBase from 23 August is not in use. | Malaysia | n/a |
| **Cloudflare — Tunnel** | Proxies signed-in traffic to the app server. Sees request metadata and IP addresses; stores no records. | Global edge | ❌ Not yet accepted |
| **Cloudflare — Pages** | The always-on static snapshot: landing, guide, gallery, deck. No personal data. | Global edge | ❌ Not yet accepted |
| **Cloudflare — R2** | Nightly database backups — **encrypted with AES-256-GCM before upload since 26 August 2026** (`deploy/backup-vault.mjs`). Cloudflare holds ciphertext and cannot read it. | Asia-Pacific, `jurisdiction: null` | ❌ Not yet accepted |
| **AI provider** (Gemini / Groq) | Class-1 payloads only — intent name, slot names, locale. Class 2 routes to a local engine where one is configured. Off unless the household consents. See `lib/aiGuard.ts`. | Provider-dependent, outside MY | Re-open before enabling |
| **Ollama** (optional) | Same, on hardware the household controls. **Not a processor** — nothing leaves their machine. | Household's own | n/a |

### Not processors

- **Tesseract (receipt OCR)** — runs in the user's browser. The image never
  leaves the device to be read. This is why on-device capture is a privacy claim
  and not just a performance one.
- **The H-Score engine** (`web/src/lib/hscore.ts`) — 418 lines, zero imports, no
  network. It cannot transmit anything.

---

## 2. Cross-border transfer assessment

Personal data processed by HoneyMoney leaves Malaysia. This is deliberate, it is
disclosed in the privacy notice, and the reasoning is recorded here.

### 2.1 What is transferred, and where

| Destination | Data | Basis relied on |
|---|---|---|
| **Singapore** (DOM Cloud) | All household records, continuously — this is the primary store | Comparable law + consent + necessity |
| **Asia-Pacific** (Cloudflare R2) | Full daily backups, **encrypted before they leave** | Consent + necessity, and the recipient cannot read the contents |
| Global edge (Cloudflare Tunnel) | Request metadata and IP addresses in transit | Necessity — the site cannot be reached without it |
| Outside MY (AI provider) | Class-1 payloads only, and only with that household's opt-in | Explicit, purpose-specific consent |

**The primary store is in Singapore, not Malaysia.** Stating it plainly because
this document briefly claimed otherwise. What *has* changed for the better is the
backup leg: R2 now receives ciphertext, so the only copy of the database outside
the primary store is unreadable by the party holding it.

### 2.2 Why the backup destination is defensible

- Singapore's **Personal Data Protection Act 2012** imposes obligations
  comparable to Malaysia's — consent, purpose limitation, protection, retention
  limitation, breach notification.
- The transfer is **necessary for performance of the service** the data subject
  asked for: a household budget that syncs across devices cannot be delivered
  without a hosted database.
- It is **disclosed before collection**, in English and Bahasa Malaysia, at
  `/privacy` § *Where it is stored*.
- The data subject consents to that notice at sign-up, and the consent is
  recorded per purpose in the `consents` ledger.

### 2.3 Honest limitations

State these rather than let a reviewer find them:

- **We have not obtained a formal adequacy determination.** We rely on the
  comparability of the receiving regime, on necessity, and on disclosed consent.
  Whether that is sufficient under the amended cross-border rules is a question
  for counsel, not for us.
- **The R2 region is `apac`, not a named country.** Cloudflare places objects
  within Asia-Pacific; we do not control which country. This is disclosed as
  "Asia-Pacific" rather than claimed to be Singapore, because claiming a
  precision we do not have would be worse than the imprecision.
- **No processor agreements are signed.** Until they are, each processor's
  obligations toward us — including their duty to tell us about *their* breaches
  — rest on their standard public terms rather than anything we have reviewed.

---

## 3. What reduces the exposure today

Not mitigation theatre — these are properties the system actually has, verified
2026-08-24:

- **No collection is readable without authentication.** `transactions`, `nodes`,
  `edges`, `members`, `app_users`, `consents`, `hscore_snapshots`, `ledger` and
  the rest all answer `403` to an anonymous request.
- **Financial data carries no global identifier.** Money tables are keyed to
  opaque PocketBase IDs. No email, no name. Identity lives only in `app_users`,
  and as of 24 August the audit trail no longer stores an actor email either.
- **The H-Score is stored as a wrapper.** `hscore_snapshots` holds tenant ID,
  score, band, sub-scores — no vendor, no amount, no transaction.
- **Stored AI keys are encrypted** by the application before reaching the
  database, so they are unreadable in any backup.
- **Backups are proven restorable**, verified 2026-08-24: 242 transactions, 155
  nodes, 77 edges, 13 members, 20 ledger entries across 5 household chains, 0
  broken hash links.

---

## 4. Outstanding — assign and close

| # | Action | Owner | Status |
|---|---|---|---|
| 1 | **DOM Cloud DPA — accept and file.** They hold the live production database. Needed before real users, not before tomorrow — see the scale note below. | Privacy lead | ❌ Before launch |
| 2 | **Accept and file Cloudflare's DPA** (Tunnel, Pages, R2) — self-serve in the dashboard, needs no company | Privacy lead | ❌ **Do now** |
| 2a | Decommission or wipe the stale local PocketBase (last backup 23 August). While it exists it is an undocumented copy of household data. | Tech lead | ❌ |
| 3 | Confirm the R2 bucket's actual jurisdiction, if Cloudflare will state it | Tech lead | ❌ |
| 4 | Counsel review of the cross-border basis in §2.2 | Privacy lead | ❌ |
| 5 | Re-open this register before enabling any AI provider | Privacy lead | Pending |

### 4.1 Scale — read the actions above in proportion

Verified against the live database on 26 August 2026:

| | |
|---|---|
| Accounts | 9 |
| Households (excluding the 3 demo personas) | 13 |
| **Transactions entered by real people** | **22** |
| Transactions belonging to the demo personas | 228 |

Almost everything in the database is seeded demo data. The real content is the
founders' own records plus a handful of test households. That does not make the
agreements optional — it means the realistic risk today is **losing our own data,
not a regulatory finding**, and the actions should be read in that order. The
proportions change the moment someone outside the team enters real spending.

Two findings from the same check:

- **One account belongs to someone we cannot identify** — "Peter OKORONKWO",
  registered 20 August, zero transactions. A name and an email are personal data
  even with no financial records attached. Either identify them or erase the
  account; leaving an unexplained third party in a production database is the
  thing that makes "it is just us" untrue without anyone noticing. A second
  outside account, "JENNIFER", is a family member of the tech lead.
- **Most households have no consent record.** The `consents` ledger arrived with
  notice version 2026-08-24; accounts created before it have nothing recorded.
  One household has 10 transactions and zero consents. Acceptable while the data
  is the founders' own; not acceptable for anyone else. Back-fill consent, or
  re-ask, before onboarding a single outside user.

> Item 5 matters most in practice. The moment an AI key is configured, a new
> processor starts receiving user text, in a new jurisdiction — and this register
> must say so *before* that happens, not after.
