/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — record kinds, and who paid.
//
// Tasks 1 and 6 of the 2026-08-22 brief, migrated together because both change
// the Record data model and doing them apart means two migrations over the same
// rows and a reconciliation afterwards.
//
// ── THIS MIGRATION REWRITES NO DATA ────────────────────────────────────────
//
// Every field added is optional, and every existing row keeps loading exactly as
// it does today because the READ path derives the new values from the old ones
// when they are absent (lib/records.ts). That is deliberate, and it is the third
// time this pattern has earned its place today: 1751900018's data loop reported
// success and changed nothing, which would have shown every household RM0 goal
// progress. A migration that only adds columns cannot half-succeed.
//
// So there is no "migrated-default" flag written into rows. `attribution_asserted`
// is FALSE by default, and false is exactly what an unmigrated row means: nobody
// has said who paid. The brief asks that migrated attribution be marked "default,
// not user-asserted" — absence of the flag IS that mark, and it needs no write.
//
// ── THE FIELDS ─────────────────────────────────────────────────────────────
//
//   kind — inflow · outflow · transfer. THREE kinds behind the two buttons the
//     user sees. `+ Savings` is a TRANSFER, not income: money moving between two
//     places the household already owns is not the household getting richer, and
//     counting it as income would inflate every ratio built on income. Derived
//     for old rows from `direction` plus the destination bucket's tier.
//
//   paid_by — WHO PAID. Named for what it holds, per the brief's instruction not
//     to call it `persona` or `owner`. The existing `member` field stays and is
//     still read as the fallback; it was ambiguous about whether it meant the
//     payer, the beneficiary, or merely who typed the row.
//
//     🛑 THE SECOND AXIS IS A SEAM, NOT A FIELD. Attribution really has two
//     independent halves — who paid, and who benefited — and the brief permits
//     one for v1 provided the choice is deliberate. `paid_by` is that choice.
//     `benefited_by` is intentionally NOT created: an unused column invites code
//     to start writing it before anyone has decided what it means for a joint
//     grocery shop. Adding it later is one more additive migration like this one.
//
//   visibility — private · shared. The privacy stance, decided: individual
//     spending is PRIVATE BY DEFAULT and joint spending is shared, with a
//     non-hidden indicator. Absent ⇒ shared, which is what every existing row
//     already effectively is; nothing becomes newly hidden on the day this runs,
//     because retroactively hiding a partner's records from them would be its
//     own kind of betrayal.
//
//   attribution_asserted — did a human say this, or did we default it? Without
//     this, a defaulted guess is indistinguishable from a deliberate statement,
//     and "reclassifying is a user action" needs to know which it is looking at.

migrate(
  (app) => {
    const hasField = (col, name) => col.fields.some((f) => f.name === name);
    const txns = app.findCollectionByNameOrId("transactions");
    const members = app.findCollectionByNameOrId("members");

    if (!hasField(txns, "kind")) {
      txns.fields.add(
        new Field({
          type: "select",
          name: "kind",
          maxSelect: 1,
          values: ["inflow", "outflow", "transfer"],
        }),
      );
    }

    if (!hasField(txns, "paid_by")) {
      txns.fields.add(
        new Field({
          type: "relation",
          name: "paid_by",
          required: false,
          cascadeDelete: false, // a member leaving must not delete their history
          collectionId: members.id,
          maxSelect: 1,
        }),
      );
    }

    if (!hasField(txns, "visibility")) {
      txns.fields.add(
        new Field({ type: "select", name: "visibility", maxSelect: 1, values: ["private", "shared"] }),
      );
    }

    if (!hasField(txns, "attribution_asserted")) {
      txns.fields.add(new Field({ type: "bool", name: "attribution_asserted" }));
    }

    txns.indexes = [
      ...txns.indexes.filter((i) => !i.includes("idx_txn_kind") && !i.includes("idx_txn_paidby")),
      "CREATE INDEX idx_txn_kind ON transactions (tenant, kind)",
      "CREATE INDEX idx_txn_paidby ON transactions (tenant, paid_by)",
    ];

    app.save(txns);

    // Household composition — individual · couple · family. A SETTING, not a
    // per-record field: the brief is explicit that composition is context shown
    // at the top of Record, while attribution is the thing chosen per record.
    // Conflating them is what made the old persona switcher feel like a control
    // when it was really a filter.
    const tenants = app.findCollectionByNameOrId("tenants");
    if (!hasField(tenants, "composition")) {
      tenants.fields.add(
        new Field({
          type: "select",
          name: "composition",
          maxSelect: 1,
          values: ["individual", "couple", "family"],
        }),
      );
      app.save(tenants);
    }
  },
  (app) => {
    try {
      const txns = app.findCollectionByNameOrId("transactions");
      txns.indexes = txns.indexes.filter(
        (i) => !i.includes("idx_txn_kind") && !i.includes("idx_txn_paidby"),
      );
      for (const f of ["kind", "paid_by", "visibility", "attribution_asserted"]) {
        txns.fields.removeByName(f);
      }
      app.save(txns);
      const tenants = app.findCollectionByNameOrId("tenants");
      tenants.fields.removeByName("composition");
      app.save(tenants);
    } catch (_) {
      /* collection already gone */
    }
  },
);
