/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — account/household soft-delete.
//
// "Delete my account" must be reversible for a grace period (accidental taps,
// second thoughts) yet end in real erasure (Play Store / GDPR right-to-be-
// forgotten). So deletion is two-phase:
//
//   1. Soft-delete — stamp the household's `deleted_at`. The owner is signed
//      out and the app shows a "scheduled for deletion" state, but nothing is
//      actually gone. Signing back in within the window offers Restore.
//   2. Hard purge — a scheduled sweep deletes households whose `deleted_at` is
//      older than the grace window (see lib/account.ts DELETE_GRACE_DAYS). The
//      tenant relation cascades (members/nodes/edges/transactions/…); the
//      immutable ledger (cascadeDelete:false) is removed explicitly there, so a
//      user's financial record is genuinely erased on final deletion.
//
// `deleted_by` records which account requested it (audit), null once restored.

migrate(
  (app) => {
    const hasField = (col, name) => col.fields.some((f) => f.name === name);
    const tenants = app.findCollectionByNameOrId("tenants");
    const users = app.findCollectionByNameOrId("app_users");

    if (!hasField(tenants, "deleted_at")) {
      tenants.fields.add(new Field({ type: "date", name: "deleted_at" }));
    }
    if (!hasField(tenants, "deleted_by")) {
      tenants.fields.add(
        new Field({ type: "relation", name: "deleted_by", maxSelect: 1, collectionId: users.id }),
      );
    }
    tenants.indexes = [
      ...(tenants.indexes || []).filter((ix) => !ix.includes("idx_tenants_deleted_at")),
      "CREATE INDEX idx_tenants_deleted_at ON tenants (deleted_at)",
    ];
    app.save(tenants);
  },
  (app) => {
    try {
      const tenants = app.findCollectionByNameOrId("tenants");
      tenants.fields.removeByName("deleted_at");
      tenants.fields.removeByName("deleted_by");
      tenants.indexes = (tenants.indexes || []).filter((ix) => !ix.includes("idx_tenants_deleted_at"));
      app.save(tenants);
    } catch (_) {
      /* collection already gone */
    }
  },
);
