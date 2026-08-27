// Reading and writing sharing decisions, and the log that makes them auditable.
//
// Split from lib/sharing.ts so the rules stay pure and testable there while the
// database lives here. Everything in this file is server-only.

import { pbCreate, pbList, pbStr } from "./pocketbase";
import {
  foldShareRows,
  isShareType,
  SHARE_SPECS,
  SHARING_POLICY_VERSION,
  specForShare,
  type ShareMap,
  type ShareRowLike,
  type ShareType,
} from "./sharing";

interface PrefRow extends ShareRowLike {
  id: string;
  tenant: string;
  member: string;
  user: string;
}

export type ShareSource = "settings" | "onboarding" | "exit" | "revoke_all";

/** The current answer sheet for one member. Absence folds to the defaults. */
export async function getShares(memberId: string): Promise<ShareMap> {
  if (!memberId) return foldShareRows([]);
  const rows = await pbList<PrefRow>("sharing_prefs", {
    filter: `member = ${pbStr(memberId)}`,
    sort: "created",
    perPage: 500,
  });
  return foldShareRows(rows);
}

/**
 * Everyone's answer sheet, in one query.
 *
 * The read paths need this: rendering a household record list means deciding,
 * per row, whether the payer shares transactions — and doing that with one
 * query per member would make a list of forty rows into forty round trips.
 */
export async function getHouseholdShares(tenantId: string): Promise<Map<string, ShareMap>> {
  const rows = await pbList<PrefRow>("sharing_prefs", {
    filter: `tenant = ${pbStr(tenantId)}`,
    sort: "created",
    perPage: 2000,
  });
  const byMember = new Map<string, PrefRow[]>();
  for (const r of rows) {
    const list = byMember.get(r.member);
    if (list) list.push(r);
    else byMember.set(r.member, [r]);
  }
  const out = new Map<string, ShareMap>();
  for (const [member, list] of byMember) out.set(member, foldShareRows(list));
  return out;
}

/**
 * Look up one member's map from a household-wide read, falling back to the
 * defaults for a member who has never answered.
 *
 * The fallback matters more than it looks: `map.get(id)` returning undefined
 * for a member with no rows would make `canSeeShared` throw or, worse, read as
 * permissive if someone wrote `?? { shared: true }` in a hurry.
 */
export function sharesFor(all: Map<string, ShareMap>, memberId: string | null | undefined): ShareMap {
  if (!memberId) return foldShareRows([]);
  return all.get(memberId) ?? foldShareRows([]);
}

/** Append one decision. Never updates — see the migration for why. */
export async function recordShare(input: {
  tenantId: string;
  memberId: string;
  userId: string;
  type: ShareType;
  shared: boolean;
  source: ShareSource;
}): Promise<void> {
  await pbCreate("sharing_prefs", {
    tenant: input.tenantId,
    member: input.memberId,
    user: input.userId,
    data_type: input.type,
    shared: input.shared,
    policy_version: SHARING_POLICY_VERSION,
    source: input.source,
  });
}

/**
 * Switch everything off, in one action.
 *
 * This is the panic button behind the safety screen, and it writes a row for
 * EVERY type including the ones already off. Re-stating an existing "no" costs
 * one row and buys the thing that matters afterwards: a timestamp proving that
 * at this moment the person revoked everything, rather than a gap in the log
 * where the types that happened to be off already would otherwise be missing.
 */
export async function revokeAllShares(input: {
  tenantId: string;
  memberId: string;
  userId: string;
  actorLabel?: string;
}): Promise<void> {
  for (const spec of SHARE_SPECS) {
    await recordShare({
      tenantId: input.tenantId,
      memberId: input.memberId,
      userId: input.userId,
      type: spec.key,
      shared: false,
      source: "revoke_all",
    });
  }
  await logShareEvent({
    tenantId: input.tenantId,
    subjectMemberId: input.memberId,
    actorMemberId: input.memberId,
    actorLabel: input.actorLabel,
    kind: "revoke_all",
    detail: "Stopped sharing everything with the household, including history.",
  });
}

// ── the event log ───────────────────────────────────────────────────────────

export type ShareEventKind =
  | "share_granted"
  | "share_revoked"
  | "revoke_all"
  | "detail_viewed"
  | "member_joined"
  | "member_left"
  | "member_removed"
  | "export_taken";

export interface ShareEvent {
  id: string;
  tenant: string;
  subject_member: string;
  actor_member: string;
  actor_label: string;
  kind: ShareEventKind;
  data_type: string;
  detail: string;
  created: string;
}

/**
 * Write one line to the log.
 *
 * Swallows its own failures on purpose. The log exists to make sharing
 * checkable; it must never be the reason a person cannot revoke a share or
 * leave a household. A failed write loses a line — a thrown error would leave
 * someone stuck inside a household they are trying to get out of, which is the
 * exact scenario this whole subsystem is for.
 */
export async function logShareEvent(input: {
  tenantId: string;
  subjectMemberId?: string | null;
  actorMemberId?: string | null;
  actorLabel?: string | null;
  kind: ShareEventKind;
  type?: ShareType;
  detail?: string;
}): Promise<void> {
  try {
    await pbCreate("share_events", {
      tenant: input.tenantId,
      subject_member: input.subjectMemberId ?? "",
      actor_member: input.actorMemberId ?? "",
      actor_label: (input.actorLabel ?? "").slice(0, 120),
      kind: input.kind,
      data_type: input.type ?? "",
      detail: (input.detail ?? "").slice(0, 300),
    });
  } catch {
    /* the log is evidence, never a gate */
  }
}

/**
 * Record that someone read another member's detail-level data.
 *
 * Only fires when all three are true: the reader is not the subject, the data
 * type is marked `detail`, and something was actually returned. A log full of
 * "Mariam viewed 0 of Azlan's transactions" is a log nobody reads, and the
 * screen this feeds is only useful if every line on it happened.
 */
export async function logDetailAccess(input: {
  tenantId: string;
  subjectMemberId: string;
  viewerMemberId: string | null | undefined;
  viewerLabel?: string | null;
  type: ShareType;
  count: number;
}): Promise<void> {
  if (!input.viewerMemberId || input.viewerMemberId === input.subjectMemberId) return;
  if (input.count <= 0) return;
  if (!specForShare(input.type)?.detail) return;
  await logShareEvent({
    tenantId: input.tenantId,
    subjectMemberId: input.subjectMemberId,
    actorMemberId: input.viewerMemberId,
    actorLabel: input.viewerLabel,
    kind: "detail_viewed",
    type: input.type,
    detail: `Viewed ${input.count} ${specForShare(input.type)?.label.toLowerCase() ?? input.type}.`,
  });
}

/**
 * The log entries a member is entitled to see.
 *
 * Two kinds: events about THEIR data (who read it, what they shared), and
 * membership events for the household (who joined, who left). Deliberately not
 * "everything in the tenant" — one member's access log is not another member's
 * business, and a household-wide feed would turn a safety feature into a way of
 * watching whether someone has been checking their privacy settings.
 */
export async function listShareEvents(
  tenantId: string,
  memberId: string,
  limit = 100,
): Promise<ShareEvent[]> {
  if (!memberId) return [];
  const rows = await pbList<ShareEvent>("share_events", {
    filter: `tenant = ${pbStr(tenantId)} && (subject_member = ${pbStr(memberId)} || kind = 'member_joined' || kind = 'member_left' || kind = 'member_removed')`,
    sort: "-created",
    perPage: limit,
  });
  return rows.filter((r) => isShareType(r.data_type) || !r.data_type);
}
