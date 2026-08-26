import Link from "next/link";
import type { Metadata } from "next";
import { TERMS_SECTIONS } from "./notice";
import { TERMS_VERSION, OPERATOR } from "@/lib/agreements";

export const metadata: Metadata = {
  title: "Terms of service · HoneyMoney",
  description:
    "What HoneyMoney does, what it does not do, and what you agree to by using it. In English and Bahasa Malaysia.",
};

// Both languages on ONE page, mirroring /privacy — see the note in
// app/privacy/page.tsx. A switcher would make the Malay something a reader has
// to go and find, and rendering both from one array means a clause can never be
// quietly live in one language and missing in the other.
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <nav className="text-sm">
        <Link href="/" className="text-zinc-500 hover:underline">
          ← Home
        </Link>
      </nav>

      <header className="mt-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">Terms of service</h1>
        <p className="mt-1 text-lg text-zinc-500">Terma Perkhidmatan</p>
        <p className="mt-4 text-sm text-zinc-500">
          Version {TERMS_VERSION} · Operated by {OPERATOR} · Governed by the laws of Malaysia
        </p>

        {/* The disclaimer, at the top rather than buried in clause 8. It is the
            single most important thing on this page and the thing a reader is
            least likely to scroll for. */}
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-semibold">Not financial advice.</p>
          <p className="mt-1">
            HoneyMoney records and organises your own money so you can see it clearly. It is not a
            licensed financial adviser, not a bank, and it never holds or moves your money. Every
            figure is calculated from what you enter. Decisions are yours. For advice, speak to a
            licensed financial planner or to{" "}
            <a
              href="https://www.akpk.org.my"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              AKPK
            </a>
            , which is free.
          </p>
          <p className="mt-2 text-amber-800/90 dark:text-amber-300/90">
            Bukan nasihat kewangan. HoneyMoney bukan penasihat kewangan berlesen, bukan bank, dan
            tidak pernah memegang atau memindahkan wang anda. Keputusan adalah milik anda.
          </p>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          How we handle your personal data is set out separately in the{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy Notice
          </Link>
          . Read them together.
        </p>
      </header>

      <div className="mt-10 space-y-10">
        {TERMS_SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-20">
            <h2 className="font-display text-xl font-semibold tracking-tight">{s.en.heading}</h2>
            {s.en.body.map((p, i) => (
              <p key={i} className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {p}
              </p>
            ))}

            <div className="mt-4 border-l-2 border-zinc-200 pl-4 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                {s.ms.heading}
              </h3>
              {s.ms.body.map((p, i) => (
                <p key={i} className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-12 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">
        <p>
          Questions about these terms: <strong>privacy@honeymoney.app</strong>
        </p>
        <p className="mt-2">
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy notice
          </Link>{" "}
          ·{" "}
          <Link href="/guide" className="underline underline-offset-2">
            Guide
          </Link>
        </p>
      </footer>
    </main>
  );
}
