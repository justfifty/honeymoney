// Everything HoneyMoney leaves on a device, and how to take it back off.
//
// ── THE BUG THIS EXISTS TO FIX ─────────────────────────────────────────────
//
// Signing out cleared the auth cookie and nothing else. That was defensible
// when the browser held nothing but a session; it stopped being defensible the
// moment this app started keeping things locally. As of today a signed-out
// device could still be holding:
//
//   • a COMPLETE snapshot of the household's records, in IndexedDB, put there
//     by the local vault so it could be analysed offline
//   • signed-in pages — /dashboard, /records, /setup — in the service worker's
//     cache, because navigations are cached network-first
//   • captures recorded offline and not yet sent
//
// The device this matters on is the shared family tablet, which is precisely
// the device this product is for. "Log out" that leaves a readable copy of
// someone's finances behind is worse than no log-out button, because the person
// pressing it believes they have finished.
//
// ── WHAT IS DELIBERATELY NOT DESTROYED ─────────────────────────────────────
//
// The file the user chose to keep their records in. That is THEIRS — it may be
// on a USB stick, in a Drive folder, or on an SD card, and deleting somebody's
// own data because they signed out of a website would be an extraordinary thing
// to do. Signing out forgets where it is; it does not reach through and erase
// it.
//
// Unsent captures are also never destroyed silently. `signOutRisk()` exists so
// the UI can say "3 records have not been sent yet" and let the person decide,
// rather than a log-out quietly throwing away a spend they typed in a car park
// this morning.
//
// There is deliberately ONE such counter. There used to be two — a queue count
// and a ledger count — and the sign-out path checked the wrong one against the
// wrong records. A second nearly-right way to ask "what would I lose?" is how
// that happened, so it is not left lying around for the next caller.

import { flush, list } from "./offlineQueue";
import { listLocalRecords, syncLedger, type LocalRecord } from "./localLedger";
import { getMeta } from "./localVault";

/**
 * What signing out on this device would actually destroy.
 *
 * ── THE BUG THIS REPLACES ──────────────────────────────────────────────────
 *
 * This used to be `deviceOnlyRecords()`, and it returned the LENGTH OF THE
 * WHOLE LOCAL LEDGER. That was true when only local-only households wrote
 * there. It stopped being true when the ordinary capture path started writing
 * every spend locally first (origin "local_first") — from then on the ledger
 * held a row for every record ever typed on the device, and the overwhelming
 * majority of them were sitting safely on the server with `syncedAt` set.
 *
 * The effect: add one spend, and sign-out refused for ever. It told you to save
 * a copy first, and saving did not help, because writing the vault file does
 * not remove rows from the ledger — so the count it was checking could never
 * reach zero. There was no sequence of actions that unblocked it. Reported from
 * a shared household browser where two people take turns signing in, which is
 * precisely the device this product is for and the one place sign-out has to
 * work.
 *
 * ── WHAT IS ACTUALLY AT RISK ───────────────────────────────────────────────
 *
 *   blocked  — local-only records that are not in the user's own file yet.
 *              These exist in one place on earth and sign-out deletes it.
 *   unsent   — records that have not reached the server. Real loss, but a
 *              capture rather than an archive, and recoverable by going back
 *              online first. The user decides.
 *
 * A local-only record that IS in the file is not at risk and does not appear in
 * either number: the file is the copy, and the whole point of keeping one is
 * that the browser is then disposable.
 */
export interface SignOutRisk {
  /** Local-only records not yet written to the user's file. Refuse on these. */
  blocked: number;
  /** Records not yet acknowledged by the server. Confirm on these. */
  unsent: number;
  /** True when a saved copy exists and is current enough to cover `blocked`. */
  copyCoversAll: boolean;
}

/**
 * The decision itself, as a pure function of what the device holds.
 *
 * Split out from the storage reads on purpose. The bug this file exists to fix
 * was not a broken IndexedDB call — every read worked perfectly and returned
 * exactly what it was asked for. It was a WRONG PREDICATE, which is the kind of
 * defect that looks correct in review, cannot be reproduced without a populated
 * browser, and is only caught by asking the rule directly. So the rule is
 * asked directly, by scripts/check-signout.mts.
 *
 * @param rows    every row in the local ledger
 * @param savedAt when the user's own file was last written, or 0 for never
 * @param queued  entries still sitting in the legacy offline queue
 */
export function assessSignOutRisk(
  rows: Pick<LocalRecord, "origin" | "syncedAt" | "createdAt">[],
  savedAt: number,
  queued: number,
): SignOutRisk {
  // syncedAt is the whole test. A row the server has acknowledged is a cache of
  // something safe, and counting it as a risk is what made sign-out impossible.
  const unacknowledged = rows.filter((r) => !r.syncedAt);
  const localOnly = unacknowledged.filter((r) => r.origin === "local_only");
  const unsent = unacknowledged.filter((r) => r.origin !== "local_only");

  // A local-only record is covered once the file was written AFTER it was
  // recorded — sync() folds the whole ledger into the snapshot, so one write
  // covers everything that existed at that moment. Compared per record rather
  // than by count, because "the file has 12 records and so do I" is also true
  // when they are twelve different records.
  const uncovered = savedAt
    ? localOnly.filter((r) => new Date(r.createdAt).getTime() > savedAt)
    : localOnly;

  return {
    blocked: uncovered.length,
    // The old offline queue and the ledger's own unsent rows are the same risk
    // wearing two hats. Counting only the queue is how an unsent ledger record
    // would have been swept out silently once the refusal above stopped
    // catching it.
    unsent: unsent.length + queued,
    copyCoversAll: localOnly.length > 0 && uncovered.length === 0,
  };
}

export async function signOutRisk(): Promise<SignOutRisk> {
  try {
    const [rows, meta, queued] = await Promise.all([
      listLocalRecords().catch(() => []),
      getMeta().catch(() => null),
      list()
        .then((q) => q.filter((e) => !e.stuck).length)
        .catch(() => 0),
    ]);
    const savedAt = meta ? new Date(meta.lastSyncAt).getTime() : 0;
    return assessSignOutRisk(rows, Number.isFinite(savedAt) ? savedAt : 0, queued);
  } catch {
    // Storage unreadable means there is nothing local to lose.
    return { blocked: 0, unsent: 0, copyCoversAll: false };
  }
}

async function deleteDatabase(name: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    // Resolve on every outcome including `blocked`, which happens when another
    // tab still holds the database open. A sign-out that hangs because a second
    // tab is open is a sign-out people force-quit halfway through.
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
    setTimeout(resolve, 3000);
  });
}

/**
 * Drop every page the service worker cached.
 *
 * The OCR cache is kept: it holds no personal data, it is 28 MB, and re-fetching
 * it would punish the next sign-in on a metered connection for no privacy gain.
 * Everything else goes, because a cached HTML page of somebody's dashboard is
 * the same disclosure as the dashboard.
 */
export async function clearPageCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => !n.includes("-ocr")).map((n) => caches.delete(n)));
  } catch {
    /* storage blocked — nothing cached to clear */
  }
}

export interface TeardownResult {
  /** Captures that were still unsent and are now gone. Zero on the happy path. */
  discarded: number;
  sent: number;
}

/**
 * Sign out and leave nothing readable behind.
 *
 * Tries to SEND pending captures before clearing, because losing a record the
 * user typed is a worse failure than a slow log-out. What cannot be sent — the
 * device is offline, the server is down — is reported back so the UI can say so
 * rather than pretending the queue was empty.
 */
export async function signOutAndForget(): Promise<TeardownResult> {
  let sent = 0;
  try {
    if (navigator.onLine) {
      // BOTH stores. The queue is the old path; the ledger is where every
      // ordinary capture now waits. Flushing only the first left a record that
      // had never reached the server to be deleted three lines later by the
      // very function whose contract is that it tries to save things first.
      const [q, l] = await Promise.all([flush(), syncLedger().catch(() => ({ sent: 0 }))]);
      sent = q.sent + l.sent;
    }
  } catch {
    /* best effort — never block a sign-out on a sync */
  }

  const discarded = (await signOutRisk()).unsent;

  // The cookie first. If anything below throws, the session is already dead,
  // which is the half that matters most.
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    /* offline: the cookie is cleared below by the browser on expiry anyway */
  }

  await Promise.all([
    deleteDatabase("honeymoney-vault"),
    deleteDatabase("honeymoney-offline"),
    clearPageCaches(),
  ]);

  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* private mode */
  }

  return { discarded, sent };
}

/**
 * Wipe whatever a previous session left behind, at the START of a new one.
 *
 * Sign-out already does this, but sign-out is a button people forget. On a
 * shared household tablet the realistic sequence is that one person walks away
 * still signed in and the next person signs in over the top — at which point
 * the second person inherits the first person's cached pages and, offline,
 * could read them. Clearing on the way IN closes that without depending on
 * anybody's discipline.
 *
 * The offline queue is deliberately NOT cleared here: unsent captures belong to
 * whoever typed them and are about to be sent by the flush on the next load.
 * Destroying them because somebody signed in would lose real records.
 */
export async function clearPriorSession(): Promise<void> {
  await Promise.all([deleteDatabase("honeymoney-vault"), clearPageCaches()]);
}
