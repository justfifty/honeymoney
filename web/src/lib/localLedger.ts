// Records that live on the device because the household asked for that.
//
// ── WHY THIS IS NOT THE OFFLINE QUEUE ──────────────────────────────────────
//
// lib/offlineQueue.ts holds captures that COULD NOT reach the server and are
// waiting to. This holds captures that MUST NOT reach it, because the household
// switched to local-only storage. The distinction is the whole file: feeding a
// local-only record into the retry queue would have it POST, get 409, POST
// again, and after five attempts mark itself `stuck` and surface to the user as
// a failure — when in fact it worked exactly as designed. A queue that retries
// forever against a server that is correctly refusing is not a queue, it is a
// slow way to lose data and frighten somebody.
//
// So they are different stores with different lifecycles. Queue entries are
// transient and disappear on success. These are the record.
//
// ── THE DANGEROUS PART, STATED PLAINLY ─────────────────────────────────────
//
// In local-only mode this IndexedDB store is, for a moment, the only copy of a
// record in existence. Nothing on our server, nothing in a backup. That makes
// two things load-bearing:
//
//   1. Every local record is written into the user's chosen file on the next
//      vault sync, so the moment is short.
//   2. Signing out warns before clearing, exactly as it does for unsent
//      captures — see lib/localTeardown.ts. Clearing this silently would
//      destroy records the user believed were saved, which is the single worst
//      thing this app could do.

import { deriveKind, kindOf, SAVINGS_TIER, type Category, type RecordKind } from "./recordKind";

const DB_NAME = "honeymoney-vault";
const DB_VERSION = 1;
const STORE = "vault";
const KEY_LEDGER = "localRecords";

export interface LocalRecord {
  id: string;
  /** ISO. When the spend happened, not when it was typed. */
  occurred_at: string;
  amount: number;
  direction: "out" | "in";
  /**
   * inflow | outflow | transfer. Carried explicitly rather than inferred from
   * `direction`, because a savings deposit is direction "in" and kind
   * "transfer" — inferring would make it income and inflate every ratio built
   * on income. See lib/recordKind.ts.
   */
  kind: RecordKind;
  currency: string;
  vendorLabel: string;
  note: string;
  wallet_node: string | null;
  paid_by: string | null;
  visibility: "private" | "shared";
  exclude_from_totals: boolean;
  /**
   * The receipt's confirmed line items and printed breakdown.
   *
   * Modelled here as well as carried in `payload`, and that is not redundancy.
   * `payload` exists to be replayed at the server verbatim; a household that
   * chose local-only never replays it anywhere, so anything that lives only in
   * `payload` is invisible to every local view. The itemisation is exactly the
   * detail those households would notice missing -- they are the ones with no
   * server-side copy to fall back on.
   */
  items?: { label: string; amount: number; qty?: number; unitPrice?: number; discount?: boolean }[];
  breakdown?: {
    subtotal: number;
    serviceCharge: number;
    tax: number;
    rounding: number;
    total: number;
  };
  /**
   * Where this record was born. "local_only" for a household that keeps
   * records off the server; "local_first" for the ordinary path, which now
   * also writes here before anything is sent.
   */
  origin: "local_only" | "local_first";
  createdAt: string;
  /** The exact body the API would have received. Replayed verbatim on sync. */
  payload?: Record<string, unknown>;
  /**
   * When the server acknowledged it. Null means it has not been sent, which is
   * ALSO what the old offline queue meant — so this one field replaces that
   * whole second store. One place a record can be, in one of two states,
   * instead of two stores that could disagree about which held the truth.
   */
  syncedAt?: string | null;
  /** The server's id once it has one, so the two copies can be matched up. */
  serverId?: string | null;
  /** Attempts made. Used to stop hammering a server that keeps refusing. */
  attempts?: number;
  lastError?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function read(): Promise<LocalRecord[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openDb();
    return await new Promise<LocalRecord[]>((resolve, reject) => {
      const t = db.transaction(STORE, "readonly");
      const r = t.objectStore(STORE).get(KEY_LEDGER);
      r.onsuccess = () => resolve((r.result as LocalRecord[]) ?? []);
      r.onerror = () => reject(r.error);
      t.oncomplete = () => db.close();
    });
  } catch {
    return [];
  }
}

async function write(rows: LocalRecord[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const r = t.objectStore(STORE).put(rows, KEY_LEDGER);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
    t.oncomplete = () => db.close();
  });
}

export async function listLocalRecords(): Promise<LocalRecord[]> {
  return (await read()).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

export async function countLocalRecords(): Promise<number> {
  return (await read()).length;
}


/**
 * Append a record to the device's own ledger.
 *
 * Takes the same payload shape the API would have received, so the call site
 * does not have to build a second version of the record. Read-modify-write on
 * one array rather than a row per key: a household's local-only ledger is
 * hundreds of rows, not millions, and keeping it as one value means a sync
 * writes one consistent snapshot instead of racing a cursor.
 */
export async function appendLocalRecord(
  payload: Record<string, unknown>,
  origin: LocalRecord["origin"] = "local_only",
): Promise<LocalRecord> {
  const now = new Date().toISOString();
  const rec: LocalRecord = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `loc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    occurred_at: typeof payload.occurredAt === "string" ? payload.occurredAt : now,
    amount: Number(payload.amount) || 0,
    direction: payload.direction === "in" ? "in" : "out",
    // The category is the authority where it exists — it is what the user
    // actually chose. deriveKind is the fallback for a payload without one.
    kind: payload.category
      ? kindOf(payload.category as Category)
      : deriveKind({
          direction: typeof payload.direction === "string" ? payload.direction : undefined,
          bucketTier: payload.bucketTier === SAVINGS_TIER ? SAVINGS_TIER : null,
        }),
    currency: typeof payload.currency === "string" ? payload.currency : "MYR",
    vendorLabel: typeof payload.vendorLabel === "string" ? payload.vendorLabel : "",
    note: typeof payload.note === "string" ? payload.note : "",
    wallet_node: typeof payload.walletNodeId === "string" ? payload.walletNodeId : null,
    paid_by: typeof payload.paidBy === "string" ? payload.paidBy : null,
    visibility: payload.visibility === "private" ? "private" : "shared",
    exclude_from_totals: payload.excludeFromTotals === true,
    ...(Array.isArray(payload.items) && payload.items.length
      ? { items: payload.items as LocalRecord["items"] }
      : {}),
    ...(payload.breakdown ? { breakdown: payload.breakdown as LocalRecord["breakdown"] } : {}),
    origin,
    createdAt: now,
    syncedAt: null,
    serverId: null,
    attempts: 0,
    // The payload is kept verbatim so the sync can replay EXACTLY what the
    // user submitted. Reconstructing it from the parsed fields would quietly
    // drop anything this interface does not model -- attachments, entered
    // currency, the category -- and the record that reached the server would
    // not be the record they made.
    payload,
  };
  const rows = await read();
  rows.push(rec);
  await write(rows);
  return rec;
}

export async function deleteLocalRecord(id: string): Promise<void> {
  await write((await read()).filter((r) => r.id !== id));
}

/**
 * Shape the ledger the way lib/localAnalysis.ts expects a transaction.
 *
 * Deliberately a translation rather than a shared type. The analysis module
 * reads what the export endpoint produces, which is PocketBase's row shape; the
 * ledger stores what the API accepts, which is the client's payload shape.
 * Pretending they are the same type would make the next change to either one
 * break the other silently.
 */
export function asAnalysable(rows: LocalRecord[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    direction: r.direction,
    kind: r.kind,
    currency: r.currency,
    occurred_at: r.occurred_at,
    note: r.note,
    voided: false,
    wallet_node: r.wallet_node ?? undefined,
    paid_by: r.paid_by ?? undefined,
    exclude_from_totals: r.exclude_from_totals,
    expand: r.vendorLabel ? { vendor_node: { label: r.vendorLabel } } : undefined,
  }));
}

// ── sync state ──────────────────────────────────────────────────────────────

/** Records written locally that the server has not acknowledged. */
export async function pendingSync(): Promise<LocalRecord[]> {
  return (await read())
    .filter((r) => r.origin === "local_first" && !r.syncedAt && (r.attempts ?? 0) < 5)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Records that failed enough times to stop retrying and start telling someone. */
export async function stuckRecords(): Promise<LocalRecord[]> {
  return (await read()).filter((r) => r.origin === "local_first" && !r.syncedAt && (r.attempts ?? 0) >= 5);
}

export async function markSynced(id: string, serverId: string | null): Promise<void> {
  const rows = await read();
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return;
  rows[i] = { ...rows[i], syncedAt: new Date().toISOString(), serverId };
  await write(rows);
}

export async function markAttempt(id: string, error: string): Promise<void> {
  const rows = await read();
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return;
  rows[i] = { ...rows[i], attempts: (rows[i].attempts ?? 0) + 1, lastError: error };
  await write(rows);
}

/**
 * Send everything the server has not seen, oldest first.
 *
 * Oldest first is not tidiness: duplicate detection compares a new spend
 * against recent ones, and replaying out of order can make a legitimate second
 * coffee look like a duplicate of the first.
 *
 * A synced record is KEPT, not deleted. It is still the local copy that makes
 * the app work offline — the sync flag only records that the server has it too.
 * Deleting on success is what the old queue did, and it is why the app went
 * blind the moment the network came back.
 */
export async function syncLedger(): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) return out;

  for (const rec of await pendingSync()) {
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rec.payload ?? {}),
      });
      const data = await res.json().catch(() => ({}));

      // The household switched to local-only while this was waiting. That is
      // not a failure to retry — the record belongs here now, permanently.
      if (res.status === 409 && data.storageMode === "local_only") {
        const rows = await read();
        const i = rows.findIndex((r) => r.id === rec.id);
        if (i >= 0) {
          rows[i] = { ...rows[i], origin: "local_only", syncedAt: null };
          await write(rows);
        }
        continue;
      }

      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await markSynced(rec.id, data?.stored?.transactionId ?? null);
      out.sent++;
    } catch (e) {
      await markAttempt(rec.id, e instanceof Error ? e.message : String(e));
      out.failed++;
      // Stop on the first failure while offline: the next twenty will fail too,
      // and burning through them only inflates every attempt count towards the
      // give-up threshold for one outage.
      if (typeof navigator !== "undefined" && !navigator.onLine) break;
    }
  }
  return out;
}
