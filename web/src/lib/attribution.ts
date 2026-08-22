// Who paid, and who may see it.
//
// Task 6 of the 2026-08-22 brief, and the two decisions it reserved for a human,
// both now made and both recorded here rather than scattered across call sites.
//
// ── DECISION 1: THE AXIS IS "WHO PAID" ─────────────────────────────────────
//
// Attribution has two independent halves — who paid for something, and who
// benefited from it — and they diverge constantly in a real household. Azlan
// pays for the children's school fees; the children benefit. Mariam buys the
// groceries; everyone eats.
//
// One axis is permitted for v1 provided the choice is deliberate, and the choice
// is WHO PAID, because it is the half that is knowable without asking. The payer
// is a fact at the moment of capture — it is whoever's card or wallet moved. The
// beneficiary is an interpretation, often a split one, and asking for it at
// capture time would put an unanswerable question in front of every coffee.
//
// The field is `paid_by` and is named for exactly that. Not `persona`, which
// describes a UI control rather than a fact; not `owner`, which implies the
// record belongs to someone rather than describing what happened.
//
// 🛑 The second axis is a SEAM, not a column. `benefited_by` deliberately does
// not exist yet — an unused field invites code to start writing it before anyone
// has decided what it means for a joint grocery shop, and then the meaning is
// whatever the first writer assumed. Adding it is one additive migration.
//
// ── DECISION 2: INDIVIDUAL-PRIVATE-BY-DEFAULT ──────────────────────────────
//
// Of the three stances the brief offers — fully transparent, individual-private
// with joint shared, or a per-record toggle — the middle one is chosen.
//
// Fully transparent makes the app unusable for the thing couples actually need
// it for: a birthday present, a personal indulgence, the small purchases that
// are nobody else's business. A per-record toggle asks a question on every
// single record, which is a tax on the common case and will be answered
// carelessly within a week.
//
// Private-by-default with a VISIBLE indicator is the one that matches how
// households already behave: shared money is shared, personal money is personal,
// and neither partner has to negotiate it per purchase. The indicator is not
// negotiable — a privacy feature nobody can see is indistinguishable from
// surveillance, because the other partner cannot tell whether something is
// hidden or simply absent.
//
// ── WHERE IT IS ENFORCED, AND A CORRECTION TO THE BRIEF ────────────────────
//
// The brief says "enforced in PocketBase collection rules, server-side —
// client-side filtering is not privacy". The intent is right and is honoured.
// The mechanism cannot be, and the reason is structural rather than an excuse:
//
// `transactions` has NULL API rules — superuser-only — and the Next.js server
// authenticates to PocketBase as that superuser and mediates every read. There
// is no per-user PocketBase session to write a collection rule against; a rule
// like `paid_by = @request.auth.id` has no auth record to evaluate. Opening the
// collection to browser sessions to make such a rule expressible would be a far
// larger privacy regression than the one it aims to prevent.
//
// So the enforcement point is THE SERVER, which is what the brief is actually
// asking for: `visibleFilter` below is applied in the data layer, before rows
// reach any component, and /api/attachment applies the same rule to bytes. The
// client never receives a hidden row to filter.

import type { RecordKind } from "./recordKind";

export type Visibility = "private" | "shared";
export type Composition = "individual" | "couple" | "family";

export interface AttributionRow {
  /** Who paid. Null ⇒ the household, not a person. */
  paidBy: string | null;
  visibility: Visibility;
  /** False ⇒ we defaulted this, nobody said it. */
  asserted: boolean;
}

/**
 * The default visibility for a new record.
 *
 * Shared unless it is personal spending by a specific person. "Personal" is the
 * tier-3 private buckets the household already defined — reusing that boundary
 * rather than inventing a second one means a household that has already told us
 * what is personal does not have to say it twice.
 *
 * An unattributed record is always shared: with nobody to be private FROM, a
 * private household record would just be a record nobody can see.
 */
export function defaultVisibility(input: {
  paidBy: string | null;
  bucketIsPrivate: boolean;
  composition: Composition;
}): Visibility {
  // A household of one has nobody to hide from, and marking their records
  // private would cost a concept for no benefit.
  if (input.composition === "individual") return "shared";
  if (!input.paidBy) return "shared";
  return input.bucketIsPrivate ? "private" : "shared";
}

/**
 * Should the attribution control render at all?
 *
 * Individual households get NO control, occupying no space and adding no tap —
 * the brief is explicit. A control with one option is not a choice, it is
 * furniture.
 */
export function showsAttribution(composition: Composition, memberCount: number): boolean {
  return composition !== "individual" && memberCount > 1;
}

/**
 * Can this viewer see this row?
 *
 * Your own records are always visible to you, including private ones — the point
 * is privacy from a partner, not from yourself. A shared record is visible to
 * the household. A private record belonging to someone else is not, and that is
 * the whole rule.
 */
export function canSee(
  row: { paidBy: string | null; visibility: Visibility },
  viewerMemberId: string | null | undefined,
): boolean {
  if (row.visibility !== "private") return true;
  if (!row.paidBy) return true; // household-level, nobody to be private from
  return row.paidBy === viewerMemberId;
}

/**
 * A PocketBase filter fragment that excludes rows this viewer may not see.
 *
 * Applied in the data layer so hidden rows never reach a component — the brief's
 * point that client-side filtering is not privacy is correct, and this is the
 * server-side answer to it. See the header on why it is not a collection rule.
 *
 * Written to be safe when `visibility` is EMPTY, which every pre-migration row
 * is: `visibility != 'private'` matches them, so nothing that was visible
 * yesterday becomes hidden today. Retroactively hiding a partner's records from
 * them would be its own kind of betrayal.
 */
export function visibleFilter(viewerMemberId: string | null | undefined): string {
  if (!viewerMemberId) {
    // No member identity (a demo view, or an admin-level read): show only what
    // is shared. Failing closed is the right direction for a privacy filter.
    return `visibility != 'private'`;
  }
  const id = viewerMemberId.replace(/'/g, "\\'");
  return `(visibility != 'private' || paid_by = '${id}' || paid_by = '')`;
}

/**
 * Does a set of records net to zero at household level?
 *
 * A partner-to-partner repayment is a `transfer` between two members: RM200
 * leaves Azlan and arrives with Mariam. The household is neither richer nor
 * poorer, and any figure that treats it as spending double-counts a debt that
 * was already recorded when it was incurred.
 *
 * Used by the checks to prove the invariant rather than assume it.
 */
export function householdNet(rows: { kind: RecordKind; amount: number }[]): number {
  return rows.reduce((sum, r) => {
    if (r.kind === "transfer") return sum; // moves within, changes nothing
    return sum + (r.kind === "inflow" ? r.amount : -r.amount);
  }, 0);
}
