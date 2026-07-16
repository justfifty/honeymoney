/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — first-class credit/debit on transactions.
//
// Until now every transaction was implicitly money OUT (a spend); income lived
// only as income_source nodes. But a refund, a cashback, a salary credit or a
// bank-statement payment is money IN, and records/projections should treat it as
// such. Add an explicit `direction` — "out" (debit, the default) or "in" (credit)
// — so an inflow no longer counts as spend and the ledger reads correctly.
//
// Backward-safe: existing rows have an empty direction, which the code treats as
// "out", so no historical figure changes.

migrate(
  (app) => {
    const hasField = (col, name) => col.fields.some((f) => f.name === name);
    const txns = app.findCollectionByNameOrId("transactions");
    if (!hasField(txns, "direction")) {
      txns.fields.add(
        new Field({ type: "select", name: "direction", maxSelect: 1, values: ["out", "in"] }),
      );
    }
    app.save(txns);
  },
  (app) => {
    try {
      const txns = app.findCollectionByNameOrId("transactions");
      txns.fields.removeByName("direction");
      app.save(txns);
    } catch (_) {
      /* collection already gone */
    }
  },
);
