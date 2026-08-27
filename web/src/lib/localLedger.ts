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
  currency: string;
  vendorLabel: string;
  note: string;
  wallet_node: string | null;
  paid_by: string | null;
  visibility: "private" | "shared";
  exclude_from_totals: boolean;
  /** Marks the row as never having been on a server. */
  origin: "local_only";
  createdAt: string;
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
export async function appendLocalRecord(payload: Record<string, unknown>): Promise<LocalRecord> {
  const now = new Date().toISOString();
  const rec: LocalRecord = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `loc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    occurred_at: typeof payload.occurredAt === "string" ? payload.occurredAt : now,
    amount: Number(payload.amount) || 0,
    direction: payload.direction === "in" ? "in" : "out",
    currency: typeof payload.currency === "string" ? payload.currency : "MYR",
    vendorLabel: typeof payload.vendorLabel === "string" ? payload.vendorLabel : "",
    note: typeof payload.note === "string" ? payload.note : "",
    wallet_node: typeof payload.walletNodeId === "string" ? payload.walletNodeId : null,
    paid_by: typeof payload.paidBy === "string" ? payload.paidBy : null,
    visibility: payload.visibility === "private" ? "private" : "shared",
    exclude_from_totals: payload.excludeFromTotals === true,
    origin: "local_only",
    createdAt: now,
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
