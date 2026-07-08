/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — Financial Knowledge Graph schema (PocketBase edition).
// Mirrors supabase/migrations/0001_init_graph.sql (the cloud-scale path).
// Runs automatically on first `pocketbase serve`.
// API rules are left null (superuser only) — the Next.js server authenticates
// as a superuser; collections are never exposed directly to browsers.

migrate(
  (app) => {
    // ── tenants ──────────────────────────────────────────────────────────
    const tenants = new Collection({
      type: "base",
      name: "tenants",
      fields: [
        { type: "select", name: "kind", required: true, maxSelect: 1, values: ["household", "business"] },
        { type: "text", name: "name", required: true },
        { type: "text", name: "base_currency" },
        { type: "autodate", name: "created", onCreate: true },
      ],
    });
    app.save(tenants);
    const tenantsId = app.findCollectionByNameOrId("tenants").id;

    // ── members ──────────────────────────────────────────────────────────
    const members = new Collection({
      type: "base",
      name: "members",
      fields: [
        { type: "relation", name: "tenant", required: true, maxSelect: 1, collectionId: tenantsId, cascadeDelete: true },
        { type: "text", name: "display_name", required: true },
        { type: "text", name: "role" },
        { type: "autodate", name: "created", onCreate: true },
      ],
    });
    app.save(members);

    // ── nodes (graph vertices) ───────────────────────────────────────────
    const nodes = new Collection({
      type: "base",
      name: "nodes",
      fields: [
        { type: "relation", name: "tenant", required: true, maxSelect: 1, collectionId: tenantsId, cascadeDelete: true },
        {
          type: "select", name: "kind", required: true, maxSelect: 1,
          values: ["income_source", "bucket", "wallet", "vendor", "obligation", "goal", "asset", "member"],
        },
        { type: "text", name: "label", required: true },
        { type: "json", name: "props" },
        { type: "autodate", name: "created", onCreate: true },
      ],
      indexes: ["CREATE INDEX idx_nodes_tenant_kind ON nodes (tenant, kind)"],
    });
    app.save(nodes);
    const nodesId = app.findCollectionByNameOrId("nodes").id;

    // ── edges (typed, temporal relations with flow semantics) ────────────
    const edges = new Collection({
      type: "base",
      name: "edges",
      fields: [
        { type: "relation", name: "tenant", required: true, maxSelect: 1, collectionId: tenantsId, cascadeDelete: true },
        { type: "relation", name: "src_node", required: true, maxSelect: 1, collectionId: nodesId, cascadeDelete: true },
        { type: "relation", name: "dst_node", required: true, maxSelect: 1, collectionId: nodesId, cascadeDelete: true },
        {
          type: "select", name: "rel", required: true, maxSelect: 1,
          values: ["FUNDS", "ALLOCATES_PCT", "ALLOCATES_FIXED", "ROUTED_TO", "SPENT_AT", "OWES", "CONTRIBUTES_TO", "OWNS"],
        },
        { type: "number", name: "amount" },
        { type: "number", name: "percentage" },
        { type: "text", name: "cadence" },
        { type: "json", name: "props" },
        { type: "date", name: "valid_from" },
        { type: "date", name: "valid_to" }, // empty = currently active
        { type: "autodate", name: "created", onCreate: true },
      ],
      indexes: ["CREATE INDEX idx_edges_tenant_rel ON edges (tenant, rel)"],
    });
    app.save(edges);
    const edgesId = app.findCollectionByNameOrId("edges").id;

    // ── transactions (events attach to the SPENT_AT edge they realize) ───
    const transactions = new Collection({
      type: "base",
      name: "transactions",
      fields: [
        { type: "relation", name: "tenant", required: true, maxSelect: 1, collectionId: tenantsId, cascadeDelete: true },
        { type: "relation", name: "edge", maxSelect: 1, collectionId: edgesId },
        { type: "relation", name: "wallet_node", maxSelect: 1, collectionId: nodesId },
        { type: "relation", name: "vendor_node", maxSelect: 1, collectionId: nodesId },
        { type: "number", name: "amount", required: true },
        { type: "text", name: "currency" },
        { type: "date", name: "occurred_at" },
        { type: "text", name: "source" },
        { type: "text", name: "receipt_ref" }, // pointer only; never the raw image
        { type: "number", name: "parse_confidence" },
        { type: "json", name: "raw" },
        { type: "autodate", name: "created", onCreate: true },
      ],
      indexes: ["CREATE INDEX idx_tx_tenant_time ON transactions (tenant, occurred_at)"],
    });
    app.save(transactions);

    // ── channel_links (Telegram chat id -> tenant) ───────────────────────
    const channelLinks = new Collection({
      type: "base",
      name: "channel_links",
      fields: [
        { type: "relation", name: "tenant", required: true, maxSelect: 1, collectionId: tenantsId, cascadeDelete: true },
        { type: "text", name: "channel", required: true },
        { type: "text", name: "external_id", required: true },
        { type: "autodate", name: "created", onCreate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_channel_ext ON channel_links (channel, external_id)"],
    });
    app.save(channelLinks);
  },
  (app) => {
    // down: reverse dependency order
    for (const name of ["channel_links", "transactions", "edges", "nodes", "members", "tenants"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {
        /* already gone */
      }
    }
  },
);
