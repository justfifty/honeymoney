/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — the consent record, and why it is append-only.
//
// Malaysia's PDPA does not just require consent; it requires that we can SHOW
// consent, per purpose, at the time processing happened. A boolean column on
// app_users cannot do that. `marketing_ok = false` answers "may we email them
// today" and is silent on the two questions a regulator actually asks: what
// were they told when they agreed, and when did they take it back.
//
// So this collection is a LEDGER, not a settings row. Every grant and every
// withdrawal appends. Nothing is ever updated in place, nothing is deleted.
// Current state = the newest row for (user, purpose). That makes withdrawal
// first-class evidence rather than the absence of evidence, which matters
// because s.43 of the PDPA gives a data subject a standing right to stop
// processing for direct marketing — and the burden of proving we honoured it
// on the day they asked is ours.
//
// `notice_version` is the load-bearing field. Consent is only valid for the
// purposes the person was actually shown, so a consent record that cannot name
// the notice it was given under is worth very little. When docs/PRIVACY.md
// changes materially, NOTICE_VERSION in web/src/lib/consent.ts changes with it,
// and every consent granted under the old text is visibly historical rather
// than silently assumed to cover the new one.
//
// PURPOSES, and why they are separate rows rather than one flag:
//
//   • core_processing — record and score the household's own money. Withdrawing
//     it means the product cannot function, so the UI treats it as a condition
//     of having an account rather than a checkbox to tease apart.
//
//   • ai_processing — send text to a third-party model (Ask Honey, receipt OCR).
//     Separate because it is the only purpose that moves data to a processor
//     outside our control, and a household can want the app without it.
//
//   • partner_offers — disclose a spending TIER to a licensed financial partner.
//     This is the one the business model wants and the one that must never be
//     bundled. Default OFF. Meta was fined EUR 390m for folding exactly this
//     kind of purpose into the general terms as "contractual necessity"; the
//     lesson is not to be more careful with the wording, it is to ask.
//
//   • research_aggregate — include the household in irreversibly aggregated
//     statistics. Kept askable even though truly anonymous aggregates fall
//     outside the PDPA, because "we asked anyway" costs nothing and the line
//     between aggregate and re-identifiable is thinner than it looks.
//
// No API rules, so superuser-only, like the rest of the schema: the browser
// never reads this collection directly. The server writes it at signup and from
// /api/account/consent, and reads it before any purpose-limited processing.

migrate(
  (app) => {
    const consents = new Collection({
      type: "base",
      name: "consents",
      fields: [
        { type: "text", name: "user", required: true },
        // Denormalised from the user's membership so a household-scoped audit
        // ("show me what this household agreed to") does not need a join
        // through members, which is itself mutable.
        { type: "text", name: "tenant" },
        {
          type: "select",
          name: "purpose",
          maxSelect: 1,
          required: true,
          values: ["core_processing", "ai_processing", "partner_offers", "research_aggregate"],
        },
        // The answer. False is a real, recorded event — a withdrawal — not the
        // absence of a row.
        { type: "bool", name: "granted" },
        { type: "text", name: "notice_version", required: true },
        // Where the answer came from, so a support question about "I never
        // agreed to this" has somewhere to start.
        { type: "select", name: "source", maxSelect: 1, values: ["signup", "settings", "withdrawal", "import"] },
        { type: "autodate", name: "created", onCreate: true },
      ],
      // (user, purpose, created) because every read is "newest row for this
      // person and purpose" and every audit is "everything this person ever
      // answered". Deliberately NOT unique: uniqueness would defeat the ledger.
      indexes: [
        "CREATE INDEX idx_consents_user_purpose ON consents (user, purpose, created)",
        "CREATE INDEX idx_consents_tenant ON consents (tenant)",
      ],
    });
    app.save(consents);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("consents"));
  },
);
