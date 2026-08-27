/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — per-data-type sharing, and the log that makes it checkable.
//
// Until now "private" was ONE bit on a transaction row: a personal-bucket spend
// by a named payer was hidden, everything else was household-visible. That is a
// reasonable default and a poor model, because the things a household member
// might want to keep to themselves are not all transactions. The H-Score is a
// judgement about a person. A receipt is a photograph of where they were. A
// goal is an intention they may not be ready to announce. A forecast says what
// they will not be able to afford. One boolean cannot express "share what I owe
// the household, but not what I spend it on".
//
// So sharing becomes a preference PER DATA TYPE, held per member, over their own
// data. Two collections:
//
//   sharing_prefs  — append-only. One row per (member, data type, decision).
//   share_events   — append-only. Who changed a share, who read shared detail,
//                    who joined, who left. The evidence behind the "shared with"
//                    screen and the access log.
//
// ── WHY APPEND-ONLY, AGAIN ─────────────────────────────────────────────────
//
// Same reason as `consents`: a withdrawal has to be evidence, not silence. If
// sharing were a mutable column, "I turned that off in March" would be
// unprovable the moment it was turned back on — and in the coercion scenario
// this whole feature is built for, the question of WHEN something was switched
// on, and by whom, is the entire question.
//
// ── THE ROW IS OWNED BY ITS SUBJECT ────────────────────────────────────────
//
// `member` is whose data it is, never who is allowed to see it. There is
// deliberately no grantee column and no per-recipient matrix. A household
// member shares with THE HOUSEHOLD or does not share; letting Azlan share with
// Mariam but not with Mariam's mother, who is also in the household, invites
// exactly the kind of negotiation this app exists to remove. It also means an
// owner cannot grant themselves access to someone else's data, because there is
// no field in which such a grant could be written.

migrate(
  (app) => {
    const prefs = new Collection({
      type: "base",
      name: "sharing_prefs",
      // Superuser-only, like every other collection here. Reached through
      // /api/account/sharing, which checks that the caller is the subject.
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "text", name: "tenant", required: true },
        // The MEMBER row id, not the user id: a person can belong to two
        // households and share different things with each, and their choices in
        // one must not follow them into the other.
        { type: "text", name: "member", required: true },
        { type: "text", name: "user", required: true },
        // One of lib/sharing.ts SHARE_TYPES. Stored as text rather than an
        // enum field so adding a type is a code change, not a migration —
        // an unknown type reads as "not shared", which fails closed.
        { type: "text", name: "data_type", required: true },
        { type: "bool", name: "shared" },
        // Which version of the sharing explanation they were shown. Same role
        // as consents.notice_version: a choice made under a different
        // description of what sharing means is a different choice.
        { type: "text", name: "policy_version" },
        // "settings" | "onboarding" | "exit" | "revoke_all"
        { type: "text", name: "source" },
        { type: "autodate", name: "created", onCreate: true },
      ],
      indexes: [
        "CREATE INDEX idx_sharing_member ON sharing_prefs (member, data_type, created)",
        "CREATE INDEX idx_sharing_tenant ON sharing_prefs (tenant, created)",
      ],
    });
    app.save(prefs);

    const events = new Collection({
      type: "base",
      name: "share_events",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "text", name: "tenant", required: true },
        // Whose data the event concerns.
        { type: "text", name: "subject_member" },
        // Who did the thing. Equal to subject_member for a self-service change.
        { type: "text", name: "actor_member" },
        { type: "text", name: "actor_label" },
        // share_granted | share_revoked | revoke_all | detail_viewed |
        // member_joined | member_left | member_removed | export_taken
        { type: "text", name: "kind", required: true },
        { type: "text", name: "data_type" },
        // Free text for the screen: "viewed 12 transactions", "left household".
        { type: "text", name: "detail", max: 300 },
        { type: "autodate", name: "created", onCreate: true },
      ],
      indexes: [
        "CREATE INDEX idx_share_ev_subject ON share_events (subject_member, created)",
        "CREATE INDEX idx_share_ev_tenant ON share_events (tenant, created)",
      ],
    });
    app.save(events);

    // `exclude_from_totals` on transactions.
    //
    // Separate from `visibility` on purpose, because they answer different
    // questions. Visibility is "may my partner see this row?". Exclusion is
    // "should this row be inside the number we both look at?". A household
    // usually wants a private spend to stay inside the total — the total is
    // still true, and hiding the line item is enough. But sometimes the total
    // itself is the tell: a large private purchase moves the household figure
    // by an amount that is its own disclosure. This lets the payer take it out.
    //
    // Default false: a total that quietly omits real spending is a worse
    // failure than a visible one, so opting out has to be deliberate.
    const txns = app.findCollectionByNameOrId("transactions");
    txns.fields.add(new Field({ type: "bool", name: "exclude_from_totals" }));
    app.save(txns);
  },
  (app) => {
    for (const name of ["sharing_prefs", "share_events"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {
        /* already gone */
      }
    }
    try {
      const txns = app.findCollectionByNameOrId("transactions");
      txns.fields.removeByName("exclude_from_totals");
      app.save(txns);
    } catch (_) {
      /* already gone */
    }
  },
);
