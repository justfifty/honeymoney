/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — pending_captures: a capture that has been READ but not COMMITTED.
//
// The Telegram bot used to write a spend straight into the books the instant it
// finished OCR'ing a photo, then say "Reply 'no' if that's wrong" — and nothing
// on earth handled the reply. So a misread receipt, or the same receipt sent
// twice, silently became a real transaction the household had to find and fix
// later.
//
// Now: when the arithmetic duplicate check says a payment is already recorded,
// the bot does NOT save it. It parks the parsed capture here and asks. The row
// lives only until the user taps "Save anyway" or "Skip", at which point it is
// deleted — this is a waiting room, not a second ledger.
//
// API rules stay null (superuser-only); the Next.js server mediates access.

migrate(
  (app) => {
    const tenants = app.findCollectionByNameOrId("tenants");

    const c = new Collection({
      type: "base",
      name: "pending_captures",
      fields: [
        {
          type: "relation",
          name: "tenant",
          required: true,
          cascadeDelete: true,
          collectionId: tenants.id,
          maxSelect: 1,
        },
        { type: "text", name: "channel", required: true, max: 20 }, // "telegram"
        { type: "text", name: "external_id", required: true, max: 64 }, // chat id
        { type: "json", name: "payload", required: true, maxSize: 200000 },
        { type: "text", name: "reason", max: 300 }, // why it wasn't auto-saved
        { type: "autodate", name: "created", onCreate: true },
      ],
      indexes: [
        "CREATE INDEX idx_pending_tenant ON pending_captures (tenant)",
        "CREATE INDEX idx_pending_created ON pending_captures (created)",
      ],
    });

    app.save(c);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("pending_captures"));
    } catch (_) {
      /* already gone */
    }
  },
);
