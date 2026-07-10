/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — accounts, site analytics, and cost ledger.
//  • app_users : auth collection with a role (user | admin); seeds one admin.
//                (Named app_users to avoid PocketBase's default `users`.)
//  • page_views: one row per visit (path, ip, country, duration…) for the admin
//                analytics dashboard. IP/country come from Cloudflare headers.
//  • costs      : running cost ledger (domain, AI, infra); seeds the domain buy.
// All superuser-only via the API; the Next.js server mediates every read/write.

migrate(
  (app) => {
    const has = (name) => {
      try {
        return !!app.findCollectionByNameOrId(name);
      } catch (_) {
        return false;
      }
    };

    // ── app_users (auth) ─────────────────────────────────────────────────
    if (!has("app_users")) {
      const users = new Collection({
        type: "auth",
        name: "app_users",
        fields: [
          { type: "text", name: "name" },
          { type: "select", name: "role", maxSelect: 1, values: ["user", "admin"] },
        ],
      });
      app.save(users);

      const usersCol = app.findCollectionByNameOrId("app_users");
      const admin = new Record(usersCol);
      admin.set("email", "admin@honeymoney.app");
      admin.set("name", "Site Admin");
      admin.set("role", "admin");
      admin.set("verified", true);
      // Password from env so no secret lives in the repo; change on real deploys.
      admin.setPassword($os.getenv("ADMIN_SEED_PASSWORD") || "honeymoney-admin-changeme");
      app.save(admin);
    }

    // ── page_views (site analytics) ──────────────────────────────────────
    if (!has("page_views")) {
      const pv = new Collection({
        type: "base",
        name: "page_views",
        fields: [
          { type: "text", name: "path" },
          { type: "text", name: "referrer" },
          { type: "text", name: "ip" },
          { type: "text", name: "country" },
          { type: "text", name: "city" },
          { type: "text", name: "ua" },
          { type: "text", name: "session" },
          { type: "text", name: "user" },
          { type: "number", name: "duration_ms" },
          { type: "autodate", name: "created", onCreate: true },
        ],
        indexes: [
          "CREATE INDEX idx_pv_created ON page_views (created)",
          "CREATE INDEX idx_pv_path ON page_views (path)",
          "CREATE INDEX idx_pv_session ON page_views (session)",
        ],
      });
      app.save(pv);
    }

    // ── costs (spend ledger) ─────────────────────────────────────────────
    if (!has("costs")) {
      const costs = new Collection({
        type: "base",
        name: "costs",
        fields: [
          { type: "text", name: "label", required: true },
          { type: "text", name: "category" }, // domain | ai | infra | other
          { type: "number", name: "amount", required: true },
          { type: "text", name: "currency" },
          { type: "text", name: "vendor" },
          { type: "date", name: "incurred_on" },
          { type: "text", name: "note" },
          { type: "autodate", name: "created", onCreate: true },
        ],
        indexes: ["CREATE INDEX idx_costs_incurred ON costs (incurred_on)"],
      });
      app.save(costs);

      const costsCol = app.findCollectionByNameOrId("costs");
      const dom = new Record(costsCol);
      dom.set("label", "Domain: honeymoney.app (1 year)");
      dom.set("category", "domain");
      dom.set("amount", 15.48);
      dom.set("currency", "USD");
      dom.set("vendor", "Cloudflare");
      dom.set("incurred_on", "2026-07-10 00:00:00.000Z");
      dom.set("note", "Cloudflare Registrar — at-cost .app registration");
      app.save(dom);
    }
  },
  (app) => {
    for (const name of ["costs", "page_views", "app_users"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {
        /* already gone */
      }
    }
  },
);
