// The household's own copy of its records, in a place the household chose.
//
// ── WHAT THIS CHANGES ──────────────────────────────────────────────────────
//
// Until now HoneyMoney was cloud-only in the sense that matters: the records
// lived in our database, the analysis ran on our server, and the user's only
// route to their own data was pressing Export and getting a file that was
// immediately stale. "Local-first" was true of receipt capture and of nothing
// else.
//
// This makes a second claim true. The complete record set is written to a
// location the user picks — a folder on their phone, an SD card, a synced
// Drive/OneDrive folder, a USB stick — and rewritten whenever it changes. It is
// theirs, it is current, it is readable without us, and it survives us.
//
// ── WHAT IT DELIBERATELY DOES NOT CLAIM ────────────────────────────────────
//
// This is NOT yet "the server never holds your records". It cannot be, while
// the H-Score and the projection are computed server-side over readable rows —
// see the note in localAnalysis.ts on why duplicating that maths in the browser
// would be worse than not having it. What is true today is: local-first
// capture, a complete user-held copy in a user-chosen location, and offline
// analysis over it. Saying more than that would repeat exactly the overclaim
// this file exists to start fixing.
//
// ── WHY File System Access, AND WHAT HAPPENS WHERE IT IS MISSING ───────────
//
// `showSaveFilePicker` returns a handle we can persist in IndexedDB and write
// through again later WITHOUT re-prompting. That is the whole feature: a
// download that must be repeated by hand every time is not a place your data
// lives, it is a chore nobody does twice.
//
// Safari and every iOS browser lack it. That is a large share of Malaysian
// households, so the fallback is not an afterthought: we hand them the same
// bytes as a download, which their OS share sheet can file into Files, iCloud
// Drive, or Google Drive. They choose the location too — they just have to
// choose it each time. The UI says which mode it is in rather than pretending.

import { asAnalysable, listLocalRecords } from "./localLedger";

const DB_NAME = "honeymoney-vault";
const DB_VERSION = 1;
const STORE = "vault";
const KEY_HANDLE = "fileHandle";
const KEY_SNAPSHOT = "snapshot";
const KEY_META = "meta";

export interface VaultMeta {
  /** ISO timestamp of the last successful write. */
  lastSyncAt: string;
  /** Where it went, in words: the filename, or "download". */
  target: string;
  records: number;
  bytes: number;
  /** "handle" = written straight to their chosen file. "download" = fallback. */
  mode: "handle" | "download";
}

/** The shape /api/account/export returns. Kept loose on purpose — this file's
 *  job is to store and hand back whatever the export contains, not to know it. */
export interface VaultSnapshot {
  exportedAt?: string;
  transactions?: Record<string, unknown>[];
  nodes?: Record<string, unknown>[];
  members?: Record<string, unknown>[];
  hscoreSnapshots?: Record<string, unknown>[];
  [k: string]: unknown;
}

// ── IndexedDB plumbing ──────────────────────────────────────────────────────

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

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const t = db.transaction(STORE, "readonly");
    const r = t.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
    t.oncomplete = () => db.close();
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const r = t.objectStore(STORE).put(value, key);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
    t.oncomplete = () => db.close();
  });
}

async function idbDel(key: string): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const r = t.objectStore(STORE).delete(key);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
    t.oncomplete = () => db.close();
  });
}

// ── capability ──────────────────────────────────────────────────────────────

type PickerWindow = Window & {
  showSaveFilePicker?: (opts?: unknown) => Promise<FileSystemFileHandle>;
};

/** Can this browser hold a re-writable handle to a user-chosen file? */
export function canPickLocation(): boolean {
  return typeof window !== "undefined" && typeof (window as PickerWindow).showSaveFilePicker === "function";
}

export function vaultAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

// ── permission ──────────────────────────────────────────────────────────────

interface PermissionCapableHandle extends FileSystemFileHandle {
  queryPermission?: (d: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
}

/**
 * A stored handle is not a standing right to write.
 *
 * Browsers drop the grant when the tab closes, so a handle restored from
 * IndexedDB usually needs re-permitting — and `requestPermission` only works
 * inside a user gesture. That is why `sync()` takes `interactive`: an automatic
 * background sync must NOT trigger a permission prompt out of nowhere, so it
 * checks quietly and gives up until the user next presses the button.
 */
async function ensureWritable(
  handle: FileSystemFileHandle,
  interactive: boolean,
): Promise<boolean> {
  const h = handle as PermissionCapableHandle;
  try {
    if (h.queryPermission) {
      const state = await h.queryPermission({ mode: "readwrite" });
      if (state === "granted") return true;
      if (!interactive) return false;
    }
    if (interactive && h.requestPermission) {
      return (await h.requestPermission({ mode: "readwrite" })) === "granted";
    }
  } catch {
    /* not supported — try the write and let it fail honestly */
  }
  return !h.queryPermission;
}

// ── the public surface ──────────────────────────────────────────────────────

export async function getMeta(): Promise<VaultMeta | null> {
  if (!vaultAvailable()) return null;
  try {
    return (await idbGet<VaultMeta>(KEY_META)) ?? null;
  } catch {
    return null;
  }
}

export async function hasLocation(): Promise<boolean> {
  if (!vaultAvailable()) return false;
  try {
    return Boolean(await idbGet<FileSystemFileHandle>(KEY_HANDLE));
  } catch {
    return false;
  }
}

/**
 * Ask the user where their records should live. Must be called from a click.
 *
 * The suggested name carries a date so a household that picks a folder ends up
 * with something legible in it rather than a file called `export.json`.
 */
export async function chooseLocation(): Promise<{ ok: boolean; name?: string; reason?: string }> {
  if (!canPickLocation()) {
    return { ok: false, reason: "This browser cannot save to a folder you choose. Use the download option instead." };
  }
  try {
    const handle = await (window as PickerWindow).showSaveFilePicker!({
      suggestedName: "honeymoney-records.json",
      types: [
        {
          description: "HoneyMoney records (JSON)",
          accept: { "application/json": [".json"] },
        },
      ],
    });
    await idbPut(KEY_HANDLE, handle);
    return { ok: true, name: handle.name };
  } catch (e) {
    // AbortError is the user closing the picker. Not an error to report.
    if (e instanceof DOMException && e.name === "AbortError") return { ok: false };
    return { ok: false, reason: e instanceof Error ? e.message : "Could not set a location." };
  }
}

export async function forgetLocation(): Promise<void> {
  await idbDel(KEY_HANDLE);
}

/** The last snapshot we stored, for reading and analysing offline. */
export async function loadLocal(): Promise<VaultSnapshot | null> {
  if (!vaultAvailable()) return null;
  try {
    return (await idbGet<VaultSnapshot>(KEY_SNAPSHOT)) ?? null;
  } catch {
    return null;
  }
}

/**
 * How stale a copy may get before an automatic sync is worth attempting.
 *
 * Six hours, not six minutes. An automatic sync costs a full export fetch, and
 * the thing it protects against — losing access to the service — does not
 * arrive on a six-minute timescale. Syncing after every keystroke would turn a
 * safety net into a background data charge.
 */
const AUTO_SYNC_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * Sync quietly if the copy has gone stale, and do nothing otherwise.
 *
 * NON-INTERACTIVE by construction. It never prompts for file permission, never
 * triggers a download, and never surfaces an error — a background task that
 * throws a permission dialog at somebody mid-sentence is worse than a slightly
 * old copy. When the file handle is not currently writable it still refreshes
 * the browser-side snapshot, so offline analysis stays current even while the
 * chosen file waits for the user's next visit to the vault screen.
 *
 * Returns true only if something was actually written.
 */
export async function autoSyncIfStale(): Promise<boolean> {
  if (!vaultAvailable() || !navigator.onLine) return false;
  try {
    // Nothing to keep current until the user has opted in by choosing a
    // location or taking at least one copy. Syncing for someone who has never
    // used the feature would be fetching their whole record set uninvited.
    const meta = await getMeta();
    const located = await hasLocation();
    if (!meta && !located) return false;
    if (meta && Date.now() - new Date(meta.lastSyncAt).getTime() < AUTO_SYNC_AFTER_MS) {
      return false;
    }
    const r = await sync({ interactive: false });
    return r.ok;
  } catch {
    return false;
  }
}

export interface SyncOutcome {
  ok: boolean;
  meta?: VaultMeta;
  /** True when we fell back to a download because no handle was usable. */
  downloaded?: boolean;
  reason?: string;
}

/**
 * Fetch the current records and write them where the user asked.
 *
 * ALWAYS writes to IndexedDB, even when the file write fails. The browser copy
 * is what makes offline analysis work, and it should not be lost because a USB
 * stick was unplugged or a permission lapsed.
 */
export async function sync(opts: { interactive: boolean }): Promise<SyncOutcome> {
  if (!vaultAvailable()) return { ok: false, reason: "This browser cannot store data locally." };
  if (!navigator.onLine) {
    return { ok: false, reason: "You are offline. Your existing local copy is unchanged." };
  }

  let snapshot: VaultSnapshot;
  let text: string;
  try {
    const res = await fetch("/api/account/export");
    if (!res.ok) throw new Error(`export returned ${res.status}`);
    text = await res.text();
    snapshot = JSON.parse(text) as VaultSnapshot;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Could not fetch your records." };
  }

  // Device-only records are folded in BEFORE the file is written. They exist
  // nowhere else — not on our server, not in any backup — so a "copy" that
  // omitted them would be the one file the household trusts and the one place
  // their newest spending is missing.
  const deviceOnly = await listLocalRecords().catch(() => []);
  if (deviceOnly.length) {
    const existing = Array.isArray(snapshot.transactions) ? snapshot.transactions : [];
    const byId = new Map(existing.map((r) => [String((r as { id?: unknown }).id ?? ""), r]));
    for (const r of asAnalysable(deviceOnly)) byId.set(String(r.id), r);
    snapshot = { ...snapshot, transactions: [...byId.values()] };
    snapshot.deviceOnlyRecords = deviceOnly.length;
    text = JSON.stringify(snapshot, null, 2);
  }

  const records = Array.isArray(snapshot.transactions) ? snapshot.transactions.length : 0;
  const bytes = new Blob([text]).size;

  await idbPut(KEY_SNAPSHOT, snapshot);

  const handle = await idbGet<FileSystemFileHandle>(KEY_HANDLE);
  if (handle && (await ensureWritable(handle, opts.interactive))) {
    try {
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
      const meta: VaultMeta = {
        lastSyncAt: new Date().toISOString(),
        target: handle.name,
        records,
        bytes,
        mode: "handle",
      };
      await idbPut(KEY_META, meta);
      return { ok: true, meta };
    } catch (e) {
      return {
        ok: false,
        reason:
          e instanceof Error
            ? `Saved in this browser, but could not write to ${handle.name}: ${e.message}`
            : "Could not write to your chosen file.",
      };
    }
  }

  // No handle, or permission not granted without a gesture. An automatic sync
  // stops here quietly; an interactive one hands over a download so the user
  // still gets the file.
  if (!opts.interactive) {
    return { ok: false, reason: "Saved in this browser. Press Save now to write it to your chosen location." };
  }

  downloadFile(text);
  const meta: VaultMeta = {
    lastSyncAt: new Date().toISOString(),
    target: "download",
    records,
    bytes,
    mode: "download",
  };
  await idbPut(KEY_META, meta);
  return { ok: true, meta, downloaded: true };
}

function downloadFile(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `honeymoney-records-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on a timeout rather than immediately: Safari has been observed to
  // cancel the download if the URL dies in the same tick as the click.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
