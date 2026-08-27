// Records / time-schedule read path: list a tenant's transactions over a date
// range and roll them up by day / week / month for spending audit + review.
// Server-side only (uses the PocketBase superuser client).

import { pbList, pbStr } from "./pocketbase";
import { redactPrivate, privateBucketIds, PRIVATE_TIER } from "./privacy";
import { deriveKind, type RecordKind } from "./recordKind";
import { visibleFilter, type Visibility } from "./attribution";
import { getHouseholdShares } from "./sharingStore";
import { redactUnshared, detailAccessCounts } from "./sharingRedact";
import { logDetailAccess } from "./sharingStore";

export interface SpendRecord {
  id: string;
  amount: number; // base currency (MYR)
  direction: "out" | "in"; // "out" = debit/spend (default), "in" = credit/money-in
  currency: string;
  occurred_at: string; // ISO
  vendor: string | null;
  source: string | null;
  note: string;
  /** Voided records are never deleted — they stay, struck through, and their
   *  removal is itself in the audit ledger. */
  voided: boolean;
  bucketId: string | null;
  bucketLabel: string | null;
  memberId: string | null;
  /** What the user originally typed, if they entered a foreign currency. */
  entered: { amount: number; currency: string; perMYR: number; rateSource: string } | null;
  /** inflow · outflow · transfer. Derived for records that predate the field. */
  kind: RecordKind;
  /** Who paid. Falls back to the legacy `member` field. Null ⇒ the household. */
  paidBy: string | null;
  /** private ⇒ only the payer sees it. Absent on old rows ⇒ shared. */
  visibility: Visibility;
  /** False ⇒ nobody stated who paid; we defaulted it. */
  attributionAsserted: boolean;
  /**
   * Stored receipt images, by filename. Fetch them through
   * `/api/attachment/<id>/<filename>` — never by building a PocketBase URL,
   * which will 401: `transactions` is superuser-only and the token stays on the
   * server. Empty on a redacted row, because the image is the detail redaction
   * exists to hide.
   */
  attachments: string[];
  /**
   * The payer asked for this record to sit outside household totals. The row is
   * still theirs and still real; it simply does not move the shared number.
   */
  excludeFromTotals: boolean;
}

export type Period = "day" | "week" | "month";

export interface PeriodGroup {
  key: string; // stable id, e.g. "2026-07-10"
  label: string; // human label, e.g. "Fri, 10 Jul"
  sortTs: number; // period-start epoch ms (desc sort)
  total: number; // sum of amounts (MYR)
  count: number;
  records: SpendRecord[];
}

interface PBTxn {
  id: string;
  amount: number;
  direction?: string;
  currency: string;
  occurred_at: string;
  source: string;
  note?: string;
  voided?: boolean;
  member?: string;
  wallet_node?: string;
  kind?: string | null;
  paid_by?: string | null;
  visibility?: string | null;
  attribution_asserted?: boolean;
  exclude_from_totals?: boolean;
  attachments?: string[] | string | null;
  raw?: { entered?: { amount: number; currency: string; perMYR: number; rateSource: string } } | null;
  expand?: { vendor_node?: { label: string }; wallet_node?: { id: string; label: string } };
}

// PocketBase stores datetimes as "YYYY-MM-DD HH:MM:SS.sssZ" — match projection.ts.
function pbTime(d: Date): string {
  return d.toISOString().replace("T", " ");
}

// Named ranges → [from, to]. "all" reaches back far enough to catch any seed.
export function rangeBounds(range: string, now = new Date()): { from: Date; to: Date } {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); // end of today
  const from = new Date(to);
  switch (range) {
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
    case "365d":
      from.setDate(from.getDate() - 365);
      break;
    case "all":
      from.setFullYear(2000, 0, 1);
      break;
    case "90d":
    default:
      from.setDate(from.getDate() - 90);
  }
  return { from, to };
}

export async function getSpendRecords(
  tenantId: string,
  from: Date,
  to: Date,
  opts: {
    includeVoided?: boolean;
    /** The member reading the list — their own private spend stays legible. */
    viewerMemberId?: string | null;
    /** Enforce the tier-3 promise. Off for the fictional demo personas. */
    redact?: boolean;
    /** Name written into the access log. The viewer's display name. */
    viewerLabel?: string | null;
    /**
     * Set false for reads that are not a person looking at a screen — an
     * export, a recomputation, a background job. A log that records the
     * server's own housekeeping as "viewed your transactions" would frighten
     * people about nothing and bury the accesses that matter.
     */
    logAccess?: boolean;
  } = {},
): Promise<SpendRecord[]> {
  const filter =
    `tenant = ${pbStr(tenantId)} && ` +
    `occurred_at >= ${pbStr(pbTime(from))} && occurred_at <= ${pbStr(pbTime(to))}` +
    // A voided record still exists — it is simply not counted. Showing it is an
    // explicit choice ("show removed"), because a deleted spend that silently
    // vanishes is exactly the behaviour an audit trail is meant to prevent.
    (opts.includeVoided ? "" : " && voided != true") +
    // Task 6's privacy stance, enforced in the QUERY rather than after it. A
    // hidden row is never fetched, so there is no filtered array anyone can
    // forget to apply. Old rows have an empty `visibility` and are matched by
    // `!= 'private'`, so nothing that was visible yesterday disappears today.
    (opts.redact ? ` && ${visibleFilter(opts.viewerMemberId)}` : "");

  const txns = await pbList<PBTxn>("transactions", {
    filter,
    sort: "-occurred_at",
    expand: "vendor_node,wallet_node",
    perPage: 500,
  });

  // Bucket totals stay intact; only the identifying detail of another member's
  // private spend is stripped. See lib/privacy.ts for why the total must stay.
  // Fetched unconditionally: the tier map below needs them regardless of
  // whether redaction is on, and it is one query either way.
  const bucketNodes = await pbList<{ id: string; kind: string; props: Record<string, unknown> | null }>(
    "nodes",
    { filter: `tenant = ${pbStr(tenantId)} && kind = 'bucket'` },
  );
  const privateIds = opts.redact ? privateBucketIds(bucketNodes) : new Set<string>();
  const bucketTier = new Map<string, number>();
  for (const b of bucketNodes) bucketTier.set(b.id, Number(b.props?.bucket) || PRIVATE_TIER);

  const rows: SpendRecord[] = txns.map((t) => ({
    id: t.id,
    amount: Number(t.amount),
    direction: (t.direction === "in" ? "in" : "out") as "out" | "in",
    currency: t.currency || "MYR",
    occurred_at: t.occurred_at,
    vendor: t.expand?.vendor_node?.label ?? null,
    source: t.source || null,
    note: t.note ?? "",
    voided: Boolean(t.voided),
    bucketId: t.wallet_node ?? null,
    bucketLabel: t.expand?.wallet_node?.label ?? null,
    memberId: t.member ?? null,
    // `paid_by` is the field named for what it holds; `member` is the older,
    // ambiguous one and is still read so no history is lost. See lib/attribution.
    paidBy: t.paid_by || t.member || null,
    kind: deriveKind({
      kind: t.kind,
      direction: t.direction,
      bucketTier: t.wallet_node ? (bucketTier.get(t.wallet_node) ?? null) : null,
    }),
    visibility: (t.visibility === "private" ? "private" : "shared") as Visibility,
    attributionAsserted: Boolean(t.attribution_asserted),
    entered: t.raw?.entered ?? null,
    // PocketBase returns a multi-file field as an array, but a single-file field
    // as a bare string — normalise, or `.map` over it iterates the characters.
    attachments: Array.isArray(t.attachments)
      ? t.attachments
      : t.attachments
        ? [t.attachments]
        : [],
    excludeFromTotals: Boolean(t.exclude_from_totals),
  }));

  const tierRedacted = redactPrivate(rows, {
    privateIds,
    viewerMemberId: opts.viewerMemberId,
    enabled: Boolean(opts.redact),
  });

  // Second pass: the payer's own per-data-type choices. See lib/sharingRedact
  // for why this is not folded into redactPrivate — different inputs, different
  // question, and a merged function could not answer "why is this row hidden?".
  if (!opts.redact) return tierRedacted;

  const shares = await getHouseholdShares(tenantId);
  const shareOpts = { shares, viewerMemberId: opts.viewerMemberId, enabled: true };

  // Logged BEFORE redaction, from the rows the viewer is actually about to
  // read. Counting after would count zero for everything hidden, which is
  // correct, and zero for everything shown, which is not — the redacted copy no
  // longer carries the payer id that says whose data it was.
  if (opts.logAccess !== false) {
    for (const [subject, count] of detailAccessCounts(tierRedacted, shareOpts, "transactions")) {
      void logDetailAccess({
        tenantId,
        subjectMemberId: subject,
        viewerMemberId: opts.viewerMemberId,
        viewerLabel: opts.viewerLabel,
        type: "transactions",
        count,
      });
    }
  }

  return redactUnshared(tierRedacted, shareOpts);
}

// Monday-based week start (local time).
function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Mon=0 … Sun=6
  x.setDate(x.getDate() - dow);
  return x;
}

function periodStart(d: Date, period: Period): Date {
  if (period === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  if (period === "week") return startOfWeek(d);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function periodLabel(start: Date, period: Period): string {
  if (period === "month") {
    return start.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
  }
  if (period === "week") {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const a = start.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
    const b = end.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
    return `${a} – ${b}`;
  }
  return start.toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" });
}

// Group records into period buckets, newest first, records within newest first.
export function groupByPeriod(records: SpendRecord[], period: Period): PeriodGroup[] {
  const groups = new Map<string, PeriodGroup>();
  for (const r of records) {
    const d = new Date(r.occurred_at);
    if (Number.isNaN(d.getTime())) continue;
    const start = periodStart(d, period);
    const key = start.toISOString();
    let g = groups.get(key);
    if (!g) {
      g = { key, label: periodLabel(start, period), sortTs: start.getTime(), total: 0, count: 0, records: [] };
      groups.set(key, g);
    }
    // A voided record is shown but never counted — it's evidence, not spending.
    // Credits (money in) are shown too but don't add to the period's spend total.
    if (!r.voided) {
      if (r.direction !== "in") g.total += r.amount;
      g.count += 1;
    }
    g.records.push(r);
  }
  const out = [...groups.values()];
  out.sort((a, b) => b.sortTs - a.sortTs);
  for (const g of out) g.total = Math.round(g.total * 100) / 100;
  return out;
}

export interface RecordsSummary {
  total: number;
  count: number;
  periods: number;
  busiest: { label: string; total: number } | null;
}

export function summarize(groups: PeriodGroup[]): RecordsSummary {
  const total = Math.round(groups.reduce((s, g) => s + g.total, 0) * 100) / 100;
  const count = groups.reduce((s, g) => s + g.count, 0);
  const busiest = groups.reduce<PeriodGroup | null>(
    (top, g) => (!top || g.total > top.total ? g : top),
    null,
  );
  return {
    total,
    count,
    periods: groups.length,
    busiest: busiest ? { label: busiest.label, total: busiest.total } : null,
  };
}
