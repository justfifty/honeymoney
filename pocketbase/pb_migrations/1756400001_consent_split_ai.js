/// <reference path="../pb_data/types.d.ts" />

// Split the single `ai_processing` consent into two, at the database level.
//
// WHY THIS MIGRATION EXISTS AT ALL. `purpose` is a select field with a fixed
// value list (1751900023_consents.js), and PocketBase enforces it: writing
// "ai_phrasing" against the original list fails with validation_invalid_val.
// So the application-side split is inert until this runs — the checkbox renders,
// the user ticks it, and the write is rejected. Consent that cannot be recorded
// is worse than a coarse consent, because the UI claims an answer was saved.
//
// WHAT THE TWO PURPOSES MEAN, and why one switch was wrong:
//
//   ai_phrasing   A model may word an answer. On a cloud engine it receives slot
//                 NAMES and a locale — "{saving}", "{gap}", "en" — and never a
//                 figure, a label, a merchant or the question. Nothing about the
//                 household leaves.
//   ai_documents  A receipt photo or a bank statement the household chose to
//                 scan may be uploaded to an outside AI service. This is the
//                 household's own data, leaving.
//
// One switch made both of those the same decision, so a household that wanted a
// warmer sentence had to authorise uploading its receipts, and one that refused
// lost phrasing too — for a call that discloses nothing. PDPA consent is
// purpose-limited; a purpose broad enough to cover both is not specific.
//
// ⚠️ NO BACKFILL, AND THAT IS THE POINT. It is tempting to write an
// ai_documents=true row for everyone who once granted ai_processing. That would
// manufacture the most consequential permission in the app out of the vaguest
// wording it ever used ("Let Honey use AI"). Existing grants are instead read
// FORWARD in lib/aiGuard.ts: an old ai_processing grant satisfies ai_phrasing,
// and never ai_documents. Households who want document scanning tick a box that
// says what it does.
//
// ai_processing stays in the value list because the ledger is append-only and
// its old rows must remain readable and valid. It is absent from PURPOSES in
// lib/consent.ts, so nothing can write it again.

migrate(
  (app) => {
    const consents = app.findCollectionByNameOrId("consents");
    const field = consents.fields.getByName("purpose");
    if (!field) throw new Error("consents.purpose not found — schema drifted");

    for (const v of ["ai_phrasing", "ai_documents"]) {
      if (!field.values.includes(v)) field.values.push(v);
    }
    app.save(consents);
  },
  (app) => {
    // Down: drop the two new values again. Any rows already written with them
    // are left alone — deleting consent records to satisfy a schema rollback
    // would destroy the evidence the ledger exists to hold.
    const consents = app.findCollectionByNameOrId("consents");
    const field = consents.fields.getByName("purpose");
    if (!field) return;
    field.values = field.values.filter((v) => v !== "ai_phrasing" && v !== "ai_documents");
    app.save(consents);
  },
);
