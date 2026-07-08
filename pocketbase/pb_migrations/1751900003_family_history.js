/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — family of four + multi-month history.
// 1. WHO: adds a `member` relation to transactions; family = husband Aiman,
//    wife Siti, son Danish (13), daughter Aisyah (9).
// 2. WHEN: ~4 months of realistic transaction history (varied per month) plus a
//    temporal edge showing the Groceries allocation raised RM700 -> RM800.
// 3. Adds a Kids & School bucket with its own vendors.
// Deterministic variation (no RNG) so every clone seeds identical data.

migrate(
  (app) => {
    const save = (collectionName, id, data) => {
      const col = app.findCollectionByNameOrId(collectionName);
      const rec = new Record(col);
      if (id) rec.set("id", id);
      for (const k in data) rec.set(k, data[k]);
      app.save(rec);
      return rec;
    };

    const HH = "hhrahman1111111";

    // ── WHO: member attribution on transactions ─────────────────────────
    const txCol = app.findCollectionByNameOrId("transactions");
    txCol.fields.add(
      new Field({
        type: "relation",
        name: "member",
        collectionId: app.findCollectionByNameOrId("members").id,
        maxSelect: 1,
      }),
    );
    app.save(txCol);

    // family of four (Aiman & Siti already exist from the first seed)
    const aiman = app.findFirstRecordByFilter("members", "display_name = 'Aiman'").id;
    const siti = app.findFirstRecordByFilter("members", "display_name = 'Siti'").id;
    save("members", "mbdanish1111111", { tenant: HH, display_name: "Danish (son, 13)", role: "child" });
    save("members", "mbaisyah1111111", { tenant: HH, display_name: "Aisyah (daughter, 9)", role: "child" });
    const danish = "mbdanish1111111";
    const aisyah = "mbaisyah1111111";

    // ── Kids & School bucket + vendors ──────────────────────────────────
    save("nodes", "ndkids111111111", { tenant: HH, kind: "bucket", label: "Kids & School", props: { bucket: 1 } });
    save("edges", null, {
      tenant: HH, src_node: "ndsalary1111111", dst_node: "ndkids111111111",
      rel: "ALLOCATES_FIXED", amount: 500, cadence: "monthly",
    });
    save("nodes", "ndtuition1111111".slice(0, 15), { tenant: HH, kind: "vendor", label: "Tuition Centre", props: {} });
    save("nodes", "ndcanteen1111111".slice(0, 15), { tenant: HH, kind: "vendor", label: "School Canteen", props: {} });
    save("nodes", "ndwatsons1111111".slice(0, 15), { tenant: HH, kind: "vendor", label: "Watsons", props: {} });

    // ── WHEN: temporal edge — Groceries allocation was RM700 until last month
    const now = new Date();
    const fmt = (d) => d.toISOString().replace("T", " ");
    const monthsAgo = (m, dayOfMonth, h) => {
      const d = new Date(now.getFullYear(), now.getMonth() - m, dayOfMonth, h || 12, 0, 0);
      return d;
    };
    save("edges", null, {
      tenant: HH, src_node: "ndsalary1111111", dst_node: "ndgroc111111111",
      rel: "ALLOCATES_FIXED", amount: 700, cadence: "monthly",
      valid_from: fmt(monthsAgo(4, 1)), valid_to: fmt(monthsAgo(1, 28)),
    });

    // ── ~4 months of history (previous 4 full months, deterministic) ─────
    const spend = (wallet, vendor, member, amount, when) =>
      save("transactions", null, {
        tenant: HH, wallet_node: wallet, vendor_node: vendor, member,
        amount: Math.round(amount * 100) / 100,
        currency: "MYR", occurred_at: fmt(when),
        source: when.getDate() % 3 === 0 ? "manual" : "telegram",
        parse_confidence: 0.95,
      });

    const GROC_VENDORS = ["ndlotus11111111", "ndspeedmart1111", "ndmydin11111111"];
    for (let m = 4; m >= 1; m--) {
      // groceries: 6 trips/month, mostly Siti — amounts drift up over time
      for (let i = 0; i < 6; i++) {
        const vendor = GROC_VENDORS[(i + m) % 3];
        const who = i % 3 === 2 ? aiman : siti;
        const base = 60 + ((i * 37 + m * 11) % 90); // RM 60–150, deterministic
        spend("ndgroc111111111", vendor, who, base + m, monthsAgo(m, 2 + i * 4, 10 + i));
      }
      // transport: Aiman petrol twice a month
      spend("ndtransport1111", "ndshell11111111", aiman, 55 + ((m * 7) % 12), monthsAgo(m, 6, 8));
      spend("ndtransport1111", "ndshell11111111", aiman, 58 + ((m * 5) % 10), monthsAgo(m, 20, 18));
      // kids: monthly tuition (Danish) + canteen top-ups (both kids) + pharmacy (Siti)
      spend("ndkids111111111", "ndtuition111111", danish, 180, monthsAgo(m, 3, 15));
      spend("ndkids111111111", "ndcanteen111111", danish, 40 + (m % 4) * 5, monthsAgo(m, 10, 7));
      spend("ndkids111111111", "ndcanteen111111", aisyah, 30 + (m % 3) * 5, monthsAgo(m, 12, 7));
      spend("ndkids111111111", "ndwatsons111111", siti, 25 + ((m * 9) % 20), monthsAgo(m, 16, 20));
      // personal wallets: one aggregate entry each (Bucket 3 privacy — not itemized)
      spend("ndaiman11111111", "ndshopee1111111", aiman, 120 + ((m * 13) % 60), monthsAgo(m, 24, 21));
      spend("ndsiti111111111", "ndshopee1111111", siti, 110 + ((m * 17) % 70), monthsAgo(m, 25, 21));
    }

    // current-month kids spend so the new bucket is alive on the dashboard
    spend("ndkids111111111", "ndtuition111111", danish, 180, monthsAgo(0, 3, 15));
    spend("ndkids111111111", "ndcanteen111111", aisyah, 18.5, monthsAgo(0, 5, 7));
  },
  (app) => {
    // down: remove kids bucket + vendors (cascade cleans edges/txns), members, member field
    for (const id of ["ndkids111111111", "ndtuition111111", "ndcanteen111111", "ndwatsons111111"]) {
      try { app.delete(app.findRecordById("nodes", id)); } catch (_) { /* gone */ }
    }
    for (const id of ["mbdanish1111111", "mbaisyah1111111"]) {
      try { app.delete(app.findRecordById("members", id)); } catch (_) { /* gone */ }
    }
    try {
      const txCol = app.findCollectionByNameOrId("transactions");
      txCol.fields.removeByName("member");
      app.save(txCol);
    } catch (_) { /* gone */ }
  },
);
