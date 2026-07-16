"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AccessRole } from "@/lib/household";

// The reversible-delete UI. Which controls appear is decided server-side (role +
// whether the household is shared) and passed in, so this component only renders
// and calls — it never re-derives the rules.
export default function AccountActions({
  email,
  role,
  shared,
  soleOwner,
  pending,
  purgeAtISO,
  graceDays,
}: {
  email: string;
  role: AccessRole;
  shared: boolean;
  soleOwner: boolean;
  pending: boolean;
  purgeAtISO?: string;
  graceDays: number;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "soft" | "left">(null);

  const purgeDate = purgeAtISO
    ? new Date(purgeAtISO).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : null;

  async function post(path: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      return data as { mode?: "soft" | "left" };
    } finally {
      setBusy(false);
    }
  }

  async function onRestore() {
    try {
      await post("/api/account/restore");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed.");
    }
  }

  async function onDelete() {
    try {
      const data = await post("/api/account/delete");
      setDone(data.mode ?? "left"); // session is now cleared server-side
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  // ── Already scheduled for deletion — offer restore ──────────────────────────
  if (pending) {
    return (
      <section className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm dark:border-amber-800 dark:bg-amber-950/30">
        <h2 className="text-base font-semibold text-amber-800 dark:text-amber-300">
          ⏳ Scheduled for deletion
        </h2>
        <p className="mt-2 text-amber-800/90 dark:text-amber-200/90">
          This household will be <b>permanently deleted{purgeDate ? ` on ${purgeDate}` : ""}</b>. Until then
          nothing is lost — you can bring it all back.
        </p>
        <button
          type="button"
          onClick={onRestore}
          disabled={busy}
          className="mt-4 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? "Restoring…" : "Restore my account"}
        </button>
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </section>
    );
  }

  // ── Post-delete confirmation ────────────────────────────────────────────────
  if (done) {
    return (
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold">👋 You&apos;re signed out</h2>
        {done === "soft" ? (
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Your account is scheduled for deletion and will be permanently removed in {graceDays} days.
            Changed your mind? Sign back in within {graceDays} days and choose <b>Restore</b>.
          </p>
        ) : (
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            You&apos;ve left the household and your login has been removed. Your past entries stay with the
            household for the others.
          </p>
        )}
        <Link href="/" className="mt-4 inline-block rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-600">
          Back to home
        </Link>
      </section>
    );
  }

  // ── Children: owner-managed, no self-service delete ─────────────────────────
  if (role === "child") {
    return (
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold">Delete account</h2>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Child accounts are managed by a household owner. Ask an owner to remove your account from the{" "}
          <Link href="/household" className="text-amber-600 hover:underline">Household</Link> page.
        </p>
      </section>
    );
  }

  // ── Sole owner of a shared household: must hand over first ───────────────────
  if (soleOwner) {
    return (
      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-5 text-sm dark:border-amber-900 dark:bg-amber-950/20">
        <h2 className="text-base font-semibold">Delete account</h2>
        <p className="mt-2 text-zinc-700 dark:text-zinc-300">
          You&apos;re the only <b>owner</b> of a shared household. Make someone else an owner on the{" "}
          <Link href="/household" className="text-amber-600 hover:underline">Household</Link> page first, so the
          household isn&apos;t left unmanaged — then you can delete your account.
        </p>
      </section>
    );
  }

  // ── Danger zone: leave (shared) or soft-delete (solo) ───────────────────────
  const canConfirm = confirm.trim().toLowerCase() === email.toLowerCase();
  return (
    <section className="mt-6 rounded-2xl border border-red-200 bg-red-50/50 p-5 text-sm dark:border-red-900/60 dark:bg-red-950/20">
      <h2 className="text-base font-semibold text-red-700 dark:text-red-300">⚠️ Danger zone</h2>
      {shared ? (
        <p className="mt-2 text-zinc-700 dark:text-zinc-300">
          Deleting your account <b>removes your login and leaves this household</b>. The shared records stay
          for everyone else; your past entries remain (no longer attributed to you). This can&apos;t be undone
          from here — you&apos;d need a new invite to rejoin.
        </p>
      ) : (
        <p className="mt-2 text-zinc-700 dark:text-zinc-300">
          Deleting your account <b>schedules this household and all its data for deletion</b>. It stays
          recoverable for <b>{graceDays} days</b> (sign back in and choose Restore); after that it&apos;s
          permanently erased.
        </p>
      )}

      <label className="mt-4 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Type your email <span className="font-mono">{email}</span> to confirm
        <input
          type="email"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          placeholder={email}
        />
      </label>

      <button
        type="button"
        onClick={onDelete}
        disabled={!canConfirm || busy}
        className="mt-3 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Working…" : shared ? "Leave & delete my account" : "Delete my account"}
      </button>
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </section>
  );
}
