"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Logo from "../Logo";
import { Field, PasswordField, scorePassword } from "../AuthFields";
import { PARTNER_OFFERS_ENABLED } from "@/lib/consent";

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

  // Every optional purpose starts FALSE and there is no "select all". Opt-in
  // that arrives pre-ticked is not opt-in, and a bundled agreement to unrelated
  // purposes is the single most-fined pattern in modern privacy enforcement.
  // Keeping these as three independent booleans rather than one object makes it
  // structurally impossible to flip them together by accident.
  // Two separate answers, because they are two separate bargains: one sends
  // nothing about the household, the other uploads its documents. Both start
  // false -- a signup form is the worst possible place to pre-tick either.
  const [aiOk, setAiOk] = useState(false);
  const [aiDocsOk, setAiDocsOk] = useState(false);
  const [partnerOk, setPartnerOk] = useState(false);
  const [researchOk, setResearchOk] = useState(false);

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
        body: JSON.stringify({
          email,
          password,
          name,
          inviteCode: code.trim() || undefined,
          consents: {
            ai_phrasing: aiOk,
            ai_cloud_data: aiDocsOk,
            partner_offers: partnerOk,
            research_aggregate: researchOk,
          },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Sign-up failed");
      router.push("/record");
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

        {/* ── What we do with your records ────────────────────────────────
            Three separate asks, all off, none of them a condition of signing
            up. The required processing is stated as a term above them because
            presenting "agree or the app does nothing" as a tickbox is the
            forced-consent pattern, not a choice. */}
        <fieldset className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Your records
          </legend>
          <p className="text-xs leading-relaxed text-zinc-500">
            To run the app we record and score the money you enter. That is what
            HoneyMoney is, so it comes with the account — you can end it at any
            time by closing the account, and export everything first.{" "}
            <Link href="/privacy" className="font-medium text-amber-600 hover:underline">
              What we collect, and why
            </Link>
          </p>

          <div className="mt-3 space-y-2.5">
            <Consent
              checked={aiOk}
              onChange={setAiOk}
              label="Let Honey word her answers"
              help="An AI service is sent placeholder names like {saving} — never your amounts, merchants or question. Off means the same numbers in fixed wording."
            />
            <Consent
              checked={aiDocsOk}
              onChange={setAiDocsOk}
              label="Let an AI service see your figures and receipts"
              help="The only one that sends your data outside — to Google or Groq, possibly outside Malaysia. Covers scanned receipts, imported statements and your dashboard insight. Off means receipts are still scanned on your phone, and nothing is uploaded."
            />
            {/* Not offered yet — see PARTNER_OFFERS_ENABLED in lib/consent.ts.
                Asking for a purpose we are not licensed to act on would collect
                consent we cannot lawfully use, which is worse than not asking. */}
            {PARTNER_OFFERS_ENABLED && (
            <Consent
              checked={partnerOk}
              onChange={setPartnerOk}
              label="Show me matched financial products"
              help="Shares your spending tier — never your records — with licensed partners so they can offer relevant products. Off by default. You can withdraw this at any time and we stop immediately."
            />
            )}
            <Consent
              checked={researchOk}
              onChange={setResearchOk}
              label="Include me in anonymous statistics"
              help="Counts your household in aggregate figures like “spending power across Klang Valley”. Nothing that identifies you leaves in this form."
            />
          </div>
        </fieldset>

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

        {/* Acceptance has to be VISIBLE to be acceptance. The server records a
            row against this version either way, and a row saying someone agreed
            to something they were never shown is evidence of the wrong thing.
            The data-minimisation sentence is here rather than only in the notice
            because it is the answer to the question a person is actually asking
            at this button: what are you about to take from me? */}
        <p className="text-xs leading-relaxed text-zinc-500">
          By creating an account you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300">
            Terms of Use
          </Link>{" "}
          and acknowledge the{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300">
            Privacy Notice
          </Link>
          . HoneyMoney collects only what is needed to create and secure your account and to provide
          the features you choose. The three boxes above are optional and are not a condition of
          signing up.
        </p>

        {/* Two facts a new account holder should meet BEFORE the account
            exists, not after they have entered a month of spending. */}
        <ul className="space-y-1 text-xs leading-relaxed text-zinc-500">
          <li>
            🔒 <strong className="text-zinc-600 dark:text-zinc-400">Private by default.</strong> If
            you later share a household, your individual transactions, receipts, goals, score and
            forecast stay private unless you switch them on.
          </li>
          <li>
            ⚠️{" "}
            <strong className="text-zinc-600 dark:text-zinc-400">
              Educational tool, not financial advice.
            </strong>{" "}
            HoneyMoney is not a bank or a licensed adviser and guarantees no outcome.{" "}
            <Link
              href="/legal/disclaimer"
              className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Where that line sits
            </Link>
          </li>
          <li>
            📄 All eleven notices, in English and Bahasa Malaysia:{" "}
            <Link
              href="/legal"
              className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              honeymoney.app/legal
            </Link>
          </li>
        </ul>

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

/**
 * One optional purpose, with its explanation always visible.
 *
 * The help text is not behind a tooltip or a "learn more" on purpose. Consent
 * is only as valid as what the person was actually shown, and text that
 * requires a hover to read was, in practice, not shown.
 */
function Consent({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help: string;
}) {
  return (
    <label className="flex cursor-pointer gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-none accent-amber-500"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs leading-relaxed text-zinc-500">{help}</span>
      </span>
    </label>
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
