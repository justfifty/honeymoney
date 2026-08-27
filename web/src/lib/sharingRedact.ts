// Applying the per-data-type sharing choices to rows that have already been
// fetched — the second of two redaction passes, and deliberately not merged
// with the first.
//
// lib/privacy.ts redacts by BUCKET TIER: a tier-3 spend by another member loses
// its vendor and note. That rule is about what a bucket means, it applies to a
// household that has never opened the sharing screen, and it stays.
//
// This pass redacts by the payer's own DECISION, whatever bucket it is in.
// Someone who has not shared `transactions` has their groceries redacted too,
// not only their personal spending — because the promise the switch makes is
// "my purchases are mine", and a rule that quietly exempted tier 1 would be a
// promise with a hole in it that the person could not see.
//
// The two compose: a row survives only what both allow. Running them as one
// function was tempting and wrong, because their inputs differ (bucket tiers vs
// member decisions) and their failure modes differ — collapsing them would make
// it impossible to answer "why is this row hidden?", which is the first question
// asked when a household thinks something is broken.
//
// ── WHY REDACT AND NOT DROP ────────────────────────────────────────────────
//
// A hidden row keeps its amount, its date and its bucket, and loses everything
// that identifies it. Dropping it entirely would be simpler and is the wrong
// trade: household totals are computed from these rows, and a total that
// silently omits a partner's spending is a number two people will argue about
// while both believing the app. The person's privacy is in the DETAIL. The
// arithmetic is the household's.
//
// The exception is `excludeFromTotals`, which the payer sets per record. That
// one really does leave the arithmetic — see the migration for why a payer
// sometimes needs the total itself not to move.

import { PRIVATE_LABEL } from "./privacy";
import { canSeeShared, type ShareMap, type ShareType } from "./sharing";

export interface ShareRedactable {
  /** Who paid. Null ⇒ the household, and nothing here applies. */
  paidBy?: string | null;
  memberId?: string | null;
  vendor?: string | null;
  note?: string;
  bucketLabel?: string | null;
  attachments?: string[];
  excludeFromTotals?: boolean;
}

export interface ShareRedactOpts {
  /** Every member's answer sheet, keyed by member id. */
  shares: Map<string, ShareMap>;
  viewerMemberId?: string | null;
  /** Off for the fictional demo personas, as with redactPrivate. */
  enabled: boolean;
}

/** Resolve one member's map, defaulting closed for a member with no rows. */
function mapFor(opts: ShareRedactOpts, memberId: string): ShareMap | null {
  return opts.shares.get(memberId) ?? null;
}

/**
 * Can the viewer see this data type belonging to this payer?
 *
 * A member with NO stored decisions is not an error and not an exception: they
 * get the module defaults, which is what `canSeeShared` does when handed an
 * empty map. Written as an explicit null check rather than `?? {}` so that a
 * missing map can never be mistaken for a permissive one.
 */
export function sharesWith(
  opts: ShareRedactOpts,
  payerId: string | null | undefined,
  type: ShareType,
): boolean {
  if (!opts.enabled) return true;
  if (!payerId) return true; // household money — nobody to be private from
  if (payerId === opts.viewerMemberId) return true;
  const map = mapFor(opts, payerId);
  if (!map) {
    // No rows at all. Fall through to the defaults by asking the pure rule with
    // an empty-but-typed map, rather than inventing an answer here.
    return canSeeShared({} as ShareMap, type, payerId, opts.viewerMemberId);
  }
  return canSeeShared(map, type, payerId, opts.viewerMemberId);
}

/**
 * Apply `transactions`, `categories` and `documents` to a list of records.
 *
 * Three switches, three different strips, applied independently — a member who
 * shares categories but not transactions keeps their bucket label and loses
 * their merchant, which is exactly the middle position the eight-type model
 * exists to make expressible.
 */
export function redactUnshared<T extends ShareRedactable>(
  rows: T[],
  opts: ShareRedactOpts,
): T[] {
  if (!opts.enabled) return rows;
  return rows.map((r) => {
    const payer = r.paidBy ?? r.memberId ?? null;
    if (!payer || payer === opts.viewerMemberId) return r;

    let out = r;
    if (!sharesWith(opts, payer, "transactions")) {
      out = { ...out, vendor: PRIVATE_LABEL, note: "", attachments: [] };
    }
    if (!sharesWith(opts, payer, "documents")) {
      out = { ...out, attachments: [] };
    }
    if (!sharesWith(opts, payer, "categories")) {
      // The label goes, the bucket id stays. Totals per bucket still compute;
      // the viewer simply cannot read which bucket is which for this person.
      out = { ...out, bucketLabel: null };
    }
    return out;
  });
}

/**
 * Rows that count towards a household total.
 *
 * Two exclusions, and only two. A record the payer explicitly excluded, and
 * nothing else — an unshared row still counts, because hiding the detail was
 * always the promise and quietly changing the arithmetic was never part of it.
 */
export function countsTowardsHousehold<T extends ShareRedactable>(row: T): boolean {
  return row.excludeFromTotals !== true;
}

/**
 * Which of these rows would be logged as a detail access, and for whom.
 *
 * Returns subject → count, so the caller can write one log line per subject
 * rather than one per row. A partner opening a month of records should produce
 * one entry saying "viewed 34 transactions", not thirty-four entries — a log
 * that floods is a log that hides things.
 */
export function detailAccessCounts<T extends ShareRedactable>(
  rows: T[],
  opts: ShareRedactOpts,
  type: ShareType,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!opts.enabled) return out;
  for (const r of rows) {
    const payer = r.paidBy ?? r.memberId ?? null;
    if (!payer || payer === opts.viewerMemberId) continue;
    if (!sharesWith(opts, payer, type)) continue;
    out.set(payer, (out.get(payer) ?? 0) + 1);
  }
  return out;
}
