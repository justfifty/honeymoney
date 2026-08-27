import Link from "next/link";
import type { Metadata } from "next";
import { NOTICE_VERSION } from "@/lib/consent";
import { TERMS_VERSION } from "@/lib/agreements";
import ReacceptButton from "./ReacceptButton";

export const metadata: Metadata = {
  title: "What changed · HoneyMoney",
  description:
    "A plain summary of the latest changes to HoneyMoney's privacy notice and terms of service, and the link to read both in full.",
};

// The change log a person can actually read.
//
// A diff between two versions of a legal document is not a disclosure; it is
// homework. What a household needs is the four or five sentences that say what
// is different and whether it costs them anything — with the full documents one
// tap away for the reader who wants them. So this page leads with the summary
// and treats "read it all" as the option, not the obligation.
//
// The entries are kept, not replaced, each time the versions are bumped. A
// change log with only the newest entry cannot answer "what was I agreeing to
// last March?", which is the question that actually gets asked.

interface Change {
  version: string;
  date: string;
  doc: "Privacy notice" | "Terms of service";
  points: string[];
}

const CHANGES: Change[] = [
  {
    version: NOTICE_VERSION,
    date: "27 August 2026",
    doc: "Privacy notice",
    points: [
      "We now name every third party that can receive anything, instead of describing them in the abstract: the AI providers individually (a local model on our own hardware, Google, Groq), Cloudflare, and — newly disclosed — Telegram, if you use the Telegram capture bot, and the public OpenTimestamps calendars, which receive a one-way fingerprint of your audit ledger and none of your records.",
      "We corrected where your data actually is. The notice said Singapore. The app runs on hardware we operate in Malaysia, and the database is run for us by our hosting provider on Oracle Cloud infrastructure elsewhere in the Asia-Pacific region. It is still a cross-border transfer, and it is now described accurately.",
      "A new section on the other people who appear in your records — your partner, a child you add as a member, anyone you name in a note — and what you are responsible for when you enter their details.",
      "A new section on employers and sponsors. Nothing of the kind is built or offered. The guarantees are written down now, before it exists: never a record, never a name, never an H-Score; group figures only, and only for groups of ten or more; opt-in, under a notice we would issue again.",
      "We say plainly what we do not do with your records: no profiling, no scoring you for anyone else, no automated decisions about you, and no training an AI model on them.",
      "We say plainly what we have not done: there has been no independent privacy audit or certification, and part of the service runs on our own hardware and can be offline.",
    ],
  },
  {
    version: TERMS_VERSION,
    date: "27 August 2026",
    doc: "Terms of service",
    points: [
      "A new clause saying the service is free of charge for households and what that does and does not promise — including that we will not start charging an existing account without asking you first, and that a sponsor paying for seats never becomes a party to your agreement or gets access to your records.",
      "The Money Health Score is not a credit score. It is not shared with any lender, insurer, landlord or employer, it has no bearing on your creditworthiness, and nobody may require you to show it.",
      "Forecasts and projections are stated as estimates and planning aids, to be checked against your own statements.",
      "What you are responsible for when you enter another person's details, and the confirmation that a child added to a household is one you are the parent or guardian of.",
      "The Telegram bot named as a separate choice, with a third party in the middle of it.",
    ],
  },
];

export default function LegalUpdatePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <nav className="text-sm">
        <Link href="/dashboard" className="text-zinc-500 hover:underline">
          ← Dashboard
        </Link>
      </nav>

      <header className="mt-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">What changed</h1>
        <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>Nothing here switches anything on.</strong> Every optional feature you had
          switched off is still switched off, and this page cannot change that. We revised both
          documents, mostly to name things we had described only in general terms, and you are
          entitled to see that before we carry on.
        </p>
      </header>

      <div className="mt-10 space-y-10">
        {CHANGES.map((c) => (
          <section key={`${c.doc}-${c.version}`}>
            <h2 className="font-display text-xl font-semibold tracking-tight">
              {c.doc}{" "}
              <span className="text-sm font-normal text-zinc-500">
                · version {c.version} · {c.date}
              </span>
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {c.points.map((p, i) => (
                <li key={i} className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {p}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-12 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Read them in full — both are in English and Bahasa Malaysia on one page:{" "}
          <Link href="/privacy" className="font-medium text-amber-600 hover:underline">
            Privacy notice
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="font-medium text-amber-600 hover:underline">
            Terms of service
          </Link>
        </p>
        <div className="mt-5">
          <ReacceptButton />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-zinc-500">
          If you would rather not continue under the revised documents, you can export everything
          from{" "}
          <Link href="/setup#privacy" className="underline underline-offset-2">
            Settings → Privacy
          </Link>{" "}
          and close your account from the same screen. Questions:{" "}
          <strong>privacy@honeymoney.app</strong>
        </p>
      </div>
    </main>
  );
}
