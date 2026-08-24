# Personal Data Breach — Response Procedure

**HoneyMoney · Team JUST50**
Version 1.0 · 24 August 2026 · Owner: Data Protection Officer

> Malaysia's PDPA, as amended in 2024, requires a data controller to notify the
> Personal Data Protection Commissioner of a personal data breach, and to notify
> affected individuals where the breach is likely to cause them significant harm.
> This document exists so that obligation is met by following a procedure rather
> than by improvising at the worst possible moment.
>
> ⚠️ **The exact notification deadline must be confirmed against the current
> Personal Data Protection (Data Breach Notification) regulations before you
> rely on the timings below.** This procedure assumes notification to the
> Commissioner **as soon as practicable and within 72 hours** of becoming aware,
> and to affected individuals **within 7 days** where significant harm is
> likely. If the regulations say otherwise, the regulations win — update this
> file the same day you find out.

---

## 0. What counts as a breach

Any event where personal data we hold is, or may have been:

- **accessed** by someone not entitled to it, or
- **disclosed** to someone not entitled to it, or
- **altered** without authority, or
- **lost or destroyed** and not recoverable.

Note the last one. A breach is not only theft. **Losing data we cannot restore
is a breach**, which is why the backup and restore checks in §5 are part of this
procedure and not a separate concern.

Suspicion is enough to start the clock. The clock starts when we become
**aware**, not when we finish confirming.

---

## 1. Roles

| Role | Who | Responsibility |
|---|---|---|
| **Data Protection Officer (DPO)** | *[NAME — must be filled in]* | Owns this procedure. Decides on notification. Single point of contact for the Commissioner. |
| **Technical lead** | *[NAME]* | Containment, evidence, restoration. |
| **Deputy** | *[NAME]* | Acts if the DPO is unreachable within 4 hours. |

> The deputy row is not administrative padding. A 72-hour clock that starts on a
> Friday night does not pause because one person is on a flight.

---

## 2. The first hour — contain

Do these in order. Do not wait for certainty.

1. **Write down the time you became aware.** Everything downstream is measured
   from it. Start a running log — plain text file, timestamped entries, no
   editing of earlier lines.
2. **Contain.** Revoke the exposed credential, block the access path, take the
   affected surface offline if that is what it takes. A short outage is cheaper
   than a longer exposure.
3. **Preserve evidence before cleaning up.** Copy logs, keep the compromised
   artefact. Deleting the evidence to tidy the incident destroys your ability to
   scope it — and scope is what the notification has to state.
4. **Do not notify anyone yet.** Not users, not the Commissioner, not social
   media. Step 3 has to happen first, and a premature statement you have to
   retract is its own harm.

### Credential quick-reference

| If this leaked | Do this |
|---|---|
| PocketBase superuser password | Rotate immediately; audit `ledger` for unexpected writes |
| `PB_ENCRYPTION_KEY` | Rotate, re-encrypt, **and treat every existing backup as compromised** |
| `AI_SECRETS_KEY` | Rotate; every household's stored AI key must be re-entered |
| A household's AI provider key | Notify that household; they revoke it at the provider |
| SSH key (`deploy/domcloud/id_domcloud`) | Remove from the host, issue a new pair |

---

## 3. Assess — what, whose, how bad

Answer these four, in writing:

1. **What categories of data?** Money records, email addresses, H-Score bands,
   receipt images, consent records — be specific.
2. **How many people, and can we name them?** `tenants` and `members` give the
   count. If we cannot determine it, say so; an honest "unknown, upper bound N"
   is better than a guess presented as fact.
3. **Is significant harm likely?** Consider financial loss, identity theft,
   fraud, and — specific to this product — **exposure of one household member's
   private spending to another**, which is a real harm even though it involves
   no outsider.
4. **Is the data usable by whoever holds it?** Encrypted or opaque-keyed data is
   less usable, but *this does not make it "not a breach"*. It affects the harm
   assessment, not whether the obligation exists.

**What is in our favour, factually:** transactions, nodes, edges, H-Score tables,
consents and members carry **no email and no name** — they are keyed to opaque
PocketBase IDs. Identity lives only in `app_users`. So a leak of the money tables
alone does not directly name anyone. State this in the assessment; do not
overstate it, because re-identification from spending patterns is possible.

---

## 4. Notify

**To the Commissioner — as soon as practicable, target within 72 hours of awareness.**

Include: what happened, when, categories of data, approximate number of people
affected, likely consequences, what we have done to contain it, what we are doing
to prevent recurrence, and DPO contact details.

If facts are still emerging, **notify anyway and supplement later.** A late
notification is a separate failure from the breach itself.

**To affected individuals — within 7 days where significant harm is likely.**

Plain language, English and Bahasa Malaysia, sent to the address on their
account. Say what happened, what data, what we have done, what they should do
(change password, watch for phishing), and how to reach the DPO.

Do not minimise, and do not use the word "may" to do work that "did" should do.

---

## 5. Recover and verify

1. Restore from backup if data was lost — `deploy/test-restore.ps1`.
2. **Verify the ledger hash chain** for every affected household. This is what
   the chain is for: it makes silent tampering detectable. A restored database
   with an intact chain is evidence that records were not altered.
3. Confirm the restore actually carries the data — row counts, not just "it
   started".

> Last verified: **24 August 2026** — a live backup restored cleanly with 242
> transactions, 155 nodes, 77 edges, 13 members, 20 ledger entries across 5
> household chains, **0 broken links**.

---

## 6. Afterwards

Within 14 days of closing the incident:

- Written post-incident note: root cause, timeline, what changed.
- Fix the cause, not the symptom.
- Update this procedure if it was wrong or slow.
- Keep the log, the notification, and the note **for at least 7 years**. The
  ability to show what we did is part of the obligation.

---

## 7. Contacts

| | |
|---|---|
| DPO | *[NAME]* · privacy@honeymoney.app |
| Commissioner | Jabatan Perlindungan Data Peribadi (JPDP), Malaysia — confirm current address and portal at time of use |
| Hosting provider | DOM Cloud (application + PocketBase, Singapore) |
| CDN / edge / backups | Cloudflare (Pages, R2 — Asia-Pacific) |

---

## Known gaps in this procedure

Honest, so nobody discovers them mid-incident:

- **The DPO is not yet named**, and has not been notified to the Commissioner.
  Until both are done, §1 and §7 are incomplete and this procedure cannot be
  executed as written.
- **`privacy@honeymoney.app` must be confirmed to actually deliver.** The domain
  has MX records; the routing rule for this address has not been verified.
- **There is no automated detection.** Every path into this procedure today is a
  human noticing something. Log-based alerting is not built.
- **No processor agreements** are in place with DOM Cloud or Cloudflare, so
  their breach-notification duties toward us are undefined.
