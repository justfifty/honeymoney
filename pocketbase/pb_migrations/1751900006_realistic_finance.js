/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — realistic Malaysian financial detail for both demo tenants.
//  • Household: gross salary + statutory (EPF/SOCSO/EIS), income tax (PCB),
//    insurance (life + medical), and a full "Bills & Subscriptions" bucket —
//    TNB, Unifi, mobile, Astro, AI subscription, water, device installment,
//    credit-card late fee — plus multi-stream income (Siti's salary + rental).
//  • Business: employer statutory, SST, business insurance, utilities, marketing,
//    software & AI, and multi-stream revenue (dine-in + catering + delivery).
// Spend is member-attributed so the person lens works on the new items too.
// Household roster is ensured (find-or-create) so the People lens is never empty.

migrate(
  (app) => {
    const nid = (s) => (s + "111111111111111").slice(0, 15);
    const save = (col, id, data) => {
      const c = app.findCollectionByNameOrId(col);
      const rec = new Record(c);
      if (id) rec.set("id", id);
      for (const k in data) rec.set(k, data[k]);
      app.save(rec);
      return rec;
    };
    const ensureMember = (tenant, name, role) => {
      try {
        return app.findFirstRecordByFilter("members", `tenant = '${tenant}' && display_name = '${name}'`).id;
      } catch (_) {
        return save("members", null, { tenant, display_name: name, role }).id;
      }
    };
    const now = new Date();
    const day = (n) => {
      const d = new Date(now.getFullYear(), now.getMonth(), 1 + n, 10 + (n % 8), 0, 0);
      return d.toISOString().replace("T", " ");
    };
    const relabel = (id, label, props) => {
      const r = app.findRecordById("nodes", id);
      r.set("label", label);
      if (props) r.set("props", props);
      app.save(r);
    };

    // ═══ HOUSEHOLD ═══════════════════════════════════════════════════════
    const HH = "hhrahman1111111";
    // ensure the full family roster exists (self-heals a lost People lens)
    const aiman = ensureMember(HH, "Aiman", "owner");
    const siti = ensureMember(HH, "Siti", "member");
    ensureMember(HH, "Danish (son, 13)", "child");
    ensureMember(HH, "Aisyah (daughter, 9)", "child");

    // multi-stream income: treat salary as gross, add Siti's pay + rental
    relabel("ndsalary1111111", "Aiman — Salary", { monthly_amount: 6500, cadence: "monthly" });
    save("nodes", nid("ndsitisal"), { tenant: HH, kind: "income_source", label: "Siti — Salary", props: { monthly_amount: 3800, cadence: "monthly" } });
    save("nodes", nid("ndrentalinc"), { tenant: HH, kind: "income_source", label: "Rental (spare room)", props: { monthly_amount: 700, cadence: "monthly" } });

    // new tier-1 buckets: statutory, tax, insurance, bills
    const hbuckets = {
      stat: nid("ndstat"), tax: nid("ndtaxhh"), ins: nid("ndinshh"), bills: nid("ndbills"),
    };
    save("nodes", hbuckets.stat, { tenant: HH, kind: "bucket", label: "Statutory (EPF/SOCSO/EIS)", props: { bucket: 1 } });
    save("nodes", hbuckets.tax, { tenant: HH, kind: "bucket", label: "Income Tax (PCB)", props: { bucket: 1 } });
    save("nodes", hbuckets.ins, { tenant: HH, kind: "bucket", label: "Insurance (life + medical)", props: { bucket: 1 } });
    save("nodes", hbuckets.bills, { tenant: HH, kind: "bucket", label: "Bills & Subscriptions", props: { bucket: 1 } });

    // vendors
    const hv = {
      kwsp: nid("ndkwsp"), perkeso: nid("ndperkeso"), lhdn: nid("ndlhdn"),
      ge: nid("ndgreastern"), aia: nid("ndaia"), tnb: nid("ndtnb"), unifi: nid("ndunifi"),
      maxis: nid("ndmaxis"), astro: nid("ndastro"), ai: nid("ndclaudeai"),
      water: nid("ndairsel"), senheng: nid("ndsenheng"), cc: nid("ndmbbcc"),
    };
    const hvLabels = {
      kwsp: "KWSP (EPF)", perkeso: "PERKESO (SOCSO/EIS)", lhdn: "LHDN (Income Tax)",
      ge: "Great Eastern (Life)", aia: "AIA (Medical)", tnb: "TNB (Electricity)",
      unifi: "Unifi (Home Fibre)", maxis: "Maxis (Mobile)", astro: "Astro (TV)",
      ai: "Claude Pro (AI)", water: "Air Selangor (Water)", senheng: "Senheng (Installment)",
      cc: "Maybank Card (Late Fee)",
    };
    for (const k in hv) save("nodes", hv[k], { tenant: HH, kind: "vendor", label: hvLabels[k], props: {} });

    // allocation edges (income → new buckets)
    const edge = (tenant, src, dst, amount, pct) =>
      save("edges", null, pct
        ? { tenant, src_node: src, dst_node: dst, rel: "ALLOCATES_PCT", percentage: pct, cadence: "monthly" }
        : { tenant, src_node: src, dst_node: dst, rel: "ALLOCATES_FIXED", amount, cadence: "monthly" });
    edge(HH, "ndsalary1111111", hbuckets.stat, 1000);
    edge(HH, nid("ndsitisal"), hbuckets.stat, 500);
    edge(HH, "ndsalary1111111", hbuckets.tax, 350);
    edge(HH, nid("ndsitisal"), hbuckets.tax, 150);
    edge(HH, "ndsalary1111111", hbuckets.ins, 250);
    edge(HH, nid("ndsitisal"), hbuckets.ins, 200);
    edge(HH, "ndsalary1111111", hbuckets.bills, 950);
    edge(HH, nid("ndrentalinc"), "ndgroc111111111", 500); // rental helps groceries

    // spend this month (member-attributed)
    const spend = (tenant, wallet, vendor, member, amount, n) =>
      save("transactions", null, {
        tenant, wallet_node: wallet, vendor_node: vendor, member,
        amount: Math.round(amount * 100) / 100, currency: "MYR",
        occurred_at: day(n), source: n % 2 ? "telegram" : "manual", parse_confidence: 0.97,
      });
    spend(HH, hbuckets.stat, hv.kwsp, aiman, 1320, 1);
    spend(HH, hbuckets.stat, hv.perkeso, aiman, 95, 1);
    spend(HH, hbuckets.tax, hv.lhdn, aiman, 480, 1);
    spend(HH, hbuckets.ins, hv.ge, aiman, 250, 2);
    spend(HH, hbuckets.ins, hv.aia, siti, 200, 2);
    spend(HH, hbuckets.bills, hv.tnb, aiman, 245, 3);
    spend(HH, hbuckets.bills, hv.unifi, aiman, 149, 3);
    spend(HH, hbuckets.bills, hv.maxis, siti, 98, 4);
    spend(HH, hbuckets.bills, hv.astro, aiman, 99.9, 4);
    spend(HH, hbuckets.bills, hv.ai, aiman, 92, 5);
    spend(HH, hbuckets.bills, hv.water, siti, 32, 5);
    spend(HH, hbuckets.bills, hv.senheng, aiman, 180, 6);
    spend(HH, hbuckets.bills, hv.cc, aiman, 50, 7);

    // ═══ BUSINESS ════════════════════════════════════════════════════════
    const BIZ = "bizsedap2222222";
    const meiling = ensureMember(BIZ, "Mei Ling (manager)", "manager");
    const farid = ensureMember(BIZ, "Farid (owner)", "owner");
    const arun = ensureMember(BIZ, "Arun (barista)", "staff");

    relabel("ndrevenue222222", "Dine-in Revenue");
    save("nodes", nid("ndcatering"), { tenant: BIZ, kind: "income_source", label: "Catering Orders", props: { monthly_amount: 9000, cadence: "monthly" } });
    save("nodes", nid("nddelivery"), { tenant: BIZ, kind: "income_source", label: "Delivery (GrabFood/foodpanda)", props: { monthly_amount: 7000, cadence: "monthly" } });

    const bb = {
      stat: nid("ndstatbiz"), sst: nid("ndsstbiz"), ins: nid("ndinsbiz"),
      util: nid("ndutilbiz"), mkt: nid("ndmktbiz"), soft: nid("ndsoftbiz"),
    };
    save("nodes", bb.stat, { tenant: BIZ, kind: "bucket", label: "Employer Statutory (EPF/SOCSO)", props: { bucket: 1 } });
    save("nodes", bb.sst, { tenant: BIZ, kind: "bucket", label: "SST / Service Tax", props: { bucket: 1 } });
    save("nodes", bb.ins, { tenant: BIZ, kind: "bucket", label: "Business Insurance", props: { bucket: 1 } });
    save("nodes", bb.util, { tenant: BIZ, kind: "bucket", label: "Utilities & Internet", props: { bucket: 1 } });
    save("nodes", bb.mkt, { tenant: BIZ, kind: "bucket", label: "Marketing", props: { bucket: 2 } });
    save("nodes", bb.soft, { tenant: BIZ, kind: "bucket", label: "Software & AI", props: { bucket: 1 } });

    const bv = {
      kwsp: nid("ndkwspbiz"), perkeso: nid("ndperkesobiz"), kastam: nid("ndkastam"),
      allianz: nid("ndallianz"), tnb: nid("ndtnbbiz"), time: nid("ndtimebiz"),
      meta: nid("ndmetaads"), storehub: nid("ndstorehub"), aiapi: nid("ndaiapi"),
    };
    const bvLabels = {
      kwsp: "KWSP (Employer EPF)", perkeso: "PERKESO (Employer)", kastam: "Kastam/RMCD (SST)",
      allianz: "Allianz (Business)", tnb: "TNB (Commercial)", time: "TIME (Business Fibre)",
      meta: "Meta Ads", storehub: "StoreHub POS", aiapi: "Anthropic API (AI)",
    };
    for (const k in bv) save("nodes", bv[k], { tenant: BIZ, kind: "vendor", label: bvLabels[k], props: {} });

    edge(BIZ, "ndrevenue222222", bb.stat, 3200);
    edge(BIZ, "ndrevenue222222", bb.sst, 2400);
    edge(BIZ, "ndrevenue222222", bb.ins, 600);
    edge(BIZ, "ndrevenue222222", bb.util, 1800);
    edge(BIZ, "ndrevenue222222", bb.mkt, 1500);
    edge(BIZ, "ndrevenue222222", bb.soft, 700);
    // multi-stream: catering + delivery fund extra payroll / growth / suppliers
    edge(BIZ, nid("ndcatering"), "ndpayroll222222", 4000);
    edge(BIZ, nid("ndcatering"), "ndgrowth2222222", 2000);
    edge(BIZ, nid("nddelivery"), "ndsupplier22222", 3000);
    edge(BIZ, nid("nddelivery"), bb.mkt, 1000);

    spend(BIZ, bb.stat, bv.kwsp, meiling, 2800, 2);
    spend(BIZ, bb.stat, bv.perkeso, meiling, 340, 2);
    spend(BIZ, bb.sst, bv.kastam, farid, 2400, 3);
    spend(BIZ, bb.ins, bv.allianz, farid, 580, 3);
    spend(BIZ, bb.util, bv.tnb, meiling, 920, 4);
    spend(BIZ, bb.util, bv.time, meiling, 300, 4);
    spend(BIZ, bb.mkt, bv.meta, meiling, 1200, 5);
    spend(BIZ, bb.soft, bv.storehub, farid, 250, 5);
    spend(BIZ, bb.soft, bv.aiapi, arun, 180, 6);
  },
  (app) => {
    const nid = (s) => (s + "111111111111111").slice(0, 15);
    const ids = [
      "ndsitisal", "ndrentalinc", "ndstat", "ndtaxhh", "ndinshh", "ndbills",
      "ndkwsp", "ndperkeso", "ndlhdn", "ndgreastern", "ndaia", "ndtnb", "ndunifi",
      "ndmaxis", "ndastro", "ndclaudeai", "ndairsel", "ndsenheng", "ndmbbcc",
      "ndcatering", "nddelivery", "ndstatbiz", "ndsstbiz", "ndinsbiz", "ndutilbiz",
      "ndmktbiz", "ndsoftbiz", "ndkwspbiz", "ndperkesobiz", "ndkastam", "ndallianz",
      "ndtnbbiz", "ndtimebiz", "ndmetaads", "ndstorehub", "ndaiapi",
    ];
    for (const s of ids) {
      try { app.delete(app.findRecordById("nodes", nid(s))); } catch (_) { /* gone */ }
    }
    try { const r = app.findRecordById("nodes", "ndsalary1111111"); r.set("label", "Salary"); r.set("props", { monthly_amount: 6000, cadence: "monthly" }); app.save(r); } catch (_) {}
    try { const r = app.findRecordById("nodes", "ndrevenue222222"); r.set("label", "Cafe Revenue"); app.save(r); } catch (_) {}
  },
);
