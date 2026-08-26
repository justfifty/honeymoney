# Zero-knowledge — the line, drawn exactly

**Status:** live as of 2026-08-27 · **Enforced by:** `web/src/lib/e2ee.ts`, `web/src/lib/vault.ts` ·
**Checked by:** `npm run check:vault`

JUST50 sells HoneyMoney as **software**, not as a place to keep your money records. This
document says what that means technically, what it does not mean, and where the boundary
actually sits — because a privacy claim that cannot be located in a file is a slogan.

It is written to be read by someone hostile to it: a judge, a bank's due-diligence team, a
data-protection officer, or a user who has been lied to before.

---

## 1. The one-sentence version

**Anything that leaves your device as a backup is sealed with a key your device never sends.**
We store ciphertext. We hold no key, no key hash, and no recovery copy. If you forget the
passphrase, we cannot help you, and that is the design working rather than failing.

## 2. What is zero-knowledge today, and what is not

Being precise here matters more than sounding good. The app computes an H-Score, a projection
and a bucket plan on the server, and it cannot do that over ciphertext. So:

| | Where it lives | Can the operator read it? |
|---|---|---|
| **Sealed backups** (`vaults`) | ciphertext, in the database | **No.** AES-256-GCM, key derived on your device |
| Live household records | the app's database, in the clear | Yes — the server computes over them |
| AI cloud path | slot names, an intent, a locale | Nothing to read: no figures, no labels, no free text |
| AI local path | never leaves the machine | N/A |
| Passwords | Argon2-hashed by PocketBase | No |
| Household AI keys | encrypted at rest | No |
| Operator backups (R2) | AES-256-GCM, operator key | Not by the host; yes by us — that is the difference |

The fourth row is the one people conflate with the first. `deploy/backup-vault.mjs` encrypts the
operator's own nightly backups so that **Cloudflare** cannot read them. The vault in this
document encrypts a household's backup so that **we** cannot. Same cipher, opposite threat model,
and only the second one is zero-knowledge.

**So HoneyMoney is not an end-to-end encrypted ledger.** Claiming otherwise would be false, and
the false version is easy to spot: an app that computes a savings rate on a server has read the
savings. What is true is narrower and still worth paying for — see §5.

## 3. What we store for a sealed backup

Everything, listed, so nothing has to be discovered:

- `envelope` — the sealed blob: format, cipher name, KDF name, iteration count, salt, IV,
  ciphertext, and the timestamp it was sealed at. The salt and IV are public parameters; they are
  useless without the passphrase.
- `bytes` — its size.
- `sealed_at` — when.
- `label` — whatever you typed, **in the clear**, and the field says so where you type it.
- `tenant` / `user` — whose it is.

Deliberately **not** stored: any passphrase, any hash of one, any verifier, any key, any key
fingerprint, and any plaintext summary. A row reading `transactions: 412, income: RM6,000` would
leak the exact shape of what the encryption exists to hide, so the count you see after opening a
backup is computed in your browser and never sent.

## 4. The mechanism

```
your records ──▶ /api/account/export ──▶ [ your browser ]
                  (what YOU may see,         gzip
                   not the household's)      PBKDF2-HMAC-SHA256, 600,000 rounds, 16-byte salt
                                             AES-256-GCM, 12-byte IV
                                             envelope parameters bound as AAD
                                             ── seal, then OPEN IT AGAIN to verify ──
                                                        │
                                          ┌─────────────┴─────────────┐
                                          ▼                           ▼
                                   download .hmvault            POST /api/account/vault
                                   (we are not involved)        (we store the ciphertext)
```

Four decisions worth defending:

1. **PBKDF2, not Argon2id.** Argon2id is the better KDF and is not in WebCrypto, so shipping it
   means shipping a WASM blob to the one screen whose entire claim is that nothing needs to be
   trusted. PBKDF2-HMAC-SHA256 at 600,000 rounds meets the current OWASP floor and is auditable
   from the browser's own devtools. The iteration count travels inside the envelope, so raising
   it later strands no existing backup.
2. **The envelope's parameters are authenticated.** Without that, anyone who can edit the stored
   row can drop the iteration count to 1 and hand the file back, and a client that trusts the
   envelope derives the weakened key itself. Bound as AAD, that edit makes it refuse to open.
   `npm run check:vault` performs exactly this downgrade and asserts the refusal.
3. **Every seal is verified by opening it.** An encrypted backup you cannot decrypt is not a
   backup, it is a tidy way to lose everything. The round trip costs one extra key derivation on
   your own device; the alternative is discovering the problem on the day you need the file.
4. **The export is viewer-scoped.** A sealed backup contains what *you* may see, not what the
   household contains — the same `visibleFilter` that redacts a partner's private records on
   screen redacts them here. One boundary, enforced once.

## 5. What the customer is actually buying

> Your records stay yours. The backup we keep for you is one we cannot open — not for support,
> not under subpoena, not by mistake. We make money from the software, not from what is in it.

That sentence survives scrutiny because of §2's honesty, not despite it. We are not claiming to
be blind to the live ledger; we are claiming that the copy we *keep* is sealed, that we never
sell or mine anything, and that the one artefact most likely to outlive the relationship — a
backup sitting in a bucket for years — is inert without the customer.

It also removes an asset class from the balance sheet on purpose. A future acquirer, a future
CEO with a growth target, or a future subpoena finds ciphertext. Business models that depend on
household financial data cannot be bolted onto this later without shipping a visibly different
product, and that is the point of putting it in the schema rather than the terms.

## 6. Ways this could still fail you

Stated because a threat model that lists only its wins is marketing:

- **Your device.** The plaintext exists in your browser while you seal it. A compromised device
  or a hostile extension sees it. Nothing server-side can fix that.
- **A weak passphrase.** 600,000 rounds raises the cost of guessing; it does not make `password`
  safe. The UI refuses below roughly 60 bits and says why.
- **Us shipping malicious JavaScript.** The seal happens in code we serve. A future build could
  exfiltrate the passphrase, and no amount of cryptography inside that build would tell you. The
  honest mitigations are that the source is auditable, `npm run check:vault` runs the same code
  path outside the browser, and the network tab shows what is sent. Independent verification of
  the delivered bundle (SRI, reproducible builds, a signed release) is **not built yet** — see
  NEXT.md.
- **Losing the passphrase.** Unrecoverable, permanently, by design.
- **Metadata.** We know a backup exists, how big it is, when it was made, and what you labelled
  it. For most households that is uninteresting; it is not nothing, and it is listed in §3
  rather than buried.

## 7. How to check any of this yourself

```bash
npm run check:vault      # 33 assertions: no plaintext survives, wrong passphrase fails,
                         # downgrade and bit-flip refuse, the server rejects plaintext
```

Then, in the app: open **Setup → Sealed backup**, watch the network tab while you seal one, and
search the request body for your own vendor names. Then edit one character of the downloaded
`.hmvault` file and try to open it.
