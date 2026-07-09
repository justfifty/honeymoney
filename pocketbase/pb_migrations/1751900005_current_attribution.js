/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — current-month member attribution for the household adults.
// The history seed attributed past months; this ensures Aiman and Siti each have
// live spend THIS month so the "focus by person" lens is populated for everyone
// currently on the roster (the monitoring views look at the current month).

migrate(
  (app) => {
    const save = (data) => {
      const col = app.findCollectionByNameOrId("transactions");
      const rec = new Record(col);
      for (const k in data) rec.set(k, data[k]);
      app.save(rec);
    };

    const HH = "hhrahman1111111";
    const aiman = app.findFirstRecordByFilter("members", "display_name = 'Aiman'").id;
    const siti = app.findFirstRecordByFilter("members", "display_name = 'Siti'").id;

    const now = new Date();
    const day = (n) => {
      const d = new Date(now.getFullYear(), now.getMonth(), 1 + n, 12, 0, 0);
      return d.toISOString().replace("T", " ");
    };
    const spend = (wallet, vendor, member, amount, n) =>
      save({
        tenant: HH, wallet_node: wallet, vendor_node: vendor, member,
        amount, currency: "MYR", occurred_at: day(n),
        source: n % 2 === 0 ? "manual" : "telegram", parse_confidence: 0.95,
      });

    // Siti: groceries + her personal wallet
    spend("ndgroc111111111", "ndlotus11111111", siti, 92.3, 0);
    spend("ndgroc111111111", "ndmydin11111111", siti, 76.5, 3);
    spend("ndsiti111111111", "ndshopee1111111", siti, 130.0, 5);
    // Aiman: transport + groceries + his personal wallet
    spend("ndtransport1111", "ndshell11111111", aiman, 62.0, 1);
    spend("ndgroc111111111", "ndgrabfood11111", aiman, 48.0, 6);
    spend("ndaiman11111111", "ndshopee1111111", aiman, 145.0, 4);
  },
  (app) => {
    // best-effort down: remove this migration's current-month attributed rows
    try {
      const rows = app.findRecordsByFilter(
        "transactions",
        "tenant = 'hhrahman1111111' && member != '' && (amount = 92.3 || amount = 76.5 || amount = 130 || amount = 62 || amount = 48 || amount = 145)",
        "-created",
        50,
        0,
      );
      for (const r of rows) app.delete(r);
    } catch (_) {
      /* nothing to undo */
    }
  },
);
