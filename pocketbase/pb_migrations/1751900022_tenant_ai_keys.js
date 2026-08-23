/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — a household's own AI key, so Ask Honey works without an admin.
//
// Until now the AI engine was chosen by environment variables the server owner
// sets. That is right for a self-hosted household where the owner IS the admin,
// and wrong for everyone else: a signed-up user could see /setup say "AI engine:
// gemini" and still have no way to make Honey answer, because the key belonged
// to whoever ran the process.
//
// ⚠️ THIS COLLECTION HOLDS A THIRD-PARTY CREDENTIAL, and that is the whole
// reason for the shape below.
//
//   • `key_cipher`, never `key`. The value is AES-256-GCM ciphertext produced by
//     web/src/lib/aiKeys.ts under AI_SECRETS_KEY. PocketBase's own settings
//     encryption covers the settings block in data.db — it does NOT extend to
//     collection fields, so a plain `text` field here would put a live billable
//     key in every backup zip, in plaintext, next to the household's ledger.
//     The app encrypts before it ever reaches PocketBase.
//
//   • `key_last4` exists so the UI can show which key is stored without ever
//     decrypting one to render a page. Displaying a key is not a feature.
//
//   • No API rules at all, which in PocketBase means superuser-only. The browser
//     never queries this, exactly like the rest of the schema. The only reader
//     is the server, at the moment it makes an AI call.
//
//   • One row per tenant, enforced by a unique index rather than by convention.
//     Two rows for one household is a silent "which key are we billing?" bug.
//
// AI_SECRETS_KEY IS NOW LOAD-BEARING, the same way deploy/.pb-encryption-key is:
// a backup restored onto a host that lacks it will restore these rows and be
// unable to read any of them. Unlike the PocketBase key, that fails softly —
// households fall back to the server's env-var engine — but their saved key is
// gone. Carry it across with the data.

migrate(
  (app) => {
    const keys = new Collection({
      type: "base",
      name: "tenant_ai_keys",
      fields: [
        { type: "text", name: "tenant", required: true },
        { type: "select", name: "provider", maxSelect: 1, values: ["gemini", "groq", "ollama"] },
        { type: "text", name: "model" },
        // Ollama is a URL, not a key — a household pointing at a machine on its
        // own network stores no credential at all. Kept in the same row because
        // "which engine does this household use" is one answer, not two.
        { type: "text", name: "url" },
        { type: "text", name: "key_cipher" },
        { type: "text", name: "key_last4" },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_tenant_ai_keys_tenant ON tenant_ai_keys (tenant)"],
    });
    app.save(keys);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("tenant_ai_keys"));
    } catch (_) {
      /* already gone */
    }
  },
);
