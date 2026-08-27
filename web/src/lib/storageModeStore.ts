// Reading and writing the storage mode, and the purge that makes it real.
//
// Server-only. The rules live in lib/storageMode.ts; this is the database half
// plus the one genuinely destructive operation in the application.

import { pbCreate, pbDelete, pbList, pbStr } from "./pocketbase";
import { coerceMode, STORAGE_POLICY_VERSION, type StorageMode } from "./storageMode";

interface ModeRow {
  id: string;
  tenant: string;
  member: string;
  user: string;
  mode: string;
  policy_version?: string;
  purged_at?: string;
  purged_records?: number;
  local_copy_at?: string;
  local_copy_records?: number;
  created: string;
}

export interface ModeState {
  mode: StorageMode;
  since: string | null;
  purgedAt: string | null;
  purgedRecords: number;
  policyVersion: string | null;
}

/**
 * The household's current mode. Absence is `cloud` — see the migration on why
 * an unrecognised or missing value must fail towards keeping data.
 */
export async function getStorageMode(tenantId: string): Promise<ModeState> {
  const rows = await pbList<ModeRow>("storage_modes", {
    filter: `tenant = ${pbStr(tenantId)}`,
    sort: "-created",
    perPage: 50,
  }).catch(() => [] as ModeRow[]);

  const newest = rows[0];
  if (!newest) {
    return { mode: "cloud", since: null, purgedAt: null, purgedRecords: 0, policyVersion: null };
  }
  return {
    mode: coerceMode(newest.mode),
    since: newest.created,
    purgedAt: newest.purged_at || null,
    purgedRecords: Number(newest.purged_records) || 0,
    policyVersion: newest.policy_version || null,
  };
}

/** Cheap boolean for the write paths that have to refuse. */
export async function isLocalOnly(tenantId: string): Promise<boolean> {
  return (await getStorageMode(tenantId)).mode === "local_only";
}

export async function recordMode(input: {
  tenantId: string;
  memberId: string;
  userId: string;
  mode: StorageMode;
  purgedAt?: string;
  purgedRecords?: number;
  localCopyAt?: string;
  localCopyRecords?: number;
}): Promise<void> {
  await pbCreate("storage_modes", {
    tenant: input.tenantId,
    member: input.memberId,
    user: input.userId,
    mode: input.mode,
    policy_version: STORAGE_POLICY_VERSION,
    purged_at: input.purgedAt ?? "",
    purged_records: input.purgedRecords ?? 0,
    local_copy_at: input.localCopyAt ?? "",
    local_copy_records: input.localCopyRecords ?? 0,
  });
}

/** How much there is to lose. Used to check the local copy covers it. */
export async function countTenantRecords(tenantId: string): Promise<number> {
  // pbList does not surface totalItems, so the count is the length of the read.
  // One query rather than a probe-then-read: the probe saved nothing, because
  // a household with any records at all still needed the full list.
  const all = await pbList<{ id: string }>("transactions", {
    filter: `tenant = ${pbStr(tenantId)}`,
    perPage: 2000,
  }).catch(() => [] as { id: string }[]);
  return all.length;
}

export interface PurgeResult {
  transactions: number;
  /** Scanned-but-unconfirmed receipts. They hold the rawest data we ever have. */
  captures: number;
  nodes: number;
  edges: number;
  snapshots: number;
  channels: number;
}

/**
 * Delete the household's records from our database. Irreversible.
 *
 * ── WHAT GOES, AND WHY EACH ───────────────────────────────────────────────
 *
 *   transactions      the records themselves, and their attached receipt files
 *   pending_captures  scanned receipts awaiting confirmation. `payload` holds
 *                     the rawest data in the system -- itemised lines off a
 *                     shopping receipt -- so leaving these would leave the most
 *                     detailed thing we ever hold
 *   channel_links     a Telegram chat id is a durable handle to a person
 *   nodes / edges     the knowledge graph: buckets, vendors, goals, income
 *                     sources. Leaving these would leave a readable map of a
 *                     household's finances — every merchant they use and every
 *                     goal they set — under a mode that promised we hold none.
 *   hscore_snapshots  a score history is a time series about a person
 *
 * ── WHAT DELIBERATELY STAYS ───────────────────────────────────────────────
 *
 *   the account, the household, and the member rows -- or the user cannot sign
 *     in, and "opt out of cloud storage" would silently mean "delete my
 *     account", which is a different decision made through a different screen.
 *   consents, agreements, sharing_prefs, storage_modes -- the evidence that
 *     processing was lawful, INCLUDING the evidence of this deletion. Purging
 *     the record of a purge is how you end up unable to prove you honoured it.
 *   share_events and the ledger -- an append-only audit trail that can be
 *     rewritten was never an audit trail. Both hold references and amounts, not
 *     merchants or notes.
 *
 * Deletes in dependency order and tolerates individual failures: a half-purge
 * that stops at the first error leaves MORE data behind than one that carries
 * on, and the count returned is what actually went.
 */
export async function purgeTenantRecords(tenantId: string): Promise<PurgeResult> {
  const out: PurgeResult = { transactions: 0, captures: 0, nodes: 0, edges: 0, snapshots: 0, channels: 0 };
  const filter = `tenant = ${pbStr(tenantId)}`;

  // Transactions first. They reference nodes, and an orphaned transaction is a
  // worse intermediate state than an orphaned node.
  // pending_captures was missed on the first pass and is the one that would
  // have hurt: it holds `payload`, the raw parsed contents of a receipt or
  // statement that was scanned and never confirmed. A purge that left those
  // behind would leave the most detailed thing the app ever holds -- the
  // line items off somebody's shopping -- sitting in a database under a mode
  // promising we hold none. Found by auditing every tenant-scoped collection
  // for revealing fields rather than by trusting the list.
  //
  // channel_links goes too: a Telegram chat id is a durable handle to a person.
  for (const [collection, key] of [
    ["transactions", "transactions"],
    ["pending_captures", "captures"],
    ["edges", "edges"],
    ["nodes", "nodes"],
    ["hscore_snapshots", "snapshots"],
    ["channel_links", "channels"],
  ] as const) {
    let rows: { id: string }[] = [];
    try {
      rows = await pbList<{ id: string }>(collection, { filter, perPage: 2000 });
    } catch {
      continue;
    }
    for (const r of rows) {
      try {
        await pbDelete(collection, r.id);
        out[key]++;
      } catch {
        /* carry on: stopping here would leave more behind, not less */
      }
    }
  }

  // Best-effort, and last: a stale band-state row is a number with no records
  // behind it, so it is tidied but never allowed to fail the purge.
  try {
    const states = await pbList<{ id: string }>("hscore_state", { filter, perPage: 100 });
    for (const s of states) await pbDelete("hscore_state", s.id).catch(() => undefined);
  } catch {
    /* nothing there */
  }

  return out;
}
