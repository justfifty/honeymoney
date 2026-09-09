"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "../Logo";
import { PasswordField, scorePassword } from "../AuthFields";

// Landed on from the email: /reset-password?token=…
//
// The token is the whole credential, so the page never shows it, never stores
// it, and sends it exactly once. It arrives as a prop from the server page
// rather than through useSearchParams, so the form is in the first byte of
// HTML instead of appearing after hydration — a person tapping an email link
// on a phone should not see a blank card first. A page opened without one — a
// link mangled by a mail client, or typed by hand — is told plainly where to
// get another.
export default function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strength = scorePassword(password);
  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = Boolean(token) && password.length >= 8 && confirm === password && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not reset the password.");
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not reset the password.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="w-full max-w-sm">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Logo size={24} /> Reset link incomplete
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          This page needs the link from your reset email. Open the email and tap the link again, or
          request a fresh one.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-block rounded-lg bg-amber-500 px-4 py-2.5 font-medium text-white hover:bg-amber-600"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="w-full max-w-sm" role="status">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Logo size={24} /> Password updated
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          You can log in with your new password now. Anywhere else you were signed in has been
          signed out.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-lg bg-amber-500 px-4 py-2.5 font-medium text-white hover:bg-amber-600"
        >
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Logo size={24} /> Choose a new password
      </h1>
      <p className="mt-1 text-sm text-zinc-500">At least 8 characters. A few words you&apos;ll remember beat a short scramble.</p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <PasswordField
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          showStrength
        />
        <PasswordField
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          confirmAgainst={password}
        />
        {tooShort && <p className="text-xs text-zinc-500">Needs at least 8 characters.</p>}
        {!tooShort && password.length >= 8 && strength.score < 2 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            That one would be easy to guess. Longer, or less predictable, helps.
          </p>
        )}
        {mismatch && <p className="text-xs text-rose-600">The two passwords don&apos;t match yet.</p>}
        {err && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            {err}
          </p>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-lg bg-amber-500 px-4 py-2.5 font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Set new password"}
        </button>
      </form>

      <p className="mt-6 text-sm text-zinc-500">
        Link expired?{" "}
        <Link href="/forgot-password" className="font-medium text-amber-600 hover:underline">
          Request a new one
        </Link>
      </p>
    </div>
  );
}
