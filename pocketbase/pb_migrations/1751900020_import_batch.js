/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — an import you can take back.
//
// Task 10: "`import_batch_id` on every record, plus one-action rollback of the
// whole batch. Cheap now; the difference between a recoverable mistake and a
// support conversation."
//
// The failure this prevents is specific and nasty: a user imports 400 rows with
// the wrong column mapping, or the wrong attribution, and every one of them is
// now a real transaction mixed in with months of correct ones. Without a batch
// id there is nothing to select on — unpicking it means finding 400 rows by eye.
//
// Rollback VOIDS rather than deletes, in keeping with the ledger's whole
// premise: records can be changed, but every change is recorded. A batch that
// vanished without trace would be the one operation in the app that could
// quietly remove money from history.
//
// Schema only. The lesson from 1751900018 is that a JSVM data backfill can
// report success and change nothing, so anything needing a data pass is done in
// application code where its result can be read back.

migrate(
  (app) => {
    const hasField = (col, name) => col.fields.some((f) => f.name === name);
    const txns = app.findCollectionByNameOrId("transactions");

    if (!hasField(txns, "import_batch")) {
      // Text, not a relation: a batch is not a first-class entity with its own
      // lifecycle, and a batches collection would need its own rules, its own
      // cascade behaviour and its own cleanup for no gain. The id is generated
      // at import time and is only ever used to select rows.
      txns.fields.add(new Field({ type: "text", name: "import_batch", max: 40 }));
    }

    if (!hasField(txns, "import_key")) {
      // The stable content key (date | amount | direction | normalised
      // description). Stored so a LATER import can detect an overlap against
      // rows already committed — recomputing it from stored fields would work
      // until the description was edited, at which point the same payment
      // would import again as a new one.
      txns.fields.add(new Field({ type: "text", name: "import_key", max: 120 }));
    }

    txns.indexes = [
      ...txns.indexes.filter((i) => !i.includes("idx_txn_import")),
      "CREATE INDEX idx_txn_import_batch ON transactions (tenant, import_batch)",
      "CREATE INDEX idx_txn_import_key ON transactions (tenant, import_key)",
    ];

    app.save(txns);
  },
  (app) => {
    try {
      const txns = app.findCollectionByNameOrId("transactions");
      txns.indexes = txns.indexes.filter((i) => !i.includes("idx_txn_import"));
      txns.fields.removeByName("import_batch");
      txns.fields.removeByName("import_key");
      app.save(txns);
    } catch (_) {
      /* collection already gone */
    }
  },
);
