# PDPA Compliance Status

**HoneyMoney · Team JUST50**
Last verified against the **live system**: 25 August 2026 · Owner: Privacy lead — **Chua Kia Wah (Alvin Chua)**. No DPO appointed; below threshold, see BREACH_PROCEDURE.md §1

> One page answering "where do we actually stand?", so the answer never again
> has to be reconstructed from a chat log. Every ✅ here was verified against
> honeymoney.app or the live database on the date above — not inferred from the
> code. Re-verify before relying on this after any deploy that touches auth,
> analytics, consent, or the notice.

---

## The seven principles (PDPA 2010)

| # | Principle | Status | Evidence, as verified live |
|---|---|---|---|
| 1 | **General** (consent) | ✅ | Per-purpose consent ledger (`consents`, append-only), opt-in at signup, withdrawal recorded with source `withdrawal` |
| 2 | **Notice & Choice** | ✅ | [/privacy](https://honeymoney.app/privacy) live, English + Bahasa Malaysia on one page, purposes, recipients, rights; served from the edge so it survives origin outage |
| 3 | **Disclosure** | ✅ | No third-party sharing. `PARTNER_OFFERS_ENABLED = false`; the consent API rejects the purpose even from a hand-crafted request; the notice says NOT CURRENTLY OFFERED |
| 4 | **Security** | ⚠️ | Every collection 403 to anonymous reads (verified across ten). Ledger carries no emails. Analytics carries no IP/UA/account (see below). **Open: the superuser UI at `/_/` still answers 200 — H1** |
| 5 | **Retention** | ✅ | 30-day account purge scheduled (`HoneyMoney-Purge`, daily) and running; backups roll at 14; both disclosed, including the ~45-day worst case |
| 6 | **Data Integrity** | ✅ | Users edit their own records; every change lands in the append-only hash-chained ledger; chain verified 0 broken links, including through a restore |
| 7 | **Access** | ✅ | `/api/account/export` live, 401 anonymous, exports the viewer's own view via the same `visibleFilter` that redacts the screen |

**Data minimisation, done rather than promised** (25 Aug): `page_views` no longer
collects IP, user-agent, or account id — counts only (page, country, duration,
random session id). All **3,093 existing rows scrubbed** on the live database.
`ledger.actor_email` removed from writes and backfilled (30 rows), names now
resolved from the household roster at render time.

## The 2024 amendments

| Obligation | Status | Where |
|---|---|---|
| Data portability | ✅ | `/api/account/export`, machine-readable JSON |
| **Breach-notification procedure** | ✅ **written** | [docs/BREACH_PROCEDURE.md](BREACH_PROCEDURE.md) — roles, first hour, notify, recover; names its own gaps |
| **Processor register + cross-border assessment** | ✅ **documented** | [docs/DATA_PROCESSORS.md](DATA_PROCESSORS.md) — DOM Cloud (SG), Cloudflare Pages, R2 (APAC), AI providers (none enabled) |
| Backup restorability | ✅ **proven** | Live backup restored 24 Aug: 242 txns, 20 ledger entries, 0 broken chain links |
| DPO appointed + notified to Commissioner | ❌ | Human item — H2 |
| Processor agreements signed | ❌ | Human item — H4 |

---

## What remains — every item needs a human, none needs code

| # | Action | Who | Effort |
|---|---|---|---|
| **H1** | **Redeploy `pb.deploy.yml` in the DOM Cloud portal.** The `return 403` for the superuser UI is committed and inert until redeployed. The one open Security item. | Founder | 5 min |
| **H2** | **Name a DPO** (a founder is fine) into `BREACH_PROCEDURE.md` §1/§7, then notify the Commissioner (JPDP). | Founder | Name: 5 min. Notification: external process |
| **H3** | **Verify `privacy@honeymoney.app` delivers** — MX exists; the routing rule for this address is unconfirmed. A notice naming an unreachable DPO is worse than naming none. | Founder | 10 min |
| **H4** | **Accept DOM Cloud's and Cloudflare's standard DPAs**, file copies, tick them off in DATA_PROCESSORS.md §4. | Founder | ~30 min reading |
| **H5** | **Counsel, once, before launch:** certify the Bahasa Malaysia notice text; sanity-check the cross-border basis (DATA_PROCESSORS.md §2); confirm the breach-notification deadlines hard-coded in BREACH_PROCEDURE.md. | Lawyer | One engagement |

## When H1–H5 are done

Then every row above is ✅ and the honest public claim becomes:

> *"Aligned with PDPA 2010 and the 2024 amendments — verified controls, documented
> procedures, counsel-reviewed notice. Not certified: no audit has been performed."*

That last clause stays until an independent audit says otherwise. "Compliant" is
an assessment someone else gets to make; what we own is that every claim in this
table is checkable, and stays checked.
