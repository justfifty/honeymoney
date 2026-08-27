# Vendor register and data flow

Who touches HoneyMoney's personal data, what they get, and where they are.

Written because the PDPA's Security Principle expects a data user to know this,
and because the privacy notice makes claims — "your database is in Singapore",
"no third-party analytics" — that are only checkable against a list like this
one. Every entry below was **verified** on 2026-08-27 rather than recalled;
where something is a plan rather than a fact, it says so.

Owner: Team JUST50 · Review: whenever a vendor is added, removed, or moves
region, and in any case before a public launch.

---

## 1. Vendors that can see personal data

| Vendor | Role | What it holds | Where | Verified how |
|---|---|---|---|---|
| **DOM Cloud** (on Oracle Cloud) | Processor — hosting | The PocketBase database: every money record, member, consent, sharing decision, receipt file. Also the Next.js app server. | **Singapore** | SSH host is `sgp.domcloud.co`; PocketBase resolves to 138.2.103.58 (Oracle Cloud) |
| **Cloudflare** | Processor — CDN, tunnel, DNS, R2 | Traffic in transit; the daily encrypted database backups in R2; the static public snapshot (no personal data) | Global edge; R2 bucket in **Asia-Pacific** | Pages project `honeymoney`; R2 configured by `deploy/setup-r2-backups.mjs` |
| **Google** (Gemini) | Processor — optional AI | Only the text or image a user submits **while AI consent is on**. Never credentials, account ids, H-Score, or another member's records. | Outside Malaysia | `lib/config.ts` provider routing; gated by `lib/aiGuard.ts` |
| **Groq** | Processor — optional AI | As above. | Outside Malaysia | As above |
| **Ollama (self-hosted)** | Not a vendor — our own hardware | As above, but nothing leaves the machine | **Malaysia** | `AI_PROVIDER=ollama`, `OLLAMA_URL=http://127.0.0.1:11434` |
| **Telegram** | Processor — optional capture channel | Anything a user forwards to the bot, before it reaches us. Under Telegram's terms, not ours. | Outside Malaysia | `TELEGRAM_BOT_TOKEN` is set, so the path is live |
| **OpenTimestamps calendars** | Public infrastructure | A SHA-256 digest of a household's ledger head. No personal data; not reversible; not linked to a name or account. Only on an explicit Anchor press. | Public / Bitcoin | `lib/ledger.ts` `CALENDARS` |

### Vendors deliberately absent

No analytics SDK, no advertising network, no session-replay tool, no error
tracker, no email marketing platform, no CRM. Visit counts are recorded by our
own `/api/track` into our own database — page, country, duration, no IP, no
account link. This absence is a claim in the privacy notice and the Cookie
notice, and it is what makes both true.

### Not yet in place

No signed Data Processing Agreement exists with any vendor above. We currently
rely on their published terms. **This is a gap, and a real one** — the PDPA
expects a data user to bind its processors by contract. It should be closed
before onboarding any sponsor or employer, and it needs the lawyer's review
already in the build order.

---

## 2. Where the data actually goes

```
  Household device
    |  receipt photo ---> tesseract.js in the browser (public/ocr/)
    |                     ON DEVICE. No network. Nothing leaves.
    |  offline capture -> IndexedDB queue, sent when a connection returns
    v  HTTPS
  Cloudflare edge  -- public pages from the static snapshot (no personal data)
    |                 everything else proxied |
    v                                         v
  Next.js app server ............................. DOM Cloud, Singapore
    |  authenticates to PocketBase as superuser and mediates EVERY read.
    |  The browser never talks to PocketBase directly, which is why row-level
    |  privacy is enforced in the query (lib/attribution, lib/sharingRedact)
    |  rather than in collection rules -- see the note in lib/attribution.ts.
    v
  PocketBase (SQLite) ............................ DOM Cloud, Singapore
    |
    +--> daily encrypted backup --> Cloudflare R2, Asia-Pacific (last 14 kept)
    |
    +--> OPTIONAL, consent-gated, per request:
           +- local Ollama ...... our hardware, Malaysia. Nothing leaves.
           +- Google Gemini ..... outside Malaysia
           +- Groq .............. outside Malaysia

  OPTIONAL side channel:
    Telegram --> our webhook. Passes through Telegram before it reaches us.
```

**Two boundaries worth naming.** Receipt OCR runs on the device by default, so
the most sensitive artefact the app handles — a photograph of where somebody
was — normally never crosses the first arrow. And no path exists from a
household's records to an employer, sponsor or partner, because the feature is
not built; the guarantees are written down in `/legal/sponsors` before it is.

---

## 3. Dependency security

Scanned 2026-08-27 with `npm audit --omit=dev`.

**Fixed:** Next.js 16.2.10 → **16.2.11**, clearing eleven advisories including a
Proxy/Middleware bypass in App Router (this app runs a proxy gating
`/household`, `/ledger`, `/admin`), SSRF in Server Actions, and response-body
cache confusion.

**Accepted, with reasons** — three transitives pinned by Next's own tree, none
reachable at runtime:

| Package | Why it is not exploitable here |
|---|---|
| `postcss` | Build-time only. Processes our own CSS at build; no attacker-controlled stylesheet ever reaches it. |
| `sharp` | Build-time only, used by `scripts/generate-icons.mjs`. `images: { unoptimized: true }` means Next never invokes the optimiser, and `next.config.ts` excludes `@img/**` and `sharp/**` from the standalone bundle, so it does not ship. |
| `nanoid` | The advisories require calling a generator with a negative or zero size. Nothing does, and no user input reaches a size argument. |

Forcing these to resolve requires a Next.js minor bump outside the pinned range.
That is the wrong trade immediately before a pilot: a framework bump risks the
whole app to fix three issues that cannot be triggered. **Re-audit each release,
and revisit if any of the three ever becomes runtime-reachable.**

---

## 4. Security controls: what is true today

| Control | State |
|---|---|
| TLS everywhere, HSTS | ✅ HSTS `max-age=31536000; includeSubDomains` set at the origin 2026-08-27 (not `preload` — a one-way submission, not a pilot decision) |
| Clickjacking | ✅ `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` |
| MIME sniffing, referrer leakage, feature access | ✅ `nosniff`, `strict-origin-when-cross-origin`, `Permissions-Policy` denying all but the camera |
| API responses uncacheable | ✅ `no-store` on `/api/*` |
| Password storage | ✅ Hashed by PocketBase. Never reversible, never logged |
| Database exposure | ✅ Superuser-only. Every collection has NULL API rules; the browser never holds a PocketBase token |
| Household isolation | ✅ Enforced server-side in the query, not the UI: `visibleFilter`, `redactUnshared`, and `/api/attachment` applying the same rule to bytes |
| Sharing cannot be changed by others | ✅ `/api/account/sharing` has no `memberId` parameter — no request exists that alters someone else's disclosure |
| AI keys at rest | ✅ AES-256-GCM before the database, so unreadable in a backup |
| Backups | ✅ Daily to R2, encrypted, last 14, restore tested (`deploy/test-restore.ps1`) |
| Tamper evidence | ✅ Append-only hash-chained ledger; optional public anchoring |
| Audit events | ✅ Ledger for money; `share_events` for invites, joins, departures, sharing changes and cross-member reads |
| Retention purge | ✅ Scheduled task `HoneyMoney-Purge`. **Was silently exiting** — `ACCOUNT_PURGE_SECRET` was never set, so soft-deleted households were never hard-purged. Set 2026-08-27 |
| Full CSP with nonces | ❌ Not done. Needs per-request nonces threaded through the document; a half-CSP is worse than none |
| MFA | ❌ Not offered, including for administrators. **Highest-priority gap** |
| Session revocation / device list | ❌ Not built. Sessions expire but cannot be listed or killed individually |
| Rate limiting on auth | ❌ Not built. Relies on PocketBase defaults |
| Signed DPAs, penetration test, privacy audit | ❌ None. Stated plainly in the notices rather than implied away |

---

## 5. Incident response — the short version

For an MVP this is one page, not a manual. What matters is that somebody knows
the first four steps before they are needed at 2 a.m.

1. **Contain.** Rotate `POCKETBASE_ADMIN_PASSWORD` and `AI_SECRETS_KEY`; if the
   database itself is suspect, take the DOM Cloud site down rather than leave it
   serving. Availability is the thing we already tell users not to rely on.
2. **Preserve.** Take a PocketBase backup *before* fixing anything, and copy it
   off-host. The audit ledger is hash-chained, so tampering during an incident
   is detectable — but only if the evidence survives.
3. **Assess.** Whose data, how much, and is significant harm likely? The vendor
   register above and the data-flow diagram are the map for that question.
4. **Notify.** If significant harm is likely: the Personal Data Protection
   Commissioner, and the affected users, plainly and without minimising. The
   privacy notice already promises this; the promise is the obligation.

Contact for anything on this page: **privacy@honeymoney.app**
