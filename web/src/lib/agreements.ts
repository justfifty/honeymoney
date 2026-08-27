// Terms acceptance, recorded as a ledger — and deliberately NOT as a consent.
//
// The temptation was to add "terms" to the Purpose union in lib/consent.ts and
// reuse everything. It is the wrong shape, for a reason that shows up the first
// time someone opens Settings → Privacy: a consent is WITHDRAWABLE. The settings
// screen renders every purpose with a toggle, and the withdrawal path is built
// and tested because the PDPA requires it.
//
// You cannot withdraw agreement to the terms of a service while continuing to
// use it. Modelling terms as a consent would put a switch on the screen that
// either does nothing (a lie) or logs you out (not what a privacy toggle should
// do). So agreements get their own append-only collection, with the same
// evidentiary shape and none of the withdrawal machinery.
//
// The other reason to separate them: consent answers "may we process this?" and
// acceptance answers "what did you agree the deal was?". During a dispute those
// are different questions, asked by different people, at different times.

import { pbCreate, pbList, pbStr } from "./pocketbase";

/**
 * Bumped when the terms change in a way that alters the deal — new limitation,
 * new obligation on the user, new governing law, changed service description.
 * Typos and formatting do not bump it.
 *
 * Unlike NOTICE_VERSION, a bump here does NOT invalidate an existing acceptance.
 * The version someone accepted is the version that binds them until they accept
 * a newer one, which is why the row stores the version rather than a boolean.
 */
// 2026-08-27: the deal changed, so the version did. Added — the service is
// free of charge and what that does and does not promise; the H-Score is not a
// credit score and nobody may require you to show it; forecasts are estimates;
// your duties towards the other people (and children) whose details you enter;
// and the Telegram channel named as a separate choice with a third party in it.
export const TERMS_VERSION = "2026-08-27";

/** The operating entity named in the terms. */
export const OPERATOR = "JUST50";

export type AgreementDoc = "terms";

export interface AgreementRow {
  id: string;
  user: string;
  doc: string;
  version: string;
  source: string;
  created: string;
}

/**
 * Record that a user accepted a document at a given version.
 *
 * Never updates. Two acceptances of two versions are two rows, because the
 * question a year from now is "what had they agreed to on the day this
 * happened?" — and an updated row cannot answer it.
 */
export async function recordAcceptance(input: {
  userId: string;
  doc?: AgreementDoc;
  version?: string;
  source?: string;
}): Promise<void> {
  await pbCreate("agreements", {
    user: input.userId,
    doc: input.doc ?? "terms",
    version: input.version ?? TERMS_VERSION,
    source: input.source ?? "signup",
  });
}

/** The newest version this user has accepted, or null if they never have. */
export async function acceptedVersion(userId: string, doc: AgreementDoc = "terms"): Promise<string | null> {
  const rows = await pbList<AgreementRow>("agreements", {
    filter: `user = ${pbStr(userId)} && doc = ${pbStr(doc)}`,
    sort: "-created",
  });
  return rows[0]?.version ?? null;
}

/**
 * Is this user on the current terms?
 *
 * False for someone who accepted an older version, and false for the accounts
 * that predate this module entirely — which is most of them. That is a fact to
 * surface, not to paper over: the honest handling is to ask them once, on next
 * sign-in, rather than to backdate a row saying they agreed to something they
 * were never shown.
 */
export async function hasAcceptedCurrent(userId: string, doc: AgreementDoc = "terms"): Promise<boolean> {
  return (await acceptedVersion(userId, doc)) === TERMS_VERSION;
}
