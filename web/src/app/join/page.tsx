"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Logo from "../Logo";
import { Field } from "../AuthFields";

// Redeem an invite when you already have an account. (During sign-up the code
// goes in on that form instead — this is the "I'm already a user" path.)
function JoinForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [code, setCode] = useState(search.get("code") ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/household/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (res.status === 401) {
        // They have a code but no session — send them to log in and come back.
        router.push(`/login?next=/join?code=${encodeURIComponent(code)}`);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "That code didn't work.");
      setOk(data.tenant?.name ?? "the household");
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1200);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That code didn't work.");
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
        <Logo size={24} /> Join a household
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Enter the code your partner sent you. You keep your own login — you&apos;ll just start
        sharing their records.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <Field
          label="Invite code"
          type="text"
          value={code}
          onChange={(v) => setCode(v.toUpperCase())}
          placeholder="ABCD-EFGH"
        />
        {err && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            {err}
          </p>
        )}
        {ok && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            ✅ You&apos;ve joined {ok}. Taking you to the dashboard…
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !code.trim() || Boolean(ok)}
          className="w-full rounded-lg bg-amber-500 px-4 py-2.5 font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
        >
          {busy ? "Joining…" : "Join household"}
        </button>
      </form>

      <p className="mt-4 text-sm text-zinc-500">
        Don&apos;t have an account yet?{" "}
        <Link href={`/signup?code=${encodeURIComponent(code)}`} className="font-medium text-amber-600 hover:underline">
          Sign up with this code
        </Link>
      </p>
    </div>
  );
}

export default function JoinPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Suspense fallback={null}>
        <JoinForm />
      </Suspense>
    </main>
  );
}
