"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deviceOnlyRecords, pendingCaptures, signOutAndForget } from "@/lib/localTeardown";

// Log out, and actually leave.
//
// This used to clear the cookie and stop. That was fine while the browser held
// only a session; it stopped being fine once the app started keeping a full
// snapshot of the household's records on the device for offline analysis. See
// lib/localTeardown.ts — the short version is that a shared family tablet is
// the device this product is for, and a log-out that leaves a readable copy of
// someone's finances behind is worse than no log-out at all.
//
// The one thing worth interrupting for is unsent captures. Everything else is
// recoverable by signing back in; a spend typed in a car park and not yet
// synced is not. So the confirm fires only when there is something to lose, and
// it says the number.

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      // Checked FIRST, and refused rather than confirmed. An unsent capture is
      // one record; device-only records can be a household's entire history,
      // and no dialog wording makes destroying that an acceptable thing to do
      // on a mis-tap. Save the file, then sign out.
      const deviceOnly = await deviceOnlyRecords();
      if (deviceOnly > 0) {
        window.alert(
          [
            `${deviceOnly} record${deviceOnly === 1 ? "" : "s"} exist only in this browser.`,
            "Your household keeps records on its own devices, so these are not on our server and we have no copy. Signing out would delete them.",
            'Open "Your copy" and press Save first — then sign out.',
          ].join("\n\n"),
        );
        setBusy(false);
        return;
      }

      const pending = await pendingCaptures();
      if (
        pending > 0 &&
        !window.confirm(
          `${pending} record${pending === 1 ? "" : "s"} you added while offline ${
            pending === 1 ? "has" : "have"
          } not reached the server yet.\n\n` +
            `Logging out now discards ${pending === 1 ? "it" : "them"}. Go back online first if you want ${
              pending === 1 ? "it" : "them"
            } saved.`,
        )
      ) {
        setBusy(false);
        return;
      }

      const r = await signOutAndForget();
      if (r.sent > 0) {
        // Not a confirm — the work is already done and there is nothing to
        // decide. Just do not let it pass unmentioned.
        console.info(`[honeymoney] sent ${r.sent} queued record(s) before signing out`);
      }
    } finally {
      setBusy(false);
      router.push("/");
      router.refresh();
    }
  }

  return (
    <button
      onClick={logout}
      disabled={busy}
      title="Signs out and removes this app's local copy of your records from this device"
      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
    >
      {busy ? "Signing out…" : "Log out"}
    </button>
  );
}
