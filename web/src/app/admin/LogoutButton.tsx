"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOutRisk, signOutAndForget } from "@/lib/localTeardown";

// Log out, and actually leave.
//
// This used to clear the cookie and stop. That was fine while the browser held
// only a session; it stopped being fine once the app started keeping a full
// snapshot of the household's records on the device for offline analysis. See
// lib/localTeardown.ts — the short version is that a shared family tablet is
// the device this product is for, and a log-out that leaves a readable copy of
// someone's finances behind is worse than no log-out at all.
//
// ── WHY THIS FILE CHANGED ──────────────────────────────────────────────────
//
// The guard was both wrong and inescapable. It counted every row in the local
// ledger, which since local-first capture means every spend ever typed on the
// device — nearly all of them already on the server. So one spend was enough to
// refuse sign-out permanently.
//
// And the refusal was a window.alert. An alert has one button, and it says OK.
// It told the reader to "open Your copy and press Save", named no route, linked
// to nothing, and — because saving does not empty the ledger — would have gone
// on refusing even if they had found it. Someone on a shared browser could not
// hand the device back to the person they share it with.
//
// Two rules came out of that, and they are why the code below looks like it
// does. A refusal must be ESCAPABLE: if the app will not do the thing, it has
// to carry you to whatever makes it possible, not name it and close. And it
// must be TRUE: refuse only for records that genuinely exist in one place.

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      const risk = await signOutRisk();

      // Refused, not confirmed. These records exist in exactly one place on
      // earth and no dialog wording makes destroying them acceptable on a
      // mis-tap. But the refusal now ENDS somewhere: OK goes to the page that
      // can fix it, with the Save button on it.
      if (risk.blocked > 0) {
        const n = risk.blocked;
        const go = window.confirm(
          [
            `${n} record${n === 1 ? "" : "s"} exist${n === 1 ? "s" : ""} only in this browser.`,
            "Your household keeps records on its own devices, so these are not on our server and we have no copy. Signing out would delete them.",
            "Press OK to open Your copy and save them — you can sign out straight after. Press Cancel to stay here.",
          ].join("\n\n"),
        );
        setBusy(false);
        if (go) router.push("/vault");
        return;
      }

      // Not yet on the server, but going there. Real loss if discarded, and
      // recoverable by going back online first — so it is the user's call.
      // signOutAndForget tries once more to send them before clearing anything.
      if (risk.unsent > 0) {
        const n = risk.unsent;
        const ok = window.confirm(
          `${n} record${n === 1 ? "" : "s"} you added ${n === 1 ? "has" : "have"} not reached the server yet.\n\n` +
            `Signing out now tries to send ${n === 1 ? "it" : "them"} first, and discards ${
              n === 1 ? "it" : "them"
            } if that fails. Go back online first if you want to be sure.`,
        );
        if (!ok) {
          setBusy(false);
          return;
        }
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
