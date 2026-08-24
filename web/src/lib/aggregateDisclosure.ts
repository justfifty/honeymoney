// Small-cell suppression for anything reported to an employer or a sponsor.
//
// docs/LOI_TEMPLATE.md §5 promises participating employers that aggregates are
// reported only for groups of 10 or more. This module exists so that promise is
// enforced by a function rather than remembered by a person, because the failure
// mode is quiet: nobody reviewing a dashboard notices that one of the bars is
// built from three people.
//
// THE ATTACK THIS DEFENDS AGAINST is not a hacker, it is arithmetic done by a
// manager. In a team of six, "one participant is in financial difficulty"
// identifies that person to everyone who can count. In a team of sixty split by
// department and age band, the same thing happens in a cell nobody thought of.
// Anonymised does not mean "the name column was removed"; it means the reader
// cannot work out who, and small groups defeat that on their own.
//
// Nothing consumes this yet — employer reporting is not built. It is here first
// on purpose: the rule is cheaper to honour before the feature exists than to
// retrofit into a dashboard someone has already shown a customer.

/**
 * The floor, from the LOI. Changing this number changes a contractual promise
 * to every pilot employer, so it is not a tuning parameter — a smaller value
 * requires re-issuing the LOI, not an edit here.
 */
export const MIN_COHORT = 10;

/** Withheld cells say WHY, so a reader does not read absence as zero. */
export const SUPPRESSED = "withheld — fewer than 10 participants" as const;

export type Reported<T> = { ok: true; value: T } | { ok: false; reason: typeof SUPPRESSED };

/**
 * Report a figure only if the group behind it is big enough.
 *
 * Withheld ENTIRELY, never rounded, blurred, bucketed or labelled "small
 * sample". Those all leak: a rounded figure over a known headcount is often
 * invertible, and "small sample" tells the reader the group is small, which is
 * itself the fact that identifies people in a team of six.
 */
export function report<T>(value: T, cohortSize: number): Reported<T> {
  if (!Number.isFinite(cohortSize) || cohortSize < MIN_COHORT) {
    return { ok: false, reason: SUPPRESSED };
  }
  return { ok: true, value };
}

/**
 * Apply the floor across a whole breakdown — by department, site, age band,
 * grade, or any combination.
 *
 * Takes the cohort size per group rather than inferring it from the rows,
 * because the denominator that matters is how many PEOPLE the figure describes,
 * which is not always how many rows produced it: one participant with forty
 * transactions is still one participant.
 */
export function reportBreakdown<T>(
  groups: { key: string; value: T; cohortSize: number }[],
): { key: string; reported: Reported<T> }[] {
  return groups.map((g) => ({ key: g.key, reported: report(g.value, g.cohortSize) }));
}

/**
 * True when a breakdown is safe to show AT ALL.
 *
 * A breakdown where most cells are withheld is worse than no breakdown: the
 * surviving cells stand out, and the gaps are informative in themselves. If
 * fewer than two groups clear the floor, show the total instead of a chart full
 * of holes.
 */
export function breakdownIsPublishable(groups: { cohortSize: number }[]): boolean {
  return groups.filter((g) => g.cohortSize >= MIN_COHORT).length >= 2;
}
