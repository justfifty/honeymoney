"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { flush, list, offlineQueueAvailable, type QueuedCapture } from "@/lib/offlineQueue";
import { autoSyncIfStale } from "@/lib/localVault";
import { pendingSync, stuckRecords, syncLedger } from "@/lib/localLedger";

// Registers the service worker, drains the offline queue, and tells the user
// which of those two things is currently true.
//
// The status bar is not decoration. An app that quietly queues a spend and says
// nothing has, from the user's side, lost it — they tap save, the screen does
// what it always does, and there is no way to tell whether the record exists.
// So an offline save is announced, the count of waiting items is visible, and
// the moment they land is announced too.
//
// Renders nothing at all when online with an empty queue, which is almost
// always. A permanent connectivity badge is noise that trains people to ignore
// the one time it matters.

// Connectivity read through useSyncExternalStore rather than mirrored into
// state by an effect. `navigator.onLine` is exactly what this hook is for — an
// external, mutable value with its own subscription — and reading it via
// setState in an effect means the first paint always claims "online" and then
// corrects itself, which on a genuinely offline load is a flash of the wrong
// answer at the one moment the right answer matters.
function subscribeOnline(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export default function OfflineGate() {
  // Server snapshot is `true`: the server has no opinion on the client's
  // connectivity, and rendering an offline bar into the HTML of a page that was
  // successfully fetched over the network would be self-evidently wrong.
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const [queued, setQueued] = useState<QueuedCapture[]>([]);
  const [ledgerWaiting, setLedgerWaiting] = useState(0);
  const [ledgerStuck, setLedgerStuck] = useState(0);
  const [justSent, setJustSent] = useState(0);

  const refresh = useCallback(async () => {
    setQueued(await list());
    setLedgerWaiting((await pendingSync().catch(() => [])).length);
    setLedgerStuck((await stuckRecords().catch(() => [])).length);
  }, []);

  const drain = useCallback(async () => {
    if (!navigator.onLine) return;
    // The ledger is the live path; the queue is legacy and drained so that
    // anything already sitting in it from before the inversion is not stranded
    // on somebody's phone forever.
    await syncLedger().catch(() => undefined);
    const r = await flush();
    if (r.sent > 0) {
      setJustSent(r.sent);
      // Long enough to be read, short enough not to become furniture.
      setTimeout(() => setJustSent(0), 6000);
    }
    await refresh();
  }, [refresh]);

  useEffect(() => {
    // Listener teardown collected as we go, so a conditionally-registered
    // listener does not need a second conditional in the cleanup.
    const cleanups: (() => void)[] = [];

    // Registered here rather than in a layout script tag so it happens once,
    // after hydration, and cannot block first paint.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* unsupported, or blocked by policy — the app works, just not offline */
      });

      // ── RECOVERING FROM A DEAD BUILD ──────────────────────────────────
      //
      // The worker posts this when a content-hashed `/_next/static` asset
      // 404s, which means the page currently on screen came from a build that
      // no longer exists. That page is not merely stale, it is INERT: the
      // stylesheet and the client bundle are both gone, so it renders as
      // unstyled HTML with giant unsized icons, the login form does not
      // submit and the hamburger menu does not open. There is no React on it
      // to notice, and nothing the user can do except guess that a hard
      // refresh might help.
      //
      // The worker has already dropped the cached HTML by the time this
      // arrives, so one reload fetches the live document and its live assets.
      //
      // ONCE PER TAB, and that guard is the important half. The other cause of
      // a 404 here is a genuinely broken deploy, where reloading fetches the
      // same broken page and asks again — an infinite refresh loop, which is a
      // far worse experience than the unstyled page it was trying to fix.
      // sessionStorage rather than a ref: the reload destroys the ref.
      const onMessage = (e: MessageEvent) => {
        if (e.data?.type !== "hm-stale-build") return;
        try {
          if (sessionStorage.getItem("hm.staleBuildReloaded") === "1") return;
          sessionStorage.setItem("hm.staleBuildReloaded", "1");
        } catch {
          // Private mode with storage blocked. Do NOT reload without the
          // guard — an unstyled page is survivable, a refresh loop is not.
          return;
        }
        location.reload();
      };
      navigator.serviceWorker.addEventListener("message", onMessage);
      cleanups.push(() => navigator.serviceWorker.removeEventListener("message", onMessage));
    }

    // Reading IndexedDB and draining the queue are exactly the "synchronise
    // with an external system" case effects exist for, and both setState calls
    // happen after an await rather than in this body. The lint rule cannot see
    // across the async boundary, so it is silenced here with the reason rather
    // than the code being contorted to please it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    void drain();
    // Keep the household's own copy current without them having to think about
    // it. Quiet by design: no permission prompt, no download, no error surfaced
    // — a local-first promise that depends on remembering to press a button is
    // not a promise. See autoSyncIfStale on why six hours and not six minutes.
    void autoSyncIfStale();

    // Draining is separate from the connectivity read above: that hook only
    // reports the state, this listener acts on the transition.
    const goOnline = () => void drain();
    window.addEventListener("online", goOnline);
    // Coming back to a backgrounded tab is the other moment a connection
    // typically returns without an `online` event firing.
    const onVisible = () => {
      if (document.visibilityState === "visible") void drain();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("online", goOnline);
      document.removeEventListener("visibilitychange", onVisible);
      for (const off of cleanups) off();
    };
  }, [refresh, drain]);

  const waiting = queued.filter((q) => !q.stuck).length + ledgerWaiting;
  const stuck = queued.filter((q) => q.stuck).length + ledgerStuck;

  if (online && waiting === 0 && stuck === 0 && justSent === 0) return null;
  if (!offlineQueueAvailable() && online) return null;

  if (justSent > 0) {
    return (
      <div className="bg-emerald-600 px-4 py-2 text-center text-xs font-medium text-white">
        ✓ Sent {justSent} {justSent === 1 ? "record" : "records"} saved while you were offline.
      </div>
    );
  }

  if (stuck > 0) {
    return (
      <div className="bg-rose-600 px-4 py-2 text-center text-xs font-medium text-white">
        {stuck} {stuck === 1 ? "record has" : "records have"} failed to send several times. They are
        still on this device — open Settings to see them.
      </div>
    );
  }

  return (
    <div className="bg-zinc-800 px-4 py-2 text-center text-xs font-medium text-amber-200">
      {online ? "Syncing" : "Offline"}
      {waiting > 0 && (
        <>
          {" — "}
          {waiting} {waiting === 1 ? "record is" : "records are"} saved on this device and will be
          sent when you are back.
        </>
      )}
      {!online && waiting === 0 && " — you can still record spending and scan receipts."}
    </div>
  );
}
