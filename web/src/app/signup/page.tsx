"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "../Logo";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
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
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">← Home</Link>
        <h1 className="mt-4 flex items-center gap-2 text-2xl font-semibold tracking-tight"><Logo size={24} /> Create your account</h1>
        <p className="mt-1 text-sm text-zinc-500">Free — your data stays in your household graph.</p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <Field label="Name" type="text" value={name} onChange={setName} autoComplete="name" required={false} />
          <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <Field label="Password (min 8 chars)" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
          {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-amber-500 px-4 py-2.5 font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-amber-600 hover:underline">Log in</Link>
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  required = true,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-amber-500 dark:border-zinc-700"
      />
    </label>
  );
}
