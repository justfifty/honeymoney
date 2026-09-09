"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "../Logo";
import { Field } from "../AuthFields";

// The page says the same thing whether or not the address has an account —
// see api/auth/forgot. So the "sent" state is worded as a conditional, and it
// is the truth: if there is an account, a link is on its way.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not send a reset link.");
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send a reset link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Link href="/login" className="text-sm text-zinc-500 hover:underline">
          ← Back to log in
        </Link>
        <h1 className="mt-4 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Logo size={24} /> Forgot your password?
        </h1>

        {sent ? (
          <div className="mt-6 space-y-3" role="status">
            <p className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              If there is a HoneyMoney account for <span className="font-medium">{email}</span>, a
              reset link is on its way. It works for about 30 minutes.
            </p>
            <p className="text-sm text-zinc-500">
              Nothing after a few minutes? Check your spam folder, make sure the address is the one
              you signed up with, then{" "}
              <button
                type="button"
                onClick={() => setSent(false)}
                className="font-medium text-amber-600 hover:underline"
              >
                try again
              </button>
              .
            </p>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-zinc-500">
              Enter the email you signed up with and we&apos;ll send you a link to choose a new one.
            </p>
            <form onSubmit={submit} className="mt-6 space-y-3">
              <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
              {err && (
                <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                  {err}
                </p>
              )}
              <button
                type="submit"
                disabled={busy || !email}
                className="w-full rounded-lg bg-amber-500 px-4 py-2.5 font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
              >
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-sm text-zinc-500">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-amber-600 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
