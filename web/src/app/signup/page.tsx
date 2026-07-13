"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Logo from "../Logo";
import { Field, PasswordField, scorePassword } from "../AuthFields";

function SignupForm() {
  const router = useRouter();
  const search = useSearchParams();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // If they arrived from an invite link (/signup?code=ABCD-EFGH) the code is
  // prefilled, so joining a partner's household is one flow, not two.
  const [code, setCode] = useState(search.get("code") ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strength = scorePassword(password);
  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = !busy && password.length >= 8 && !mismatch && email.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Catch it here rather than after a round-trip — the server enforces the
    // same rules, but the user shouldn't have to wait to be told.
    if (password.length < 8) return setErr("Password must be at least 8 characters.");
    if (password !== confirm) return setErr("Those two passwords don't match.");

    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, inviteCode: code.trim() || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Sign-up failed");
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        ← Home
      </Link>
      <h1 className="mt-4 flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Logo size={24} /> Create your account
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        {code ? "You've been invited to join a household." : "Your household starts here."}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <Field
          label="Name"
          type="text"
          value={name}
          onChange={setName}
          autoComplete="name"
          required={false}
          placeholder="Optional"
        />
        <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          showStrength
        />
        <PasswordField
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          confirmAgainst={password}
        />
        <Field
          label="Invite code"
          type="text"
          value={code}
          onChange={setCode}
          required={false}
          placeholder="ABCD-EFGH"
          hint={
            code
              ? "You'll join that household instead of starting a new one."
              : "Leave blank to start your own household — a partner can join later."
          }
        />

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
          {busy ? "Creating…" : code ? "Join household" : "Create account"}
        </button>

        {tooShort && <p className="text-[11px] text-zinc-400">Password needs at least 8 characters.</p>}
        {!tooShort && password.length >= 8 && strength.score < 2 && (
          <p className="text-[11px] text-amber-600">
            That password is weak. It will work, but a longer one protects your family&apos;s finances better.
          </p>
        )}
      </form>

      <p className="mt-4 text-sm text-zinc-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-amber-600 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      {/* useSearchParams needs a Suspense boundary to prerender. */}
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </main>
  );
}
