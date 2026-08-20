/// <reference path="../pb_data/types.d.ts" />
// HoneyMoney — the COUPLE persona replaces the business persona.
//
// The demo used to arc personal → family → business, which asked judges and
// first-time users to hold two different products in their head. The arc is now
// individual → COUPLE → family: one product, one 3-bucket model, three sizes of
// the same household. The business tier is a roadmap item again, not a second
// app shipped alongside the first.
//
//   individual  Aisha, freelancer + shop     (1751900007_solo_persona.js)
//   couple      Nadia & Faiz                 (here)
//   family      the Rahmans                  (1751900001 + 1751900003)
//
// The couple is the wedge: two incomes funding one set of shared obligations,
// and two people who each keep money that is nobody else's business. Nothing in
// the schema changes to model it — it is the same income_source → ALLOCATES →
// bucket walk the other two personas run.
//
// The privacy promise is seeded literally: BOTH partners get a tier-3 bucket
// flagged `private`, both are funded, and both carry real spend. See
// web/src/lib/privacy.ts — a tier-3 bucket keeps its TOTAL visible to the
// household while the vendor line items stay with their owner.
//
// Three months of deterministic history ending today (no RNG, so every clone is
// identical), which also puts the H-Score's 90-day window and its 20-txn/30-day
// confidence gate on real data rather than a stub.

migrate(
  (app) => {
    const nid = (s) => (s + "000000000000000").slice(0, 15);
    const save = (col, id, data) => {
      const c = app.findCollectionByNameOrId(col);
      const rec = new Record(c);
      if (id) rec.set("id", id);
      for (const k in data) rec.set(k, data[k]);
      app.save(rec);
      return rec;
    };

    // ── retire the business tenant ───────────────────────────────────────
    // Cascade takes its members, nodes, edges and transactions with it, so the
    // rows seeded by 1751900004_business_staff.js and the business half of
    // 1751900006_realistic_finance.js go too. Those migrations are left intact:
    // rewriting applied history would not re-run on any existing install, and
    // they document how the one engine served a business tenant unchanged.
    try {
      app.delete(app.findRecordById("tenants", "bizsedap2222222"));
    } catch (_) {
      /* fresh database, or already retired */
    }

    const CP = "cprahman2222222";
    save("tenants", CP, { kind: "household", name: "Nadia & Faiz — Couple", base_currency: "MYR" });

    const nadia = save("members", "mbnadia11111111", {
      tenant: CP, display_name: "Nadia", role: "owner", access_role: "owner",
    }).id;
    const faiz = save("members", "mbfaiz111111111", {
      tenant: CP, display_name: "Faiz", role: "member", access_role: "adult",
    }).id;

    // ── income: two salaries + one side gig ──────────────────────────────
    const inc = { nadia: nid("cpincnadia"), faiz: nid("cpincfaiz"), side: nid("cpincside") };
    save("nodes", inc.nadia, {
      tenant: CP, kind: "income_source", label: "Nadia — Salary (Marketing)",
      props: { monthly_amount: 5200, cadence: "monthly", member: nadia },
    });
    save("nodes", inc.faiz, {
      tenant: CP, kind: "income_source", label: "Faiz — Salary (QA Engineer)",
      props: { monthly_amount: 4300, cadence: "monthly", member: faiz },
    });
    save("nodes", inc.side, {
      tenant: CP, kind: "income_source", label: "Faiz — Weekend Photography",
      props: { monthly_amount: 800, cadence: "irregular", member: faiz },
    });

    // ── buckets: 1 must-paid · 2 savings · 3 spendings (two of them private) ─
    const b = {
      rent: nid("cpbrent"), stat: nid("cpbstat"), ins: nid("cpbins"),
      bills: nid("cpbbills"), car: nid("cpbcar"),
      emerg: nid("cpbemerg"), house: nid("cpbhouse"),
      groc: nid("cpbgroc"), pnadia: nid("cpbpnadia"), pfaiz: nid("cpbpfaiz"),
    };
    const mk = (id, label, tier, extra) =>
      save("nodes", id, { tenant: CP, kind: "bucket", label, props: Object.assign({ bucket: tier }, extra || {}) });
    mk(b.rent, "Rent & Home", 1);
    mk(b.stat, "Statutory & Tax", 1);
    mk(b.ins, "Insurance & Takaful", 1);
    mk(b.bills, "Bills & Subscriptions", 1);
    mk(b.car, "Car & Transport", 1);
    mk(b.emerg, "Emergency Fund", 2);
    mk(b.house, "House Deposit", 2);
    mk(b.groc, "Groceries & Eating Out", 3, { default_spend: true });
    // The two buckets the whole couples story rests on. The tier alone already
    // makes them private to lib/privacy.ts; the flag records the intent for
    // anyone reading the seed.
    mk(b.pnadia, "Personal — Nadia", 3, { private: true, member: nadia });
    mk(b.pfaiz, "Personal — Faiz", 3, { private: true, member: faiz });

    // ── the shared goal both salaries feed ───────────────────────────────
    save("nodes", nid("cpghouse"), {
      tenant: CP, kind: "goal", label: "House Deposit",
      props: { target: 60000, current: 14500 },
    });
    save("edges", null, {
      tenant: CP, src_node: b.house, dst_node: nid("cpghouse"),
      rel: "CONTRIBUTES_TO", cadence: "monthly",
    });

    // ── vendors ──────────────────────────────────────────────────────────
    const vLabels = {
      landlord: "Condo Rent (Setapak)", kwsp: "KWSP (EPF)", perkeso: "PERKESO (SOCSO + EIS)",
      lhdn: "LHDN (PCB)", etiqa: "Etiqa Takaful", aia: "AIA Medical Card",
      tnb: "TNB (Electricity)", air: "Air Selangor", unifi: "Unifi (Fibre)",
      celcom: "CelcomDigi (Mobile)", netflix: "Netflix", spotify: "Spotify Duo",
      carloan: "Perodua Myvi (Loan)", petron: "Petron", tng: "Touch n Go (Tol)",
      lotus: "Lotus's", speedmart: "99 Speedmart", grabfood: "GrabFood",
      mamak: "Kopitiam / Mamak", zus: "ZUS Coffee",
      shopee: "ShopeePay", sephora: "Sephora", watsons: "Watsons",
      decathlon: "Decathlon", steam: "Steam", stashaway: "StashAway", versa: "Versa",
    };
    const v = {};
    for (const key in vLabels) {
      v[key] = nid("cpv" + key);
      save("nodes", v[key], { tenant: CP, kind: "vendor", label: vLabels[key], props: {} });
    }

    // ── allocations — who funds what, out of which income ────────────────
    // Rent splits down the middle; statutory tracks each salary; the car sits
    // with Faiz because it is his loan; each partner funds their own tier-3
    // bucket, which is what makes the privacy symmetric rather than granted.
    const alloc = (src, dst, amount) =>
      save("edges", null, {
        tenant: CP, src_node: src, dst_node: dst,
        rel: "ALLOCATES_FIXED", amount, cadence: "monthly",
      });

    // Nadia — RM 5,200 gross
    alloc(inc.nadia, b.stat, 757); // EPF 572 + SOCSO 25 + EIS 10 + PCB 150
    alloc(inc.nadia, b.rent, 900);
    alloc(inc.nadia, b.ins, 180);
    alloc(inc.nadia, b.bills, 280);
    alloc(inc.nadia, b.car, 300);
    alloc(inc.nadia, b.groc, 700);
    alloc(inc.nadia, b.emerg, 500);
    alloc(inc.nadia, b.house, 700);
    alloc(inc.nadia, b.pnadia, 600);

    // Faiz — RM 4,300 gross
    alloc(inc.faiz, b.stat, 562); // EPF 473 + SOCSO 21 + EIS 9 + PCB 60
    alloc(inc.faiz, b.rent, 900);
    alloc(inc.faiz, b.ins, 150);
    alloc(inc.faiz, b.bills, 200);
    alloc(inc.faiz, b.car, 550);
    alloc(inc.faiz, b.groc, 500);
    alloc(inc.faiz, b.house, 500);
    alloc(inc.faiz, b.pfaiz, 600);

    // Faiz — side gig RM 800
    alloc(inc.side, b.emerg, 300);
    alloc(inc.side, b.groc, 300);
    alloc(inc.side, b.pfaiz, 200);

    // ── three months of history, ending today ────────────────────────────
    const now = new Date();
    const fmt = (d) => d.toISOString().replace("T", " ");
    // Day `dom` of the month `m` months back. Returns null when that lands in
    // the future, so a migration run on the 3rd doesn't seed spend that hasn't
    // happened yet.
    const at = (m, dom, hour) => {
      const d = new Date(now.getFullYear(), now.getMonth() - m, dom, hour || 12, 0, 0);
      return d > now ? null : d;
    };
    const spend = (wallet, vendor, member, amount, when) => {
      if (!when) return;
      save("transactions", null, {
        tenant: CP, wallet_node: wallet, vendor_node: vendor, member,
        amount: Math.round(amount * 100) / 100, direction: "out",
        currency: "MYR", occurred_at: fmt(when),
        source: when.getDate() % 3 === 0 ? "manual" : "telegram",
        parse_confidence: 0.95,
      });
    };

    for (let m = 2; m >= 0; m--) {
      const k = 2 - m; // 0 = oldest month; bills and groceries drift up with it

      // fixed monthly obligations (tier 1) — the part nobody has to guess at
      spend(b.rent, v.landlord, nadia, 1800, at(m, 1, 9));
      spend(b.stat, v.kwsp, nadia, 572, at(m, 1, 10));
      spend(b.stat, v.kwsp, faiz, 473, at(m, 1, 10));
      spend(b.stat, v.perkeso, nadia, 35, at(m, 1, 10));
      spend(b.stat, v.perkeso, faiz, 30, at(m, 1, 10));
      spend(b.stat, v.lhdn, nadia, 150, at(m, 2, 10));
      spend(b.stat, v.lhdn, faiz, 60, at(m, 2, 10));
      spend(b.ins, v.etiqa, faiz, 165, at(m, 3, 11));
      spend(b.ins, v.aia, nadia, 168, at(m, 3, 11));
      spend(b.car, v.carloan, faiz, 486, at(m, 5, 9));
      spend(b.bills, v.tnb, nadia, 132 + k * 9, at(m, 6, 20));
      spend(b.bills, v.air, nadia, 28, at(m, 6, 20));
      spend(b.bills, v.unifi, faiz, 139, at(m, 7, 21));
      spend(b.bills, v.celcom, faiz, 78, at(m, 7, 21));
      spend(b.bills, v.netflix, nadia, 55, at(m, 9, 22));
      spend(b.bills, v.spotify, faiz, 24.9, at(m, 9, 22));

      // savings — the transfers that actually happened, not just the plan
      spend(b.house, v.stashaway, nadia, 1200, at(m, 2, 14));
      spend(b.emerg, v.versa, faiz, 800, at(m, 2, 14));

      // groceries & eating out (tier 3, shared) — the bucket that runs hot
      const grocDays = [4, 8, 12, 16, 20, 24, 27];
      const grocVendors = [v.lotus, v.speedmart, v.lotus, v.speedmart, v.lotus, v.speedmart, v.lotus];
      for (let i = 0; i < grocDays.length; i++) {
        spend(b.groc, grocVendors[i], i % 2 ? faiz : nadia, 96 + i * 11 + k * 14, at(m, grocDays[i], 18));
      }
      const eatDays = [3, 7, 11, 15, 19, 23, 26, 29];
      const eatVendors = [v.grabfood, v.mamak, v.zus, v.grabfood, v.mamak, v.zus, v.grabfood, v.mamak];
      for (let i = 0; i < eatDays.length; i++) {
        spend(b.groc, eatVendors[i], i % 2 ? nadia : faiz, 22 + (i % 4) * 13 + k * 4, at(m, eatDays[i], 13));
      }

      // transport
      spend(b.car, v.petron, faiz, 140 + k * 8, at(m, 10, 8));
      spend(b.car, v.petron, faiz, 135 + k * 8, at(m, 22, 8));
      spend(b.car, v.tng, nadia, 60, at(m, 13, 8));

      // ── the private buckets — each partner's own money ──────────────────
      // Seeded on BOTH sides on purpose: a privacy feature only one person gets
      // is not privacy, it is an exception. Redaction is symmetric, so Nadia
      // sees a total under "Personal — Faiz" and no vendors, and Faiz sees the
      // mirror image of that for hers.
      spend(b.pnadia, v.sephora, nadia, 189 + k * 12, at(m, 6, 15));
      spend(b.pnadia, v.watsons, nadia, 76, at(m, 14, 15));
      spend(b.pnadia, v.shopee, nadia, 122 + k * 9, at(m, 21, 21));
      spend(b.pfaiz, v.steam, faiz, 98, at(m, 8, 22));
      spend(b.pfaiz, v.decathlon, faiz, 215 + k * 10, at(m, 17, 16));
      spend(b.pfaiz, v.shopee, faiz, 143, at(m, 25, 21));
    }
  },
  (app) => {
    // Down: drop the couple. The business tenant is NOT recreated here — the
    // seeds that built it are still on disk, so a full down-migration past this
    // point rebuilds it from those.
    try {
      app.delete(app.findRecordById("tenants", "cprahman2222222")); // cascade removes the rest
    } catch (_) {
      /* already gone */
    }
  },
);
