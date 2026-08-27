// Analysis that runs in the browser, over the household's own copy.
//
// This is the half of "offline" that was missing. Receipt capture already
// worked with no network; understanding what you had captured did not, because
// every figure came from a server round trip. With a local snapshot on the
// device (lib/localVault.ts), the arithmetic can happen here.
//
// ── WHAT IS COMPUTED HERE, AND WHAT IS DELIBERATELY NOT ────────────────────
//
// Computed locally: totals, money in versus out, spend by bucket, by month, by
// merchant, and the trend. These are sums over rows. There is exactly one
// correct answer and it does not drift.
//
// NOT computed locally: the H-Score. It could be — lib/hscore.ts is pure and
// imports nothing, so `computeHScore` would run here unchanged. The problem is
// upstream of it: deriving `ScoreInputs` means amortising annual bills across
// twelve months, resolving bucket tiers, reading the household's own privacy
// cap, and applying seven-day band hysteresis. Reimplementing that in a second
// place guarantees the two implementations drift, and a score that says 62 on
// the dashboard and 58 offline is worse than a score that is honestly absent —
// it makes the user distrust both.
//
// So offline shows the LAST COMPUTED score, with the date it was computed, and
// says plainly that it recomputes when the connection returns. One
// implementation, one number, and the staleness stated rather than hidden.

export interface LocalTxn {
  id: string;
  amount: number;
  direction?: string;
  /** inflow | outflow | transfer. See lib/recordKind.ts — the third one matters. */
  kind?: string;
  currency?: string;
  occurred_at: string;
  note?: string;
  voided?: boolean;
  wallet_node?: string;
  paid_by?: string;
  member?: string;
  exclude_from_totals?: boolean;
  expand?: { vendor_node?: { label?: string }; wallet_node?: { label?: string } };
  vendor_node?: string;
}

export interface LocalBucket {
  id: string;
  label: string;
  total: number;
  count: number;
}

export interface LocalMonth {
  key: string;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
  count: number;
}

export interface LocalAnalysis {
  /** When the snapshot itself was taken — the honest "as of". */
  exportedAt: string | null;
  from: string | null;
  to: string | null;
  transactions: number;
  voided: number;
  excluded: number;
  totalIn: number;
  totalOut: number;
  /**
   * Money moved between the household's own pockets — savings deposits and
   * partner-to-partner settling. Reported as its own figure because it is
   * neither income nor expenditure, and folding it into either is the mistake
   * this field exists to make impossible.
   */
  moved: number;
  net: number;
  buckets: LocalBucket[];
  months: LocalMonth[];
  topMerchants: { label: string; total: number; count: number }[];
  /** The most recent server-computed score in the snapshot, with its date. */
  lastScore: { score: number; band: string; at: string } | null;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function monthKey(iso: string): string {
  return String(iso).slice(0, 7);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return Number.isNaN(d.getTime())
    ? key
    : d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/**
 * Roll a local snapshot up into the figures a person actually reads.
 *
 * Voided rows are counted separately and excluded from every total — the same
 * rule the server applies, and the reason it is stated in the output rather
 * than silently applied is that "why is my total different from my bank" is the
 * first question anybody asks of a budgeting app.
 *
 * `exclude_from_totals` is honoured too, so the offline household total matches
 * the online one instead of quietly disagreeing with it by the amount somebody
 * deliberately took out.
 */
export function analyseLocal(snapshot: {
  exportedAt?: string;
  transactions?: unknown[];
  nodes?: unknown[];
  hscoreSnapshots?: unknown[];
}): LocalAnalysis {
  const txns = (snapshot.transactions ?? []) as LocalTxn[];
  const nodes = (snapshot.nodes ?? []) as { id: string; kind?: string; label?: string }[];

  const labelOf = new Map(nodes.map((n) => [n.id, n.label ?? ""]));

  let totalIn = 0;
  let totalOut = 0;
  let moved = 0;
  let voided = 0;
  let excluded = 0;
  let from: string | null = null;
  let to: string | null = null;

  const buckets = new Map<string, LocalBucket>();
  const months = new Map<string, LocalMonth>();
  const merchants = new Map<string, { total: number; count: number }>();

  for (const t of txns) {
    if (t.voided) {
      voided++;
      continue;
    }
    if (t.exclude_from_totals) {
      excluded++;
      continue;
    }

    const amount = num(t.amount);
    const isIn = t.direction === "in";

    // Tracked before the transfer branch below returns: the period covered is a
    // fact about every record, and a week in which somebody only moved money to
    // savings still happened.
    const when = String(t.occurred_at ?? "");
    if (when) {
      if (!from || when < from) from = when;
      if (!to || when > to) to = when;
    }

    // ── TRANSFERS ARE NEITHER IN NOR OUT ──────────────────────────────────
    //
    // A savings deposit sits behind the `+` button, because putting money away
    // feels like a plus, but it is a TRANSFER: the household moved RM500 from
    // one pocket to another and is not richer for it. Counting it as income
    // inflates every ratio built on income — savings rate, essential burden,
    // debt service, all of them — and counting it as spending would say the
    // money is gone when you still have it.
    //
    // This module split purely on `direction` and so counted savings as money
    // in. lib/attribution.ts householdNet had the rule right on the server; the
    // local analysis did not, which meant the offline totals disagreed with the
    // online ones by exactly the amount somebody had saved.
    const kind = t.kind ?? (isIn ? "inflow" : "outflow");
    if (kind === "transfer") {
      moved += amount;
      // Still counted per bucket below, because "how much went into Savings" is
      // a real question — it is only the household IN/OUT totals it must stay
      // out of.
      if (t.wallet_node) {
        const id = t.wallet_node;
        const b = buckets.get(id) ?? {
          id,
          label: t.expand?.wallet_node?.label || labelOf.get(id) || "Unlabelled",
          total: 0,
          count: 0,
        };
        b.total += amount;
        b.count++;
        buckets.set(id, b);
      }
      continue;
    }

    if (isIn) totalIn += amount;
    else totalOut += amount;

    // Buckets, spend only. An inflow filed against a bucket is money arriving,
    // not money spent there, and adding it would make the bucket read as
    // cheaper than it is.
    if (!isIn && t.wallet_node) {
      const id = t.wallet_node;
      const b = buckets.get(id) ?? {
        id,
        label: t.expand?.wallet_node?.label || labelOf.get(id) || "Unlabelled",
        total: 0,
        count: 0,
      };
      b.total += amount;
      b.count++;
      buckets.set(id, b);
    }

    const mk = monthKey(when);
    if (mk) {
      const m = months.get(mk) ?? {
        key: mk,
        label: monthLabel(mk),
        inflow: 0,
        outflow: 0,
        net: 0,
        count: 0,
      };
      if (isIn) m.inflow += amount;
      else m.outflow += amount;
      m.net = m.inflow - m.outflow;
      m.count++;
      months.set(mk, m);
    }

    const vendor = t.expand?.vendor_node?.label || (t.vendor_node ? labelOf.get(t.vendor_node) : "");
    if (!isIn && vendor) {
      const v = merchants.get(vendor) ?? { total: 0, count: 0 };
      v.total += amount;
      v.count++;
      merchants.set(vendor, v);
    }
  }

  // The most recent score the SERVER computed, carried in the snapshot. See the
  // header on why this is read rather than recalculated.
  let lastScore: LocalAnalysis["lastScore"] = null;
  const snaps = (snapshot.hscoreSnapshots ?? []) as {
    score?: unknown;
    band?: unknown;
    created?: unknown;
    computed_at?: unknown;
  }[];
  if (snaps.length) {
    const newest = [...snaps].sort((a, b) =>
      String(b.created ?? b.computed_at ?? "").localeCompare(String(a.created ?? a.computed_at ?? "")),
    )[0];
    const score = Number(newest.score);
    if (Number.isFinite(score)) {
      lastScore = {
        score,
        band: String(newest.band ?? ""),
        at: String(newest.created ?? newest.computed_at ?? ""),
      };
    }
  }

  return {
    exportedAt: snapshot.exportedAt ?? null,
    from,
    to,
    transactions: txns.length,
    voided,
    excluded,
    totalIn,
    totalOut,
    moved,
    net: totalIn - totalOut,
    buckets: [...buckets.values()].sort((a, b) => b.total - a.total),
    months: [...months.values()].sort((a, b) => b.key.localeCompare(a.key)).slice(0, 12),
    topMerchants: [...merchants.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10),
    lastScore,
  };
}
