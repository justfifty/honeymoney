"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Consent, as a control the user can actually reach.
//
// A privacy notice that says "you may withdraw at any time" and offers no
// switch has made a promise it expects nobody to test. This is the switch. It
// writes through /api/account/consent, which appends to the consent ledger, so
// turning something off is a recorded event with a timestamp rather than a
// field quietly changing value.
//
// Each toggle saves ON ITS OWN, immediately. No "Save preferences" button:
// a batched form lets someone untick marketing, wander off, and remain opted in
// because they never pressed the button. Withdrawal should never depend on a
// second action.

interface PurposeState {
  key: string;
  required: boolean;
  directMarketing: boolean;
  granted: boolean;
  answeredAt: string | null;
  isStale: boolean;
}

const COPY: Record<string, { label: string; help: string }> = {
  core_processing: {
    label: "Run the app",
    help: "Store the records you enter and compute your H-Score. This is what HoneyMoney does — to stop it, close your account below.",
  },
  // Two switches, because they are two different bargains. See the note on
  // Purpose in lib/consent.ts.
  ai_phrasing: {
    label: "Let Honey word her answers",
    help: "Honey works out every figure on our own server either way — this only decides who writes the sentence around it. An outside AI service is sent placeholder names like {saving} and {gap}, plus your language. It is never sent your amounts, your labels, your merchants or your question. With this off you get the same numbers in fixed wording.",
  },
  ai_cloud_data: {
    label: "Let an AI service see your figures and receipts",
    help: "The only setting here that sends your own data outside. It covers three things: a receipt photo you scan, a bank statement you import, and the insight sentence on your dashboard — which is written from your real bucket names and amounts. It goes to Google (Gemini) or Groq on their free tiers, on servers that may be outside Malaysia. With this OFF you lose none of the app: receipts are still read on your own phone by the built-in scanner with nothing uploaded, statements are still parsed here, and the dashboard insight is still written — by our own code, from the same numbers. Turn it on if you want the extra accuracy on hard or handwritten receipts.",
  },
  // Retired in favour of the two above. Kept so a household whose ledger still
  // carries the old grant sees a name rather than a raw key.
  ai_processing: {
    label: "AI features (old setting)",
    help: "Replaced by the two settings above. Your earlier answer still counts as permission to word your answers, and never as permission to send your figures or receipts anywhere.",
  },
  partner_offers: {
    label: "Matched financial products",
    help: "Share your spending tier — a band, never your records — with licensed partners so they can offer relevant products.",
  },
  research_aggregate: {
    label: "Anonymous statistics",
    help: "Count your household in aggregate figures that cannot be traced back to you.",
  },
};

export default function PrivacyControls() {
  const [purposes, setPurposes] = useState<PurposeState[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/account/consent")
      .then((r) => r.json())
      .then((d) => {
        if (alive && d.ok) setPurposes(d.purposes);
      })
      .catch(() => {
        if (alive) setErr("Could not load your privacy settings.");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function toggle(p: PurposeState, next: boolean) {
    setBusy(p.key);
    setErr(null);
    setSaved(null);
    // Optimistic, because a consent toggle that lags feels like it did not
    // register — and a user who thinks a withdrawal failed will click again.
    setPurposes((cur) => cur?.map((x) => (x.key === p.key ? { ...x, granted: next } : x)) ?? cur);
    try {
      const r = await fetch("/api/account/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: p.key, granted: next }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not save that.");
      setSaved(next ? `Turned on — ${COPY[p.key]?.label ?? p.key}.` : `Stopped — ${COPY[p.key]?.label ?? p.key}.`);
    } catch (e) {
      // Roll back, or the screen claims a state the ledger does not have.
      setPurposes((cur) => cur?.map((x) => (x.key === p.key ? { ...x, granted: !next } : x)) ?? cur);
      setErr(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setBusy(null);
    }
  }

  if (!purposes) {
    return <p className="text-zinc-500">{err ?? "Loading…"}</p>;
  }

  return (
    <div>
      <p className="mb-4 text-zinc-600 dark:text-zinc-400">
        What you have agreed to. Each one saves the moment you change it.{" "}
        <Link href="/privacy" className="text-amber-600 hover:underline">
          Read the full notice
        </Link>{" "}
        ·{" "}
        <Link href="/legal/ai" className="text-amber-600 hover:underline">
          What the AI features send
        </Link>
      </p>

      <div className="space-y-3">
        {purposes.map((p) => {
          const copy = COPY[p.key] ?? { label: p.key, help: "" };
          return (
            <div
              key={p.key}
              className="flex gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <input
                id={`consent-${p.key}`}
                type="checkbox"
                checked={p.granted}
                disabled={p.required || busy === p.key}
                onChange={(e) => toggle(p, e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-none accent-amber-500 disabled:opacity-50"
              />
              <div className="min-w-0">
                <label htmlFor={`consent-${p.key}`} className="block text-sm font-medium">
                  {copy.label}
                  {p.required && (
                    <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-zinc-500 dark:bg-zinc-800">
                      comes with the account
                    </span>
                  )}
                  {p.directMarketing && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                      marketing
                    </span>
                  )}
                </label>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{copy.help}</p>
                {p.answeredAt && (
                  <p className="mt-1 text-[11px] text-zinc-400">
                    You answered this on {new Date(p.answeredAt).toLocaleDateString("en-MY")}
                    {p.isStale && " · the notice has changed since"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {err && (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
          {err}
        </p>
      )}
      {saved && !err && <p className="mt-3 text-xs text-emerald-600">{saved}</p>}

      {/* Portability, as a link rather than a request form. The right exists
          either way; making someone email us for it would be technically
          compliant and practically a deterrent. */}
      <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <a
          href="/api/account/export"
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          ⬇️ Download everything we hold
        </a>
        <p className="mt-2 text-xs text-zinc-500">
          A JSON file with your household&apos;s records, members, scores and
          consent history. Records another member marked personal are not
          included — this is your view.
        </p>
      </div>
    </div>
  );
}
