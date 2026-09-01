/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — a transaction can finally KEEP what was on the receipt.
//
// ── WHAT WAS BEING THROWN AWAY ─────────────────────────────────────────────
//
// The receipt reader has parsed line items since Task 6 and the dashboard has
// displayed them since Task 4, in a collapsed grey list, read-only. Then the
// form was submitted and they were gone: `lineItems` lived in React state and
// never appeared in any request body. Ten seconds after a user watched the app
// correctly read eleven rows off a supermarket till roll, the only thing the
// household owned was "Tesco, RM148.20".
//
// So the app could answer "how much did we spend at Tesco" and could not answer
// "on what" — about a receipt it had, in its hand, already read. That is a
// strange amount of work to do and then discard, and it is the reason itemised
// capture read as a demo feature rather than a ledger feature.
//
// ── THE TWO FIELDS ─────────────────────────────────────────────────────────
//
// `items` — the rows, as the household finally confirmed them. NOT as the model
// first proposed them: the user can edit a misread label, fix an amount, delete
// an invented row and add a missed one before saving, and what lands here is the
// corrected set. The proposal is a proposal; this is a record.
//
//   [ { "label": "Nasi lemak", "amount": 7.00, "qty": 2, "unitPrice": 3.50,
//       "discount": false, "bucketId": "..." }, ... ]
//
// `breakdown` — what the receipt printed between the items and the total.
//
//   { "subtotal": 10.00, "serviceCharge": 1.00, "tax": 0.66,
//     "rounding": -0.01, "total": 11.65 }
//
// Kept because it is what makes the items ADD UP. Items summing to 10.00 under a
// total of 11.65 looks like a misread until the 10% service charge and the 6%
// SST are visible, and a stored itemisation nobody can reconcile is one nobody
// will trust six months later.
//
// ── WHY JSON RATHER THAN A CHILD COLLECTION ────────────────────────────────
//
// A `transaction_items` collection would be the textbook answer and the wrong
// one here. These rows have no independent life: they are never edited after the
// fact, never queried across households, and never referenced by anything. They
// are the evidence for one transaction and they belong with it — one row read,
// one row written, and the append-only ledger in lib/ledger.ts keeps hashing one
// record rather than a record plus a variable number of children whose ordering
// would then have to be part of the hash.
//
// The household that wants item-level analysis gets it from the ledger export,
// which carries these fields verbatim.
//
// Backward-safe in both directions: every existing row reads back an empty
// `items` and a null `breakdown`, and nothing in the app requires either to be
// present. The down migration drops both columns and leaves the ledger intact.

migrate(
  (app) => {
    const hasField = (col, name) => col.fields.some((f) => f.name === name);
    const txns = app.findCollectionByNameOrId("transactions");

    // The confirmed line items. See lib/receiptSplit.ts for the arithmetic that
    // relates these to `amount`: when a household chooses one record per item,
    // each record carries the single row it came from and the SET of records
    // sums to the receipt total, service charge and tax included.
    if (!hasField(txns, "items")) {
      txns.fields.add(new Field({ type: "json", name: "items", maxSize: 60000 }));
    }

    // Subtotal / service charge / tax / rounding / total, as printed.
    if (!hasField(txns, "breakdown")) {
      txns.fields.add(new Field({ type: "json", name: "breakdown", maxSize: 2000 }));
    }

    app.save(txns);
  },
  (app) => {
    try {
      const txns = app.findCollectionByNameOrId("transactions");
      txns.fields.removeByName("items");
      txns.fields.removeByName("breakdown");
      app.save(txns);
    } catch (_) {
      /* collection already gone */
    }
  },
);
