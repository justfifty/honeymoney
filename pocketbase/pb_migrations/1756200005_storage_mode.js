/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney -- where a household's records are allowed to live.
//
// Until now the answer was "our server", with no way to say otherwise. The
// product describes itself as local-first and cloud-optional; the first half
// was true of receipt capture and the second half was not true at all, because
// there was no switch and nothing that would have honoured one.
//
// This is the switch, and it is stored the way every other consequential choice
// in this schema is stored: append-only, one row per decision, newest wins.
//
// ── WHY A COLLECTION AND NOT A COLUMN ON `tenants` ─────────────────────────
//
// A column answers "what mode is this household in?". The question that
// actually gets asked is "when did they choose local-only, what were they told
// at the time, and did we actually delete what we said we would?". A mutable
// column cannot answer any of that, and this is the one setting where the user
// is trusting us to have destroyed something.
//
// `purged_at` and `purged_records` are the receipt. A local_only row with no
// purge recorded means the switch was made and the deletion did not happen --
// which is the failure this whole feature would be worthless without detecting.
//
// ── THE MODES ──────────────────────────────────────────────────────────────
//
//   cloud       (default) records live in this database. Everything works:
//               household sharing, the H-Score, multi-device, Ask Honey.
//   local_only  records live on the household's own device and in the file
//               they chose. This database holds their account and nothing
//               else. Enforced server-side in /api/transactions, not merely
//               respected by the UI -- a mode the server would happily write
//               through is a preference, not a guarantee.
//
// Absence means `cloud`. Every existing household is unaffected, which is the
// only safe default: silently moving somebody to local-only would delete their
// records to honour a choice they never made.

migrate(
  (app) => {
    const c = new Collection({
      type: "base",
      name: "storage_modes",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "text", name: "tenant", required: true },
        // The member who chose. A household is one storage mode -- it cannot be
        // half local -- so this records WHO decided rather than scoping the
        // decision to them.
        { type: "text", name: "member" },
        { type: "text", name: "user" },
        // "cloud" | "local_only". Text, not an enum: an unrecognised value must
        // read as `cloud`, which fails safe by keeping data rather than by
        // deleting it.
        { type: "text", name: "mode", required: true },
        // Which version of the trade-off explanation they were shown. Choosing
        // local-only under a description that did not mention losing the
        // H-Score is a different choice from choosing it under one that did.
        { type: "text", name: "policy_version" },
        // The receipt. Set only when a switch to local_only actually purged.
        { type: "text", name: "purged_at" },
        { type: "number", name: "purged_records" },
        // Proof the household had a current copy BEFORE we deleted anything.
        // Recorded from the client's own vault metadata, because deleting
        // somebody's only copy to honour a privacy preference would be the
        // worst possible way to fail at privacy.
        { type: "text", name: "local_copy_at" },
        { type: "number", name: "local_copy_records" },
        { type: "autodate", name: "created", onCreate: true },
      ],
      indexes: [
        "CREATE INDEX idx_storage_mode_tenant ON storage_modes (tenant, created)",
      ],
    });
    app.save(c);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("storage_modes"));
    } catch (_) {
      /* already gone */
    }
  },
);
