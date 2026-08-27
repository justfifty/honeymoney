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
// Unsent captures are also never destroyed silently. `pendingCaptures()` exists
// so the UI can say "3 records have not been sent yet" and let the person
// decide, rather than a log-out quietly throwing away a spend they typed in a
// car park this morning.

import { flush, list } from "./offlineQueue";

/** How many offline captures are still waiting to reach the server. */
export async function pendingCaptures(): Promise<number> {
  try {
    return (await list()).filter((q) => !q.stuck).length;
  } catch {
    return 0;
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
      const r = await flush();
      sent = r.sent;
    }
  } catch {
    /* best effort — never block a sign-out on a sync */
  }

  const discarded = await pendingCaptures();

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
