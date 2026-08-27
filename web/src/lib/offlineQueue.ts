// Spends captured with no network, held on the device until there is one.
//
// Without this, "works offline" is a claim about pages rather than about the
// product: a person can open the app, photograph a receipt, watch the on-device
// OCR read it correctly — and then lose the whole thing to a failed POST. The
// capture is the part that has to survive, because it is the part that happens
// in a car park with one bar of signal and cannot be repeated later from memory.
//
// ── WHY IndexedDB AND NOT localStorage ─────────────────────────────────────
//
// A queued capture can carry a receipt photo. localStorage is a synchronous
// string store with a ~5 MB ceiling shared across the whole origin, so one
// photo can fill it and the failure mode is a thrown exception in the middle of
// a save. IndexedDB is asynchronous, holds blobs natively, and has a quota
// measured in hundreds of megabytes.
//
// ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────
//
// No Background Sync API. It is Chromium-only, and on iOS — where a large share
// of Malaysian households are — it does not exist at all, so building on it
// would mean the feature silently not working for the users least able to
// diagnose it. Flushing happens on the `online` event and on app start, both of
// which work everywhere.
//
// No retry-forever loop. A capture that has failed to send five times is not
// going to succeed on the six hundredth, and a queue that retries indefinitely
// burns battery while hiding a real error. After five attempts the item is
// marked `stuck` and surfaced to the user, who can see it and decide.

const DB_NAME = "honeymoney-offline";
const DB_VERSION = 1;
const STORE = "captures";

export interface QueuedCapture {
  id: string;
  /** The exact body that would have been POSTed to /api/transactions. */
  body: Record<string, unknown>;
  /** When the user pressed save — NOT when it was sent. See flush(). */
  capturedAt: string;
  attempts: number;
  lastError?: string;
  stuck?: boolean;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

/** Is IndexedDB usable at all? Private windows and locked-down browsers say no. */
export function offlineQueueAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function enqueue(body: Record<string, unknown>): Promise<QueuedCapture> {
  const item: QueuedCapture = {
    // crypto.randomUUID is available everywhere this app runs; the fallback is
    // for the one browser that has IndexedDB but an older crypto surface.
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `q-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    body,
    capturedAt: new Date().toISOString(),
    attempts: 0,
  };
  await tx("readwrite", (s) => s.add(item));
  return item;
}

export async function list(): Promise<QueuedCapture[]> {
  if (!offlineQueueAvailable()) return [];
  try {
    const all = await tx<QueuedCapture[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedCapture[]>);
    return all.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  } catch {
    return [];
  }
}

export async function remove(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

async function put(item: QueuedCapture): Promise<void> {
  await tx("readwrite", (s) => s.put(item));
}

export interface FlushResult {
  sent: number;
  failed: number;
  stuck: number;
}

/**
 * Send everything waiting, oldest first.
 *
 * Oldest first matters for more than tidiness: duplicate detection compares a
 * new spend against recent ones, and replaying captures out of order can make
 * a legitimate second coffee look like a duplicate of the first.
 *
 * `capturedAt` is sent as `occurredAt` when the body does not already carry a
 * date. A spend made on Tuesday in a basement and synced on Thursday belongs on
 * Tuesday — dating it by arrival would quietly corrupt every figure the app
 * computes over a period, which is all of them.
 */
export async function flush(): Promise<FlushResult> {
  const out: FlushResult = { sent: 0, failed: 0, stuck: 0 };
  if (!offlineQueueAvailable()) return out;

  const items = await list();
  for (const item of items) {
    if (item.stuck) {
      out.stuck++;
      continue;
    }
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occurredAt: item.capturedAt,
          ...item.body,
          // Marks the row as having arrived late, so a person looking at their
          // ledger can tell why something appeared days after it happened.
          source: item.body.source ?? "offline",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await remove(item.id);
      out.sent++;
    } catch (err) {
      const attempts = item.attempts + 1;
      const stuck = attempts >= 5;
      await put({
        ...item,
        attempts,
        stuck,
        lastError: err instanceof Error ? err.message : String(err),
      });
      if (stuck) out.stuck++;
      else out.failed++;
      // Stop on the first failure. If the network is down, the next twenty
      // requests will fail too, and burning through the queue only inflates
      // every item's attempt count towards `stuck` for one outage.
      if (!navigator.onLine) break;
    }
  }
  return out;
}
