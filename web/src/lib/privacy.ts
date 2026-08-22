// The privacy promise on bucket 3, enforced rather than merely stated.
//
// The 3-bucket method makes tier 1 (Must-paid) deliberately shared — the whole
// point is that nobody in the household has to guess what still has to be paid.
// Tier 3 is the opposite promise: personal money stays personal. Until now that
// promise lived only in copy (i18n "try.honey.spend", the guide, COPILOT_SYSTEM);
// nothing stopped a partner from reading the vendor list.
//
// What stays visible: the bucket TOTAL. The Sankey, the projection and the money
// health score all balance on it, and a hidden total would turn "transparency
// where it helps" into a household that can't see its own plan.
//
// What becomes private: the line item — which vendor, the note, and who logged it.
// That is the part that turns a shared budget into surveillance.
//
// Server-only (the caller resolves viewerMemberId from the session context).

export const PRIVATE_TIER = 3;

/** The placeholder a redacted vendor collapses to. Rendered with a 🔒 by the UI. */
export const PRIVATE_LABEL = "Personal";

/** A synthetic node id for the collapsed "Personal" vendor in graph views. */
export const PRIVATE_VENDOR_ID = "private";

interface TierNode {
  id: string;
  kind: string;
  props: Record<string, unknown> | null;
}

/** Bucket node ids whose tier is private (props.bucket = 3, the default). */
export function privateBucketIds(nodes: TierNode[]): Set<string> {
  return new Set(
    nodes
      .filter((n) => n.kind === "bucket" && (Number(n.props?.bucket) || PRIVATE_TIER) === PRIVATE_TIER)
      .map((n) => n.id),
  );
}

/** Same, from the tier already resolved on a MoneyView bucket. */
export function privateBucketIdsFromTiers(buckets: { bucket_id: string; tier: number }[]): Set<string> {
  return new Set(buckets.filter((b) => b.tier === PRIVATE_TIER).map((b) => b.bucket_id));
}

export interface RedactOpts {
  privateIds: Set<string>;
  /** The member doing the viewing. Their own rows are never redacted. */
  viewerMemberId?: string | null;
  /**
   * Off for demo tenants: the seeded personas are fictional, and the vendor
   * detail under every bucket is exactly what /graph is there to show. Flip this
   * to `true` at the call sites if the public demo should demonstrate the lock
   * instead of the full graph.
   */
  enabled: boolean;
}

/** Is this row someone else's private-bucket spend, from the viewer's seat? */
export function isRedacted(
  row: { bucketId?: string | null; memberId?: string | null },
  opts: RedactOpts,
): boolean {
  if (!opts.enabled) return false;
  if (!row.bucketId || !opts.privateIds.has(row.bucketId)) return false;
  // An unattributed row (no member) belongs to the household, not to a person —
  // there is no one whose privacy would be breached, so it stays legible.
  if (!row.memberId) return false;
  return row.memberId !== opts.viewerMemberId;
}

export interface Redactable {
  bucketId?: string | null;
  memberId?: string | null;
  vendor?: string | null;
  note?: string;
  /** Filenames of stored receipt images. Redaction empties this — see below. */
  attachments?: string[];
}

/**
 * Strip the identifying detail from another member's private-bucket rows while
 * leaving the amount, date and bucket intact — so totals still reconcile.
 *
 * `attachments` is emptied rather than kept, because a receipt image IS the
 * vendor and the line items: showing a thumbnail of it beside the word
 * "Personal" would hand back in one glance everything the other three fields
 * are being cleared to protect. The bytes are refused separately and
 * server-side by /api/attachment — emptying the array here is what stops the
 * UI offering a link the user would only be denied on, not the access control
 * itself. Both are required; neither substitutes for the other.
 */
export function redactPrivate<T extends Redactable>(rows: T[], opts: RedactOpts): T[] {
  if (!opts.enabled) return rows;
  return rows.map((r) =>
    isRedacted(r, opts)
      ? { ...r, vendor: PRIVATE_LABEL, note: "", memberId: null, attachments: [] }
      : r,
  );
}

/**
 * Collapse per-vendor spend inside private buckets into a single "Personal"
 * entry per bucket. Used by the graph read paths, where a vendor breakdown under
 * a private bucket would leak exactly what redactPrivate() hides in the lists.
 *
 * Spend that belongs to the viewer stays itemised; only other members' spend is
 * folded in. Bucket totals are preserved by construction (nothing is dropped).
 */
export function collapsePrivateVendors<T extends { bucketId: string; vendorId: string; vendorLabel: string; amount: number }>(
  rows: T[],
  opts: RedactOpts & { isOtherMember?: (row: T) => boolean },
): T[] {
  if (!opts.enabled) return rows;

  const kept: T[] = [];
  const folded = new Map<string, T>();

  for (const r of rows) {
    const isOther = opts.isOtherMember ? opts.isOtherMember(r) : true;
    if (!opts.privateIds.has(r.bucketId) || !isOther) {
      kept.push(r);
      continue;
    }
    const existing = folded.get(r.bucketId);
    if (existing) {
      existing.amount += r.amount;
    } else {
      folded.set(r.bucketId, {
        ...r,
        vendorId: `${PRIVATE_VENDOR_ID}:${r.bucketId}`,
        vendorLabel: PRIVATE_LABEL,
      });
    }
  }

  return [...kept, ...folded.values()].sort((a, b) => b.amount - a.amount);
}
