/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — real households, tamper-evident ledger, and live FX.
//
//  • members.user        : the missing link. Binds an app_users account to a
//                          tenant, so two logins can share one household.
//                          (The Supabase twin always had members.user_id; the
//                          PocketBase port dropped it — this restores parity.)
//  • members.access_role : owner | adult | child | viewer. Distinct from the
//                          existing free-text `role`, which is a *display*
//                          label ("Wife", "Barista") and must keep working.
//  • invites             : one-time codes that let a partner join a household.
//  • ledger              : append-only, hash-chained audit log. Every create /
//                          edit / void of a transaction writes one row whose
//                          hash covers the previous row's hash, so any silent
//                          rewrite of history breaks the chain.
//  • ledger_anchors      : periodic root hashes submitted to a public
//                          timestamping chain (OpenTimestamps → Bitcoin), which
//                          is what makes the chain independently verifiable
//                          without putting any financial data on-chain.
//  • fx_rates            : cached exchange rates + the source each came from.
//  • transactions.voided : a "delete" never destroys a row — it marks it void
//                          and appends a ledger entry. Nothing is ever lost.
//
// API rules stay null (superuser-only); the Next.js server mediates access.

migrate(
  (app) => {
    const has = (name) => {
      try {
        return !!app.findCollectionByNameOrId(name);
      } catch (_) {
        return false;
      }
    };
    const hasField = (col, field) => col.fields.some((f) => f.name === field);

    const usersId = app.findCollectionByNameOrId("app_users").id;
    const tenantsId = app.findCollectionByNameOrId("tenants").id;

    // ── members.user + members.access_role ───────────────────────────────
    const members = app.findCollectionByNameOrId("members");
    if (!hasField(members, "user")) {
      members.fields.add(
        new Field({
          type: "relation",
          name: "user",
          maxSelect: 1,
          collectionId: usersId,
          cascadeDelete: false,
        }),
      );
    }
    if (!hasField(members, "access_role")) {
      members.fields.add(
        new Field({
          type: "select",
          name: "access_role",
          maxSelect: 1,
          values: ["owner", "adult", "child", "viewer"],
        }),
      );
    }
    app.save(members);

    // ── transactions.voided / .note / .updated ───────────────────────────
    const txns = app.findCollectionByNameOrId("transactions");
    if (!hasField(txns, "voided")) {
      txns.fields.add(new Field({ type: "bool", name: "voided" }));
    }
    if (!hasField(txns, "note")) {
      txns.fields.add(new Field({ type: "text", name: "note" }));
    }
    if (!hasField(txns, "updated")) {
      txns.fields.add(new Field({ type: "autodate", name: "updated", onCreate: true, onUpdate: true }));
    }
    app.save(txns);

    // ── invites ──────────────────────────────────────────────────────────
    if (!has("invites")) {
      app.save(
        new Collection({
          type: "base",
          name: "invites",
          fields: [
            { type: "relation", name: "tenant", required: true, maxSelect: 1, collectionId: tenantsId, cascadeDelete: true },
            { type: "text", name: "code", required: true },
            { type: "select", name: "access_role", maxSelect: 1, values: ["owner", "adult", "child", "viewer"] },
            { type: "text", name: "display_name" },
            { type: "text", name: "email" },
            { type: "relation", name: "created_by", maxSelect: 1, collectionId: usersId },
            { type: "relation", name: "accepted_by", maxSelect: 1, collectionId: usersId },
            { type: "date", name: "expires_at" },
            { type: "date", name: "accepted_at" },
            { type: "bool", name: "revoked" },
            { type: "autodate", name: "created", onCreate: true },
          ],
          indexes: [
            "CREATE UNIQUE INDEX idx_invite_code ON invites (code)",
            "CREATE INDEX idx_invite_tenant ON invites (tenant)",
          ],
        }),
      );
    }

    // ── ledger (hash-chained, append-only) ───────────────────────────────
    if (!has("ledger")) {
      app.save(
        new Collection({
          type: "base",
          name: "ledger",
          fields: [
            { type: "relation", name: "tenant", required: true, maxSelect: 1, collectionId: tenantsId, cascadeDelete: false },
            { type: "number", name: "seq", required: true },
            { type: "text", name: "prev_hash", required: true },
            { type: "text", name: "hash", required: true },
            { type: "select", name: "op", required: true, maxSelect: 1, values: ["create", "update", "void", "restore"] },
            { type: "text", name: "collection", required: true },
            { type: "text", name: "record_id", required: true },
            { type: "json", name: "before" },
            { type: "json", name: "after" },
            { type: "relation", name: "actor", maxSelect: 1, collectionId: usersId },
            { type: "text", name: "actor_email" },
            { type: "date", name: "at", required: true },
            { type: "autodate", name: "created", onCreate: true },
          ],
          indexes: [
            "CREATE UNIQUE INDEX idx_ledger_tenant_seq ON ledger (tenant, seq)",
            "CREATE INDEX idx_ledger_record ON ledger (record_id)",
            "CREATE INDEX idx_ledger_hash ON ledger (hash)",
          ],
        }),
      );
    }

    // ── ledger_anchors (public timestamping proofs) ──────────────────────
    if (!has("ledger_anchors")) {
      app.save(
        new Collection({
          type: "base",
          name: "ledger_anchors",
          fields: [
            { type: "relation", name: "tenant", maxSelect: 1, collectionId: tenantsId, cascadeDelete: false },
            { type: "text", name: "root_hash", required: true },
            { type: "number", name: "from_seq" },
            { type: "number", name: "to_seq" },
            { type: "text", name: "provider" }, // opentimestamps
            { type: "text", name: "status" }, // pending | confirmed | failed
            { type: "text", name: "proof_b64" }, // .ots proof, base64
            { type: "text", name: "detail" },
            { type: "autodate", name: "created", onCreate: true },
          ],
          indexes: ["CREATE INDEX idx_anchor_tenant ON ledger_anchors (tenant, created)"],
        }),
      );
    }

    // ── fx_rates (cached live rates, with provenance) ────────────────────
    if (!has("fx_rates")) {
      app.save(
        new Collection({
          type: "base",
          name: "fx_rates",
          fields: [
            { type: "text", name: "base", required: true }, // MYR
            { type: "text", name: "quote", required: true }, // SGD, USD…
            { type: "number", name: "rate", required: true }, // 1 base = `rate` quote
            { type: "text", name: "source", required: true }, // bnm | ecb | static
            { type: "text", name: "source_url" },
            { type: "date", name: "as_of" }, // the rate's own publication date
            { type: "date", name: "fetched_at" },
            { type: "autodate", name: "created", onCreate: true },
          ],
          indexes: [
            "CREATE INDEX idx_fx_pair ON fx_rates (base, quote, fetched_at)",
          ],
        }),
      );
    }

    // ── Backfill: bind the seeded demo households to the seeded admin, and
    //    give every existing member an access_role so nothing is left null.
    const seededMembers = app.findRecordsByFilter("members", "access_role = ''", "", 500, 0);
    for (const m of seededMembers) {
      m.set("access_role", "adult");
      app.save(m);
    }
  },
  (app) => {
    for (const name of ["fx_rates", "ledger_anchors", "ledger", "invites"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {
        /* already gone */
      }
    }
    try {
      const members = app.findCollectionByNameOrId("members");
      members.fields.removeByName("user");
      members.fields.removeByName("access_role");
      app.save(members);
      const txns = app.findCollectionByNameOrId("transactions");
      txns.fields.removeByName("voided");
      txns.fields.removeByName("note");
      txns.fields.removeByName("updated");
      app.save(txns);
    } catch (_) {
      /* already gone */
    }
  },
);
