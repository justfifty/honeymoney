/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — the agreements ledger.
//
// Separate from `consents` on purpose. A consent is withdrawable and the
// settings screen renders a toggle for every one of them; agreement to the
// terms of a service is not withdrawable while you keep using it. Sharing the
// collection would have put a switch on that screen which either does nothing
// or signs you out, and neither is what a privacy control should mean.
//
// Append-only, like consents: two acceptances are two rows. The question during
// any dispute is "what had this person agreed to ON THE DAY", and an updated
// row cannot answer it.

migrate(
  (app) => {
    const c = new Collection({
      type: "base",
      name: "agreements",
      // Superuser-only, like the rest of the schema. Nothing here is written
      // from a browser; the signup route records it server-side.
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "text", name: "user", required: true },
        { type: "text", name: "doc", required: true },      // "terms"
        { type: "text", name: "version", required: true },  // e.g. "2026-08-26"
        { type: "text", name: "source" },                   // signup | settings | reprompt
        { type: "autodate", name: "created", onCreate: true },
      ],
      indexes: [
        "CREATE INDEX idx_agreements_user ON agreements (user, doc, created)",
      ],
    });
    app.save(c);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("agreements"));
    } catch (_) {
      /* already gone */
    }
  },
);
