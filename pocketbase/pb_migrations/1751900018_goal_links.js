/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — a goal's progress becomes something you can reconcile.
//
// Task 9 of the 2026-08-22 brief: "Progress derived by default — the sum of
// transfer records linked to the goal — with a separately labelled manual
// adjustment for savings that happened outside the app. Always show 'RM8,000
// tracked + RM2,000 you added manually.' Silently mixing the two produces a
// number nobody can reconcile later."
//
// That is exactly what existed. A goal node carried one opaque `props.current`
// which `contributeGoal` incremented, and nothing recorded where any of it came
// from. Two households with the same RM8,000 — one who logged every transfer,
// one who typed 8000 once — were indistinguishable.
//
// Two changes:
//
//   1. `transactions.goal` — the LINK. A record belongs to at most one goal
//      (maxSelect 1), which is the brief's rule. cascadeDelete is deliberately
//      FALSE: deleting a goal must unlink its records, never delete them. A
//      household's ledger is not a goal's property, and the audit ledger exists
//      precisely so money cannot quietly vanish from history.
//
//   2. `props.manual_adjustment` on the goal, for the manual half from here on.
//
// NO DATA IS REWRITTEN. An earlier version of this migration also looped over
// every goal to copy `props.current` into `props.manual_adjustment`. It reported
// success and changed nothing — `findRecordsByFilter` returned no rows, the
// schema half had already applied, and the migration was recorded as done. The
// visible result would have been every household seeing RM0 against goals they
// had really funded.
//
// So `mapGoal` in lib/goals.ts READS the legacy `props.current` as the manual
// figure when no explicit `manual_adjustment` exists. That is the same principle
// the H-Score snapshots use — history says what it said, and today's code knows
// how to read it — and it is right on the merits too: `current` only ever held a
// number a human typed, which is exactly what the manual half means.
//
// Two lessons worth keeping: a JSVM data backfill can half-succeed and still be
// marked applied, so schema and data belong in separate files; and where a read
// can interpret old data, that beats a write that rewrites it.

migrate(
  (app) => {
    const hasField = (col, name) => col.fields.some((f) => f.name === name);

    const nodes = app.findCollectionByNameOrId("nodes");
    const txns = app.findCollectionByNameOrId("transactions");

    if (!hasField(txns, "goal")) {
      txns.fields.add(
        new Field({
          type: "relation",
          name: "goal",
          required: false,
          cascadeDelete: false, // unlink, never delete — see above
          collectionId: nodes.id,
          maxSelect: 1,
        }),
      );
    }
    app.save(txns);

  },
  (app) => {
    try {
      const txns = app.findCollectionByNameOrId("transactions");
      txns.fields.removeByName("goal");
      app.save(txns);
    } catch (_) {
      /* collection already gone */
    }
    // `manual_adjustment` is intentionally NOT unwound: `props.current` was left
    // in place by the up-migration and still holds the same figure, so rolling
    // back loses nothing. Removing it here would delete a number a user may have
    // edited since.
  },
);
