# honeymoney.app email — setup runbook

Three addresses, all forwarding into `justfifty1976@gmail.com`, all able to send
**as themselves** from that same Gmail:

- `hello@honeymoney.app` — the public contact address (deck, landing page, judges)
- `kw.chua@honeymoney.app`
- `ww.pong@honeymoney.app`

Cost: **$0**.

---

## Part 1 — Receiving ✅ DONE (2026-07-14)

Cloudflare Email Routing is live. Verified resolving on the public internet:

| Record | Value |
|---|---|
| MX | `route1.mx.cloudflare.net` (1), `route3...` (25), `route2...` (38) |
| SPF | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| DKIM | `cf2024-1._domainkey` (Cloudflare's own, for forwarding) |

Destination `justfifty1976@gmail.com` is **verified**. Catch-all is set to **Drop**
(mail to a made-up address is discarded rather than forwarded) — that's correct,
leave it.

**Cloudflare Email Routing cannot send.** It is a forwarder, not a mailbox. That
is the entire reason Part 2 exists.

---

## Part 2 — Sending, via Brevo SMTP (free, 300/day)

```
  inbound:   judge@example.com ──► MX: Cloudflare ──► justfifty1976@gmail.com
  outbound:  reply in Gmail ──► SMTP: Brevo ──► judge sees "hello@honeymoney.app"
```

### 2.1 Brevo account + domain authentication

1. Sign up at **brevo.com** using `justfifty1976@gmail.com`.
2. Go to **Senders, Domains & Dedicated IPs → Domains → Add a domain** →
   `honeymoney.app`.

   Authenticate the **domain**, not individual senders. Domain-level
   authentication lets you send as *any* address at honeymoney.app — so one
   setup covers all three addresses. Verifying senders one at a time does not.

3. Brevo shows a set of DNS records — typically a `brevo-code:…` TXT for
   ownership plus DKIM records. **Copy them into Cloudflare DNS exactly as
   shown.** If any is a CNAME, set it to **DNS only (grey cloud)**, never
   proxied.

   DKIM is what keeps your mail out of judges' spam folders. Don't skip it.

### 2.2 SPF — leave it alone

Counter-intuitive, but correct: **do not touch SPF.** Brevo authenticates via
**DKIM**, not SPF — note that its setup page never asks for an SPF record. Its
DKIM CNAMEs sign your mail as `honeymoney.app`, and that alignment is what
satisfies DMARC.

So the existing record stays exactly as Cloudflare wrote it:

```text
v=spf1 include:_spf.mx.cloudflare.net ~all
```

(If you ever *do* add an SPF include, remember a domain may have only **one** SPF
TXT record — two makes both invalid and sends your mail to spam.)

### 2.3 Turn OFF Brevo's SMTP IP blocking ⚠️ (the one that will waste your day)

**Brevo ships with IP blocking ON for SMTP keys and an EMPTY authorized-IP list,
which blocks every IP on earth.** Authentication succeeds and then the server
rejects you anyway:

```
S: 235 ... no. What you actually get is:
S: 525 5.7.1 Unauthorized IP address
```

Gmail relays through Google's mail servers, whose IPs are numerous, undocumented
and constantly changing — **you cannot allowlist them.** Blocking must be OFF, not
extended.

**Settings → Security → Authorized IPs** → in the "Blocking unauthorized IP
addresses" panel, click **"Deactivate for SMTP keys"** so it reads:

```
SMTP keys  * Deactivated
```

Do NOT instead add your own IP to the authorized list. That lets your own machine
send and still leaves Gmail blocked, which is useless — sending *from Gmail* is
the whole point.

### 2.4 Get the SMTP key

Brevo → **SMTP & API → SMTP** tab. Note:

- Server: `smtp-relay.brevo.com`
- Port: `587` (TLS — not SSL)
- Login: your Brevo SMTP login
- Password: generate an **SMTP key**

> The SMTP key is a password. Password manager only. Never paste it into a chat,
> a commit, or a screenshot.

### 2.5 Gmail — add all three identities

Gmail → ⚙ **Settings → Accounts and Import → Send mail as → Add another email
address**. Do this **three times**:

| Name | Email |
|---|---|
| HoneyMoney | `hello@honeymoney.app` |
| KW Chua | `kw.chua@honeymoney.app` |
| WW Pong | `ww.pong@honeymoney.app` |

For each: leave **Treat as an alias** ticked → Next → SMTP server
`smtp-relay.brevo.com`, port `587`, your Brevo login + SMTP key, **TLS**.

Gmail emails a confirmation code to each address. Those codes arrive in your
Gmail **because Part 1 is done** — that's why receiving had to come first. Enter
each code.

Finally, set *"Reply from the same address the message was sent to"* so a reply
to `hello@` automatically goes out as `hello@`.

### 2.6 DMARC (once mail is flowing)

Cloudflare DNS → add TXT:

| Name | Content |
|---|---|
| `_dmarc` | `v=DMARC1; p=none; rua=mailto:hello@honeymoney.app` |

Start at `p=none` (monitor only). Tighten to `p=quarantine` later, once you've
confirmed nothing legitimate is failing.

---

## Verifying

Ask Claude to re-check DNS. It should show:

- **MX** → the three `route*.mx.cloudflare.net`
- **SPF** → exactly **one** TXT containing both `_spf.mx.cloudflare.net` **and**
  `spf.brevo.com`
- **DKIM** → both `cf2024-1._domainkey` (Cloudflare) and Brevo's selector resolve
- **DMARC** → `_dmarc.honeymoney.app` resolves

End-to-end, from an account that is **not** this Gmail:

1. Email `hello@honeymoney.app` → must land in the Gmail inbox (not spam).
2. Reply from Gmail, with **hello@honeymoney.app** picked in the From dropdown.
3. The outside account must see the reply **from hello@honeymoney.app**, in the
   inbox, not spam.

Repeat step 2–3 once for `kw.chua@` to confirm the other identities send too.

---

## Notes / gotchas

- **Brevo is a transactional-email product.** Using it as a personal SMTP relay
  for Gmail works and is common, but the free tier involves an account review and
  they occasionally suspend accounts that look like personal mail. If it ever
  gets blocked, the robust fallback is **Google Workspace (~$6/user/month)** —
  real mailboxes, native Gmail sending, no SMTP relay, no SPF merge.
- KW and WW can *receive* immediately. They only need their own "Send mail as"
  setup if they want to reply from their **own** Gmail accounts rather than
  having you send on their behalf.
- All three addresses land in one inbox, so use Gmail filters on **To:**
  (e.g. `to:kw.chua@honeymoney.app` → label) to keep them separate.
- Then: put `hello@honeymoney.app` on the landing page, pitch deck and project
  summary. Cheap credibility with judges.
