/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — demo seed (PocketBase edition).
// One household + one business, proving the same graph engine serves both.
// Fixed 15-char record ids so DEMO_TENANT_ID is stable across machines.
// Transaction dates are relative to the month this migration first runs,
// so a fresh clone always shows a live-looking current month.

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

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(10, 0, 0, 0);
    const day = (n) => {
      const d = new Date(monthStart);
      d.setDate(1 + n);
      return d.toISOString().replace("T", " ");
    };

    // ═══ Tenant A: household ═══════════════════════════════════════════
    const HH = "hhrahman1111111";
    save("tenants", HH, { kind: "household", name: "The Rahman Household", base_currency: "MYR" });
    save("members", null, { tenant: HH, display_name: "Aiman", role: "owner" });
    save("members", null, { tenant: HH, display_name: "Siti", role: "member" });

    // income
    save("nodes", "ndsalary1111111", {
      tenant: HH, kind: "income_source", label: "Salary",
      props: { monthly_amount: 6000, cadence: "monthly" },
    });

    // buckets (1 fixed / 2 shield / 3 personal)
    save("nodes", "ndrent111111111", { tenant: HH, kind: "bucket", label: "Rent", props: { bucket: 1 } });
    save("nodes", "ndutil111111111", { tenant: HH, kind: "bucket", label: "Utilities", props: { bucket: 1 } });
    save("nodes", "ndeduc111111111", { tenant: HH, kind: "bucket", label: "Education", props: { bucket: 1 } });
    save("nodes", "ndshield1111111", { tenant: HH, kind: "bucket", label: "Future Shield", props: { bucket: 2 } });
    save("nodes", "ndgroc111111111", { tenant: HH, kind: "bucket", label: "Groceries", props: { bucket: 3, default_spend: true } });
    save("nodes", "ndaiman11111111", { tenant: HH, kind: "bucket", label: "Personal — Aiman", props: { bucket: 3, private: true } });
    save("nodes", "ndsiti111111111", { tenant: HH, kind: "bucket", label: "Personal — Siti", props: { bucket: 3, private: true } });

    // goal + vendors
    save("nodes", "ndgoalhouse1111", { tenant: HH, kind: "goal", label: "House Deposit", props: { target: 30000, current: 7200 } });
    save("nodes", "ndlotus11111111", { tenant: HH, kind: "vendor", label: "Lotus's", props: {} });
    save("nodes", "ndgrabfood11111", { tenant: HH, kind: "vendor", label: "GrabFood", props: {} });
    save("nodes", "ndshopee1111111", { tenant: HH, kind: "vendor", label: "ShopeePay", props: {} });

    // allocation edges: salary -> buckets
    const alloc = (dst, amount) =>
      save("edges", null, { tenant: HH, src_node: "ndsalary1111111", dst_node: dst, rel: "ALLOCATES_FIXED", amount, cadence: "monthly" });
    alloc("ndrent111111111", 1200);
    alloc("ndutil111111111", 300);
    alloc("ndeduc111111111", 500);
    alloc("ndgroc111111111", 800);
    alloc("ndaiman11111111", 700);
    alloc("ndsiti111111111", 700);
    save("edges", null, { tenant: HH, src_node: "ndsalary1111111", dst_node: "ndshield1111111", rel: "ALLOCATES_PCT", percentage: 15, cadence: "monthly" });
    save("edges", null, { tenant: HH, src_node: "ndshield1111111", dst_node: "ndgoalhouse1111", rel: "CONTRIBUTES_TO", cadence: "monthly" });

    // month-to-date spend — groceries running hot => over_budget signal
    const spend = (wallet, vendor, amount, d) =>
      save("transactions", null, {
        tenant: HH, wallet_node: wallet, vendor_node: vendor, amount,
        currency: "MYR", occurred_at: d, source: "telegram", parse_confidence: 0.96,
      });
    spend("ndgroc111111111", "ndlotus11111111", 180.4, day(2));
    spend("ndgroc111111111", "ndgrabfood11111", 52.0, day(4));
    spend("ndgroc111111111", "ndlotus11111111", 143.75, day(6));
    spend("ndgroc111111111", "ndgrabfood11111", 61.2, day(7));
    spend("ndaiman11111111", "ndshopee1111111", 38.9, day(5));

    // ═══ Tenant B: business (same engine, zero schema changes) ══════════
    const BIZ = "bizsedap2222222";
    save("tenants", BIZ, { kind: "business", name: "Nasi Lemak Sedap Sdn Bhd", base_currency: "MYR" });

    save("nodes", "ndrevenue222222", {
      tenant: BIZ, kind: "income_source", label: "Cafe Revenue",
      props: { monthly_amount: 40000, cadence: "monthly" },
    });
    save("nodes", "ndpayroll222222", { tenant: BIZ, kind: "bucket", label: "Payroll", props: { bucket: 1 } });
    save("nodes", "ndsupplier22222", { tenant: BIZ, kind: "bucket", label: "Suppliers", props: { bucket: 1, default_spend: true } });
    save("nodes", "ndrentbiz222222", { tenant: BIZ, kind: "bucket", label: "Rent & Utilities", props: { bucket: 1 } });
    save("nodes", "ndtaxres2222222", { tenant: BIZ, kind: "bucket", label: "Tax Reserve", props: { bucket: 2 } });
    save("nodes", "ndgrowth2222222", { tenant: BIZ, kind: "bucket", label: "Growth Fund", props: { bucket: 2 } });
    save("nodes", "ndownerdraw2222", { tenant: BIZ, kind: "bucket", label: "Owner Draw", props: { bucket: 3 } });
    save("nodes", "ndpasar22222222", { tenant: BIZ, kind: "vendor", label: "Pasar Borong", props: {} });
    save("nodes", "ndgas2222222222", { tenant: BIZ, kind: "vendor", label: "Gas Supplier", props: {} });

    const ballot = (dst, amount) =>
      save("edges", null, { tenant: BIZ, src_node: "ndrevenue222222", dst_node: dst, rel: "ALLOCATES_FIXED", amount, cadence: "monthly" });
    ballot("ndpayroll222222", 15000);
    ballot("ndsupplier22222", 9000);
    ballot("ndrentbiz222222", 4000);
    ballot("ndgrowth2222222", 3000);
    ballot("ndownerdraw2222", 5000);
    save("edges", null, { tenant: BIZ, src_node: "ndrevenue222222", dst_node: "ndtaxres2222222", rel: "ALLOCATES_PCT", percentage: 8, cadence: "monthly" });

    const bizSpend = (vendor, amount, d) =>
      save("transactions", null, {
        tenant: BIZ, wallet_node: "ndsupplier22222", vendor_node: vendor, amount,
        currency: "MYR", occurred_at: d, source: "manual", parse_confidence: 0.99,
      });
    bizSpend("ndpasar22222222", 2400.0, day(2));
    bizSpend("ndpasar22222222", 1850.5, day(5));
    bizSpend("ndgas2222222222", 620.0, day(6));
  },
  (app) => {
    for (const id of ["bizsedap2222222", "hhrahman1111111"]) {
      try {
        app.delete(app.findRecordById("tenants", id)); // cascade removes the rest
      } catch (_) {
        /* already gone */
      }
    }
  },
);
