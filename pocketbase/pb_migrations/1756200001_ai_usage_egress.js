/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — turn the AI token ledger into an EGRESS ledger.
//
// 1751900008_ai_usage.js records what each call COST. That answers "how much
// are we spending on AI" and cannot answer the question an access request or a
// breach assessment actually opens with: what personal data left this
// household, when, and to whom.
//
// Minimisation is a mitigating factor only where it can be evidenced. These
// three fields are that evidence:
//
//   data_class   0 = nothing from any household · 1 = de-identified (slot names
//                only) · 2 = household data. Set at the call site and enforced
//                in lib/aiGuard.ts, not inferred here.
//   local        true when the call went to an engine on hardware we or the
//                household control, so nothing crossed a border at all.
//   egress_bytes size of the payload that left. Zero when local, by definition.
//
// Deliberately NOT stored: the payload. A log of what you were careful not to
// send is a second copy of the thing you were careful not to send, in a
// collection with a longer retention than the records themselves.

migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("ai_usage");

    c.fields.add(
      new NumberField({
        name: "data_class",
        // Defaults to 2 on purpose. A row written by code that predates this
        // migration, or by a call site that somehow bypassed the guard, should
        // read as "we do not know that this was safe" rather than as clean.
        min: 0,
        max: 2,
      }),
    );
    c.fields.add(new BoolField({ name: "local" }));
    c.fields.add(new NumberField({ name: "egress_bytes", min: 0 }));

    c.indexes = [
      ...c.indexes,
      "CREATE INDEX idx_ai_usage_class ON ai_usage (data_class, created)",
    ];

    app.save(c);
  },
  (app) => {
    const c = app.findCollectionByNameOrId("ai_usage");
    for (const name of ["data_class", "local", "egress_bytes"]) {
      const f = c.fields.getByName(name);
      if (f) c.fields.removeById(f.id);
    }
    c.indexes = c.indexes.filter((i) => !i.includes("idx_ai_usage_class"));
    app.save(c);
  },
);
