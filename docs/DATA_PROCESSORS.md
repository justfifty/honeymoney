# Data Processors & Cross-Border Transfers

**HoneyMoney · Team JUST50**
Version 1.0 · 24 August 2026 · Owner: Data Protection Officer

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

| Processor | What they process | Where | Terms in place |
|---|---|---|---|
| **DOM Cloud** | The PocketBase database — every household's transactions, nodes, edges, members, H-Score, consents, ledger. Also the Next.js application server. | Singapore (`sgp.domcloud.co`) | ❌ **Standard DPA not yet accepted** |
| **Cloudflare — Pages / Tunnel** | Serves public pages; proxies signed-in traffic to the origin. Sees request metadata and IP addresses; does not store records. | Global edge, Singapore for MY traffic | ❌ **Not yet accepted** |
| **Cloudflare — R2** | **Daily database backups** — a complete copy of everything above. | Asia-Pacific (`locationHint: "apac"`) | ❌ **Not yet accepted** |
| **AI provider** (Gemini / Groq) | Only text a user captures, and only if that household switched AI features on. Off by default; **no key configured today, so nothing is being sent.** | Provider-dependent, outside MY | ❌ Not applicable until enabled |
| **Ollama** (optional) | Same as above, but runs on hardware the household controls. **Not a processor** — no data leaves their machine. | Household's own | n/a |

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
| **Singapore** (DOM Cloud) | All household records, continuously | Comparable law + consent + contract |
| **Asia-Pacific** (Cloudflare R2) | Full daily backups | Same, plus access control |
| Outside MY/SG (AI provider) | Captured text, **only** with that household's opt-in | Explicit, purpose-specific consent |

### 2.2 Why Singapore is defensible

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
  comparability of Singapore's regime, on necessity, and on disclosed consent.
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
| 1 | Accept and file DOM Cloud's DPA / standard terms | DPO | ❌ |
| 2 | Accept and file Cloudflare's DPA (covers Pages and R2) | DPO | ❌ |
| 3 | Confirm the R2 bucket's actual jurisdiction, if Cloudflare will state it | Tech lead | ❌ |
| 4 | Counsel review of the cross-border basis in §2.2 | DPO | ❌ |
| 5 | Re-open this register before enabling any AI provider | DPO | Pending |

> Item 5 matters most in practice. The moment an AI key is configured, a new
> processor starts receiving user text, in a new jurisdiction — and this register
> must say so *before* that happens, not after.
