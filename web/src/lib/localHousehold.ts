// A household that exists only on this device, with no account and no server.
//
// ── THE PROBLEM THIS SOLVES ────────────────────────────────────────────────
//
// Everything else in this app, including the local-only storage mode, assumes
// you got in first. Signing up posts to our server. Signing in posts to our
// server. So for a household on the east coast, in a longhouse, or anywhere the
// signal arrives for twenty minutes a day, HoneyMoney was not "usable offline
// with some limitations" — it was unusable, because the front door needed a
// network they did not have.
//
// That is the wrong way round for a product whose whole subject is households
// under cost-of-living pressure. The ones with the least reliable connectivity
// are not an edge case to degrade gracefully for; they are closer to the middle
// of the market than the urban dual-income couple in the pitch deck.
//
// So: no account, no sign-in, no request. Open the app and start recording. The
// three buckets exist by default, the arithmetic is the same arithmetic, and
// nothing is sent anywhere because there is nowhere to send it.
//
// ── THE ONE HONEST CATCH ───────────────────────────────────────────────────
//
// A web app has to be fetched once. There is no way around that, and pretending
// otherwise would be the same overclaim this codebase has spent the week
// removing. So the shape is: reach signal ONCE — a town, a relative's house, a
// hotspot — open honeymoney.app, add it to the home screen. The service worker
// caches the app and the OCR engine. After that it opens and works with the
// aeroplane mode on, indefinitely.
//
// That is a real constraint and the UI says it plainly rather than burying it.
//
// ── WHY IT REUSES THE LOCAL LEDGER ─────────────────────────────────────────
//
// Records go to lib/localLedger.ts, the same store a local-only household
// writes to. One store means one analysis path, one export path, and one thing
// to get right — and it means a household that starts with no account and later
// creates one has their records already in the shape the vault exports.

const DB_NAME = "honeymoney-vault";
const DB_VERSION = 1;
const STORE = "vault";
const KEY_HOUSEHOLD = "localHousehold";

/**
 * The three buckets, as fixed ids.
 *
 * Fixed rather than generated so a record written today still resolves to a
 * bucket after the household clears its browser and starts again from a
 * restored file. A generated id would make the label lookup fail and every past
 * record read as "Unlabelled".
 */
export const LOCAL_BUCKETS = [
  { id: "local-bucket-must", tier: 1, label: "Must-paid" },
  { id: "local-bucket-savings", tier: 2, label: "Savings" },
  { id: "local-bucket-spendings", tier: 3, label: "Spendings" },
] as const;

export interface LocalHousehold {
  name: string;
  currency: string;
  /** Free text. There is no member table here — one device, one keeper. */
  keeper: string;
  createdAt: string;
  /** Bumped when the user edits anything, so the UI can show it saved. */
  updatedAt: string;
}

function defaults(): LocalHousehold {
  const now = new Date().toISOString();
  return {
    name: "My household",
    currency: "MYR",
    keeper: "",
    createdAt: now,
    updatedAt: now,
  };
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

export function localModeAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/** Has this device been set up as a standalone household? */
export async function getLocalHousehold(): Promise<LocalHousehold | null> {
  if (!localModeAvailable()) return null;
  try {
    const db = await openDb();
    return await new Promise<LocalHousehold | null>((resolve, reject) => {
      const t = db.transaction(STORE, "readonly");
      const r = t.objectStore(STORE).get(KEY_HOUSEHOLD);
      r.onsuccess = () => resolve((r.result as LocalHousehold) ?? null);
      r.onerror = () => reject(r.error);
      t.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

export async function saveLocalHousehold(patch: Partial<LocalHousehold>): Promise<LocalHousehold> {
  const current = (await getLocalHousehold()) ?? defaults();
  const next: LocalHousehold = { ...current, ...patch, updatedAt: new Date().toISOString() };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const r = t.objectStore(STORE).put(next, KEY_HOUSEHOLD);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
    t.oncomplete = () => db.close();
  });
  return next;
}

/** Set it up on first use. Idempotent — opening the page twice is not a reset. */
export async function ensureLocalHousehold(): Promise<LocalHousehold> {
  return (await getLocalHousehold()) ?? (await saveLocalHousehold(defaults()));
}

/**
 * The bucket list, shaped the way lib/localAnalysis.ts expects graph nodes.
 *
 * Handed in as `nodes` so bucket labels resolve in the analysis without it
 * needing to know these buckets were never on a server.
 */
export function localBucketNodes(): { id: string; kind: string; label: string }[] {
  return LOCAL_BUCKETS.map((b) => ({ id: b.id, kind: "bucket", label: b.label }));
}

export function bucketLabel(id: string | null | undefined): string {
  return LOCAL_BUCKETS.find((b) => b.id === id)?.label ?? "Unfiled";
}
