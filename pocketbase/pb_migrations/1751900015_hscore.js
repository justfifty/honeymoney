/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — H-Score persistence (UI/UX spec v2 §3).
//
//  • hscore_state     : one row per tenant. Holds the band the household is
//                       currently SHOWN, plus the pending-band clock that makes
//                       hysteresis work — a new tier is only awarded once the
//                       raw score has held across the boundary for 7 days.
//  • hscore_snapshots : one row per tenant per day. The only reason it exists is
//                       "what moved your score", which needs a yesterday to diff
//                       against. Sub-scores are stored as json so the statement
//                       can name the component that actually moved.
//
// Both are superuser-only, like every other collection here: the Next.js server
// mediates all reads and writes.

migrate(
  (app) => {
    const has = (name) => {
      try {
        return !!app.findCollectionByNameOrId(name);
      } catch (_) {
        return false;
      }
    };

    if (!has("hscore_state")) {
      const state = new Collection({
        type: "base",
        name: "hscore_state",
        fields: [
          { type: "text", name: "tenant", required: true },
          // building | steady | strong | thriving
          { type: "text", name: "band", required: true },
          { type: "text", name: "pending_band" },
          { type: "text", name: "pending_since" },
          { type: "autodate", name: "created", onCreate: true },
          { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
        ],
        indexes: [
          // One state row per household — the adapter upserts against this.
          "CREATE UNIQUE INDEX idx_hscore_state_tenant ON hscore_state (tenant)",
        ],
      });
      app.save(state);
    }

    if (!has("hscore_snapshots")) {
      const snaps = new Collection({
        type: "base",
        name: "hscore_snapshots",
        fields: [
          { type: "text", name: "tenant", required: true },
          { type: "number", name: "score", required: true },
          { type: "text", name: "band", required: true },
          { type: "json", name: "sub_scores", maxSize: 4000 },
          { type: "autodate", name: "created", onCreate: true },
          { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_hscore_snap_tenant_created ON hscore_snapshots (tenant, created)",
        ],
      });
      app.save(snaps);
    }
  },
  (app) => {
    for (const name of ["hscore_snapshots", "hscore_state"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {
        /* already gone */
      }
    }
  },
);
