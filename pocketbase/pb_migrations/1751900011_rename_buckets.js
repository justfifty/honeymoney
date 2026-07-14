/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — rename the three starter buckets to the vocabulary the app now
// speaks everywhere:
//
//   tier 1  Commitments   → Must-paid
//   tier 2  Future Shield → Savings
//   tier 3  Daily Spend   → Spendings
//
// Bucket names are free text (nodes.label); the tier lives in props.bucket =
// 1|2|3 and is what every projection actually keys off. So this is a pure
// relabel — no schema change, no transaction is touched, and every SPENT_AT
// edge keeps pointing at the same node id.
//
// Matching is on the exact old label and nothing else. Those three strings are
// the ones lib/household.ts seeds into every new household, so an exact hit is
// a starter bucket; a household that renamed its own buckets, or a demo seed
// using domain names (Rent, Groceries…), simply doesn't match and is left
// alone. We deliberately do NOT also test props.bucket: in PocketBase's JS
// migration runtime a `json` field does not come back as a plain object, so a
// tier check written the obvious way would silently match nothing and the
// migration would quietly do nothing at all.

const RENAMES = [
  { from: "Commitments", to: "Must-paid" },
  { from: "Future Shield", to: "Savings" },
  { from: "Daily Spend", to: "Spendings" },
];

function relabel(app, pairs) {
  for (const { from, to } of pairs) {
    let nodes = [];
    try {
      nodes = app.findRecordsByFilter(
        "nodes",
        "kind = 'bucket' && label = {:label}",
        "",
        1000,
        0,
        { label: from },
      );
    } catch (_) {
      continue; // collection not there yet, or nothing matched
    }
    for (const node of nodes) {
      node.set("label", to);
      app.save(node);
    }
  }
}

migrate(
  (app) => {
    relabel(app, RENAMES);
  },
  (app) => {
    relabel(app, RENAMES.map((r) => ({ from: r.to, to: r.from })));
  },
);
