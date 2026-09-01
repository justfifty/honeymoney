"use client";

import { useState } from "react";

// Shared auth inputs. These lived only inside login/page.tsx, so signup had a
// plain password box with no show/hide at all — you could mistype your password
// on the one screen where you can't verify it, and the 8-character rule was only
// enforced on the server, after the round-trip.

// ⚠️ AN OPAQUE BACKGROUND, NOT `bg-transparent`.
//
// This was transparent, which is the right default for an input INSIDE a card:
// everywhere else in the app these sit on a `bg-white dark:bg-zinc-900` panel,
// so transparency just inherits that panel and one less colour is declared.
//
// The auth pages have no panel. The form floats directly on the body — and
// `<HoneyField>` is a `fixed inset-0 -z-10` layer of 2 600 orange particles
// behind every page on desktop. With nothing between them, the decoration
// rendered THROUGH the email and password boxes: a login form with orange
// confetti scattered inside its input fields, which reads as a broken page
// rather than as a flourish. It is the one screen where a stranger decides
// whether this app looks like somewhere to type a password.
//
// Fixed here rather than on each page so the three auth screens (login, signup,
// join) cannot drift apart, and so any future form dropped onto a bare
// background inherits the fix instead of rediscovering the bug.
const INPUT =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900";

export function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  required = true,
  placeholder,
  hint,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 ${INPUT}`}
      />
      {hint && <span className="mt-1 block text-[11px] text-zinc-400">{hint}</span>}
    </label>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  showStrength = false,
  confirmAgainst,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  /** Show the live strength meter — on sign-up, not on log-in. */
  showStrength?: boolean;
  /** When set, this field is a confirmation and must equal that value. */
  confirmAgainst?: string;
}) {
  const [show, setShow] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [touched, setTouched] = useState(false);

  const mismatch = confirmAgainst !== undefined && touched && value.length > 0 && value !== confirmAgainst;

  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      <div className="relative mt-1">
        <input
          type={show ? "text" : "password"}
          value={value}
          required
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          // Caps Lock is the single most common cause of "my password doesn't
          // work" — and it's invisible while the field is masked.
          onKeyUp={(e) => setCapsLock(e.getModifierState?.("CapsLock") ?? false)}
          onKeyDown={(e) => setCapsLock(e.getModifierState?.("CapsLock") ?? false)}
          aria-invalid={mismatch || undefined}
          className={`${INPUT} pr-11 ${mismatch ? "border-rose-400 dark:border-rose-500" : ""}`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          title={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400 transition-colors hover:text-zinc-600 focus:text-amber-600 focus:outline-none dark:hover:text-zinc-200"
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>

      {capsLock && (
        <span className="mt-1 block text-[11px] text-amber-600">⇪ Caps Lock is on.</span>
      )}
      {mismatch && (
        <span className="mt-1 block text-[11px] text-rose-600">Those two passwords don&apos;t match.</span>
      )}
      {showStrength && value.length > 0 && <StrengthMeter password={value} />}
    </label>
  );
}

// ── Strength ────────────────────────────────────────────────────────────────

// A deliberately simple, honest estimator. It rewards LENGTH first, because
// length is what actually resists a brute-force attack — a 20-character
// passphrase beats "P@ssw0rd!" comfortably, even though the latter satisfies
// every "must contain a symbol" rule ever written.
const COMMON = [
  "password", "12345678", "qwerty", "letmein", "welcome", "admin", "iloveyou",
  "honeymoney", "abc123", "111111", "123456789", "monkey", "dragon",
];

export interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  advice: string;
}

export function scorePassword(pw: string): Strength {
  if (!pw) return { score: 0, label: "", advice: "" };

  const lower = pw.toLowerCase();
  if (COMMON.some((c) => lower.includes(c))) {
    return { score: 0, label: "Too guessable", advice: "That contains a very common password." };
  }

  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  if (classes >= 3) score++;

  // A single character repeated, or a straight run of digits, isn't strong
  // however long it is.
  if (/^(.)\1+$/.test(pw) || /^\d+$/.test(pw)) score = Math.min(score, 1);

  const clamped = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  const labels = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];
  const advice =
    clamped >= 3
      ? ""
      : pw.length < 12
        ? "Longer is stronger — try a short phrase you'll remember."
        : "Mix in another kind of character.";

  return { score: clamped, label: labels[clamped], advice };
}

function StrengthMeter({ password }: { password: string }) {
  const { score, label, advice } = scorePassword(password);
  const colors = ["bg-rose-500", "bg-rose-400", "bg-amber-400", "bg-emerald-400", "bg-emerald-500"];
  const tooShort = password.length < 8;

  return (
    <div className="mt-1.5">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= score ? colors[score] : "bg-zinc-200 dark:bg-zinc-700"
            }`}
          />
        ))}
      </div>
      <p
        className={`mt-1 text-[11px] ${score >= 3 ? "text-emerald-600" : "text-zinc-500"}`}
        role="status"
        aria-live="polite"
      >
        {tooShort ? "At least 8 characters." : label}
        {advice && !tooShort && <span className="text-zinc-400"> — {advice}</span>}
      </p>
    </div>
  );
}

// ── Icons ───────────────────────────────────────────────────────────────────

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
