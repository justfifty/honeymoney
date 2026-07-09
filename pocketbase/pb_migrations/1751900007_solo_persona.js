/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — the PERSONAL persona: one individual who also runs a small
// business. Aisha is a freelance designer + online-shop owner with FIVE income
// streams (freelance, Shopee shop, rental, dividends, content) and a realistic
// mix of personal + business expenses, statutory (self-employed), insurance, and
// AI/software subscriptions. A "household of one" — proving the same engine
// covers personal ↔ family ↔ business. Auto-applies on next PocketBase start.

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
    const now = new Date();
    const day = (n) => {
      const d = new Date(now.getFullYear(), now.getMonth(), 1 + n, 9 + (n % 9), 0, 0);
      return d.toISOString().replace("T", " ");
    };

    const PS = "psaisha33333333";
    save("tenants", PS, { kind: "household", name: "Aisha — Solo (Freelance + Shop)", base_currency: "MYR" });
    const self = save("members", "mbaisha11111111", { tenant: PS, display_name: "Aisha", role: "owner" }).id;

    // ── five income streams (personal + business combined) ───────────────
    const inc = {
      free: nid("psincfree"), shop: nid("psincshop"), rent: nid("psincrent"),
      div: nid("psincdiv"), content: nid("psinccontent"),
    };
    save("nodes", inc.free, { tenant: PS, kind: "income_source", label: "Freelance Design", props: { monthly_amount: 4500, cadence: "irregular" } });
    save("nodes", inc.shop, { tenant: PS, kind: "income_source", label: "Online Shop (Shopee)", props: { monthly_amount: 2800, cadence: "monthly" } });
    save("nodes", inc.rent, { tenant: PS, kind: "income_source", label: "Rental (studio unit)", props: { monthly_amount: 1200, cadence: "monthly" } });
    save("nodes", inc.div, { tenant: PS, kind: "income_source", label: "Dividends (ASB/stocks)", props: { monthly_amount: 400, cadence: "quarterly" } });
    save("nodes", inc.content, { tenant: PS, kind: "income_source", label: "Content (YouTube/TikTok)", props: { monthly_amount: 600, cadence: "monthly" } });

    // ── buckets across the three tiers ───────────────────────────────────
    const b = {
      rent: nid("psbrent"), stat: nid("psbstat"), ins: nid("psbins"), bills: nid("psbbills"),
      biz: nid("psbbiz"), reserve: nid("psbreserve"), invest: nid("psbinvest"),
      living: nid("psbliving"), personal: nid("psbpersonal"),
    };
    const mk = (id, label, tier, extra) => save("nodes", id, { tenant: PS, kind: "bucket", label, props: Object.assign({ bucket: tier }, extra || {}) });
    mk(b.rent, "Rent & Home", 1);
    mk(b.stat, "Statutory & Tax (self)", 1);
    mk(b.ins, "Insurance", 1);
    mk(b.bills, "Bills & Subscriptions", 1);
    mk(b.biz, "Business Costs", 1);
    mk(b.reserve, "Emergency & Tax Reserve", 2);
    mk(b.invest, "Investments", 2);
    mk(b.living, "Living & Food", 3, { default_spend: true });
    mk(b.personal, "Personal & Lifestyle", 3, { private: true });

    // goal + obligation
    save("nodes", nid("psgstudio"), { tenant: PS, kind: "goal", label: "Own Studio Space", props: { target: 50000, current: 12000 } });
    save("edges", null, { tenant: PS, src_node: b.invest, dst_node: nid("psgstudio"), rel: "CONTRIBUTES_TO", cadence: "monthly" });

    // ── vendors ──────────────────────────────────────────────────────────
    const v = {
      landlord: nid("psvrent"), lhdn: nid("psvlhdn"), kwsp: nid("psvkwsp"), perkeso: nid("psvperkeso"),
      pru: nid("psvpru"), tnb: nid("psvtnb"), unifi: nid("psvunifi"), digi: nid("psvdigi"),
      ai: nid("psvai"), adobe: nid("psvadobe"), shopeefee: nid("psvshopeefee"), meta: nid("psvmeta"),
      canva: nid("psvcanva"), worq: nid("psvworq"), grocer: nid("psvgrocer"), grab: nid("psvgrab"),
      shopee: nid("psvshopee"), stashaway: nid("psvstash"),
    };
    const vLabels = {
      landlord: "Apartment Rent", lhdn: "LHDN (Income Tax)", kwsp: "KWSP i-Saraan (voluntary)", perkeso: "PERKESO (Self-Employed)",
      pru: "Prudential (Medical)", tnb: "TNB (Electricity)", unifi: "Unifi (Fibre)", digi: "CelcomDigi (Mobile)",
      ai: "Claude Pro (AI)", adobe: "Adobe Creative Cloud", shopeefee: "Shopee Seller Fees", meta: "Meta Ads",
      canva: "Canva Pro", worq: "WORQ (Coworking)", grocer: "Jaya Grocer", grab: "GrabFood",
      shopee: "ShopeePay", stashaway: "StashAway",
    };
    for (const k in v) save("nodes", v[k], { tenant: PS, kind: "vendor", label: vLabels[k], props: {} });

    // ── allocations spread across the five income streams ────────────────
    const alloc = (src, dst, amount) => save("edges", null, { tenant: PS, src_node: src, dst_node: dst, rel: "ALLOCATES_FIXED", amount, cadence: "monthly" });
    alloc(inc.free, b.rent, 1400);
    alloc(inc.free, b.stat, 600);
    alloc(inc.free, b.reserve, 500);
    alloc(inc.free, b.living, 700);
    alloc(inc.shop, b.biz, 900);
    alloc(inc.shop, b.invest, 500);
    alloc(inc.shop, b.personal, 400);
    alloc(inc.rent, b.ins, 300);
    alloc(inc.rent, b.bills, 700);
    alloc(inc.div, b.invest, 300);
    alloc(inc.content, b.living, 300);
    alloc(inc.content, b.personal, 200);

    // ── this-month spend (all attributed to Aisha) ───────────────────────
    const spend = (wallet, vendor, amount, n) =>
      save("transactions", null, {
        tenant: PS, wallet_node: wallet, vendor_node: vendor, member: self,
        amount: Math.round(amount * 100) / 100, currency: "MYR",
        occurred_at: day(n), source: n % 2 ? "telegram" : "manual", parse_confidence: 0.96,
      });
    spend(b.rent, v.landlord, 1400, 1);
    spend(b.stat, v.lhdn, 350, 1);
    spend(b.stat, v.kwsp, 200, 2);
    spend(b.stat, v.perkeso, 25, 2);
    spend(b.ins, v.pru, 300, 2);
    spend(b.bills, v.tnb, 118, 3);
    spend(b.bills, v.unifi, 129, 3);
    spend(b.bills, v.digi, 68, 4);
    spend(b.bills, v.ai, 92, 4);
    spend(b.biz, v.adobe, 55, 4);
    spend(b.biz, v.canva, 45, 5);
    spend(b.biz, v.shopeefee, 180, 5);
    spend(b.biz, v.meta, 250, 5);
    spend(b.biz, v.worq, 350, 6);
    spend(b.living, v.grocer, 220, 6);
    spend(b.living, v.grab, 145, 7);
    spend(b.personal, v.shopee, 130, 7);
    spend(b.invest, v.stashaway, 500, 8);
  },
  (app) => {
    try { app.delete(app.findRecordById("tenants", "psaisha33333333")); } catch (_) { /* cascade removes the rest */ }
  },
);
