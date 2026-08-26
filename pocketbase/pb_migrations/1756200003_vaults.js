/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — the sealed vault: the one collection the operator cannot read.
//
// Every other table here holds household records in the clear, because the
// server computes an H-Score and a projection over them. This one is different
// by construction: `ct` is AES-256-GCM ciphertext sealed in the user's browser
// with a key derived from a passphrase that is never transmitted, and `salt`
// and `iterations` are the public parameters needed to derive that key again on
// a device that has the passphrase. Nothing stored here helps us open it.
//
// ── WHAT IS DELIBERATELY *NOT* STORED ──────────────────────────────────────
//
//   • no passphrase, no hash of one, no "verifier" — a hash would be an offline
//     cracking target sitting next to the ciphertext it opens
//   • no key, no key fingerprint, no recovery copy
//   • no plaintext summary, no record count, no totals — a "helpful" row saying
//     `transactions: 412, income: RM6,000` would leak the shape of exactly what
//     the encryption exists to hide
//
// What IS stored in the clear is metadata the user chose or that cannot be
// avoided: a label they typed, the byte size, and when it was sealed. That is
// stated in docs/ZERO_KNOWLEDGE.md rather than left for someone to discover.
//
// Scoped to the USER, not the household. /api/account/export already exports
// what the VIEWER may see rather than what the household contains — a partner's
// private records are not in it — so a vault belongs to whoever sealed it. Two
// people in one household have two vaults, and neither can open the other's,
// which is the same boundary the record list draws, kept in the same place.

migrate(
  (app) => {
    const c = new Collection({
      type: "base",
      name: "vaults",
      // Superuser-only, like every other collection. The browser reaches this
      // through /api/vault, which authenticates the caller and scopes the query
      // — a browser-writable rule would let one account list another's blobs.
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "text", name: "tenant", required: true },
        { type: "text", name: "user", required: true },
        // The user's own words: "before the September reset". Plaintext, and
        // the UI says so where they type it.
        { type: "text", name: "label", max: 120 },
        { type: "text", name: "format", required: true }, // honeymoney.vault.v1
        // The sealed envelope, verbatim, as JSON. Kept whole rather than split
        // into columns so that what is stored is byte-for-byte what the browser
        // sealed and what it will later be handed back to open — a reassembled
        // envelope is a new envelope, and its AAD would no longer match.
        { type: "text", name: "envelope", required: true, max: 12000000 },
        { type: "number", name: "bytes" },
        { type: "text", name: "sealed_at" },
        { type: "autodate", name: "created", onCreate: true },
      ],
      indexes: ["CREATE INDEX idx_vaults_owner ON vaults (user, created)"],
    });
    app.save(c);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("vaults"));
    } catch (_) {
      /* already gone */
    }
  },
);
