/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — the roster scales to a business. The café tenant gets a staff
// roster (owner, manager, kitchen, barista) and member-attributed spend, so the
// "focus by person" lens works for business operations exactly as it does for
// the household — and staff can be added/removed over time from the UI.

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

    const BIZ = "bizsedap2222222";

    // staff roster (fixed ids so member-attributed txns can reference them)
    save("members", "stfarid11111111", { tenant: BIZ, display_name: "Farid (owner)", role: "owner" });
    save("members", "stmeiling111111", { tenant: BIZ, display_name: "Mei Ling (manager)", role: "manager" });
    save("members", "stkitchen111111", { tenant: BIZ, display_name: "Rosli (kitchen)", role: "staff" });
    save("members", "starun111111111", { tenant: BIZ, display_name: "Arun (barista)", role: "staff" });

    const now = new Date();
    const day = (n) => {
      const d = new Date(now.getFullYear(), now.getMonth(), 1 + n, 11, 0, 0);
      return d.toISOString().replace("T", " ");
    };

    // one more vendor so staff spend spreads across the graph
    save("nodes", "ndpackaging2222".slice(0, 15), { tenant: BIZ, kind: "vendor", label: "Packaging Co", props: {} });

    const spend = (wallet, vendor, member, amount, d) =>
      save("transactions", null, {
        tenant: BIZ, wallet_node: wallet, vendor_node: vendor, member,
        amount: Math.round(amount * 100) / 100,
        currency: "MYR", occurred_at: d, source: "manual", parse_confidence: 0.98,
      });

    // manager does the market runs, kitchen buys gas, barista buys packaging
    spend("ndsupplier22222", "ndpasar22222222", "stmeiling111111", 2100.0, day(3));
    spend("ndsupplier22222", "ndpasar22222222", "stmeiling111111", 1760.5, day(9));
    spend("ndsupplier22222", "ndgas2222222222", "stkitchen111111", 640.0, day(5));
    spend("ndsupplier22222", "ndpackaging2222", "starun111111111", 380.0, day(7));
    spend("ndsupplier22222", "ndpackaging2222", "starun111111111", 295.5, day(14));
  },
  (app) => {
    for (const id of ["stfarid11111111", "stmeiling111111", "stkitchen111111", "starun111111111"]) {
      try { app.delete(app.findRecordById("members", id)); } catch (_) { /* gone */ }
    }
    try { app.delete(app.findRecordById("nodes", "ndpackaging2222")); } catch (_) { /* gone */ }
  },
);
