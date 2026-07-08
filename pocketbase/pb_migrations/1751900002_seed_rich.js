/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — richer demo data for the knowledge-graph visualization (/graph).
// Adds to the Rahman household: a second income stream, a car-loan obligation,
// a Transport bucket, a second goal, and more vendors + month-to-date spend.
// Auto-applies on next PocketBase start.

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
    monthStart.setHours(12, 0, 0, 0);
    const day = (n) => {
      const d = new Date(monthStart);
      d.setDate(1 + n);
      return d.toISOString().replace("T", " ");
    };

    const HH = "hhrahman1111111";

    // second income stream — shows multi-source funding in the graph
    save("nodes", "ndsidegig111111", {
      tenant: HH, kind: "income_source", label: "Side Hustle (Grab)",
      props: { monthly_amount: 900, cadence: "monthly" },
    });

    // new bucket + obligation + second goal
    save("nodes", "ndtransport1111", { tenant: HH, kind: "bucket", label: "Transport", props: { bucket: 1 } });
    save("nodes", "ndcarloan111111", { tenant: HH, kind: "obligation", label: "Car Loan (Perodua)", props: { monthly_payment: 650, remaining: 21400 } });
    save("nodes", "ndumrah11111111", { tenant: HH, kind: "goal", label: "Umrah Fund", props: { target: 15000, current: 3100 } });

    // more everyday vendors
    save("nodes", "ndspeedmart1111", { tenant: HH, kind: "vendor", label: "99 Speedmart", props: {} });
    save("nodes", "ndshell11111111", { tenant: HH, kind: "vendor", label: "Shell", props: {} });
    save("nodes", "ndmydin11111111", { tenant: HH, kind: "vendor", label: "Mydin", props: {} });

    // allocation edges
    const edge = (data) => save("edges", null, Object.assign({ tenant: HH }, data));
    edge({ src_node: "ndsalary1111111", dst_node: "ndtransport1111", rel: "ALLOCATES_FIXED", amount: 400, cadence: "monthly" });
    edge({ src_node: "ndsalary1111111", dst_node: "ndcarloan111111", rel: "ALLOCATES_FIXED", amount: 650, cadence: "monthly" });
    edge({ src_node: "ndsidegig111111", dst_node: "ndshield1111111", rel: "ALLOCATES_FIXED", amount: 400, cadence: "monthly" });
    edge({ src_node: "ndsidegig111111", dst_node: "ndaiman11111111", rel: "ALLOCATES_FIXED", amount: 300, cadence: "monthly" });
    edge({ src_node: "ndshield1111111", dst_node: "ndumrah11111111", rel: "CONTRIBUTES_TO", cadence: "monthly" });

    // month-to-date spend
    const spend = (wallet, vendor, amount, d) =>
      save("transactions", null, {
        tenant: HH, wallet_node: wallet, vendor_node: vendor, amount,
        currency: "MYR", occurred_at: d, source: "telegram", parse_confidence: 0.95,
      });
    spend("ndgroc111111111", "ndspeedmart1111", 28.5, day(1));
    spend("ndgroc111111111", "ndmydin11111111", 96.2, day(3));
    spend("ndtransport1111", "ndshell11111111", 60.0, day(2));
    spend("ndtransport1111", "ndshell11111111", 58.4, day(6));
  },
  (app) => {
    for (const id of [
      "ndsidegig111111", "ndtransport1111", "ndcarloan111111",
      "ndumrah11111111", "ndspeedmart1111", "ndshell11111111", "ndmydin11111111",
    ]) {
      try {
        app.delete(app.findRecordById("nodes", id)); // cascade removes edges/txns
      } catch (_) {
        /* already gone */
      }
    }
  },
);
