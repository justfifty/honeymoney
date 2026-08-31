/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — product events: did the thing we built actually get used.
//
// ── WHY THIS IS NOT `page_views` ───────────────────────────────────────────
//
// `page_views` answers "how much traffic", which is a marketing question. This
// answers "did a household that signed up still log a spend four weeks later",
// which is the ONLY question that matters for a daily-habit product and the one
// the pitch deck currently cannot answer — its traction slide reads "user
// numbers come with the pilot".
//
// Retention is measured FORWARD. A week that was not instrumented is gone and
// cannot be reconstructed, which is why this exists before the first pilot
// household rather than after.
//
// ── THE ROW IS DELIBERATELY NARROW ─────────────────────────────────────────
//
// user, tenant, event, day. No path, no IP, no country, no user-agent — all of
// which `page_views` carries and none of which belongs here. The narrowness is
// the privacy design, not laziness: docs promise a sponsor can never receive
// "identifiable usage data — not whether you logged in, not how often, not when
// you stopped", and the cheapest way to keep a promise about a column is not to
// have the column. Anything reported to an employer must additionally go
// through lib/aggregateDisclosure.ts (MIN_COHORT = 10).
//
// `day` is stored rather than derived so that "one session per user per day" is
// enforceable by a UNIQUE INDEX instead of by a query that races itself. A PWA
// resuming on every app switch would otherwise report one household as fifty,
// and a retention number built on that is not a soft error — it is fiction that
// looks like evidence.
//
// FIRST-PARTY ONLY. No SDK, no pixel, no session replay. The legal pack says
// "nothing on any page of this app reports to anybody else about you", and this
// collection is inside the same PocketBase as everything else it describes.

migrate(
  (app) => {
    const c = new Collection({
      type: "base",
      name: "product_events",
      // Superuser-only, like the rest of the schema. Written server-side only —
      // never from a browser, so a client cannot forge a retention figure.
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "text", name: "user", required: true },
        { type: "text", name: "tenant" },
        // signup | first_expense | expense_logged | session_open |
        // private_bucket | insight_viewed
        { type: "text", name: "event", required: true },
        // YYYY-MM-DD, the UTC day. Carried so the once-per-day events can be
        // deduplicated by the database rather than by hope.
        { type: "text", name: "day", required: true },
        { type: "autodate", name: "created", onCreate: true },
      ],
      indexes: [
        // The cohort query: every event for a user, in time order.
        "CREATE INDEX idx_pe_user ON product_events (user, event, created)",
        // The rollup query: everyone who did X on day D.
        "CREATE INDEX idx_pe_event_day ON product_events (event, day)",
        // ⚠️ THE ONE THAT MATTERS. `session_open` must be at most one row per
        // user per day or retention is inflated by however often somebody
        // switches apps. Enforced here, where a race cannot get past it —
        // recordOncePerDay() in lib/productEvents.ts relies on this index
        // rejecting the duplicate rather than on checking first and then
        // writing, which is exactly the pattern that loses a race.
        "CREATE UNIQUE INDEX idx_pe_daily ON product_events (user, event, day)",
      ],
    });
    app.save(c);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("product_events"));
    } catch {
      // Already gone — a down migration that fails because there is nothing to
      // undo should not fail the batch.
    }
  },
);
