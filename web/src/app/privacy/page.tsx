import Link from "next/link";
import type { Metadata } from "next";
import { NOTICE_SECTIONS } from "./notice";
import { NOTICE_VERSION } from "@/lib/consent";

export const metadata: Metadata = {
  title: "Privacy notice · HoneyMoney",
  description:
    "What HoneyMoney collects, why, who else sees it, and how to stop it. Issued under Malaysia's PDPA 2010, in English and Bahasa Malaysia.",
};

// Both languages on ONE page, English first, Malay directly under it.
//
// Not a language switcher. A switcher makes the Malay text something a reader
// has to go and find, and the PDPA requires the notice to be *given* in both —
// the whole point is that a Malaysian reader does not have to ask for the
// version that binds them. It also means a section can never be quietly live in
// one language and missing in the other, because they render from one array.

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <nav className="text-sm">
        <Link href="/" className="text-zinc-500 hover:underline">
          ← Home
        </Link>
      </nav>

      <header className="mt-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">Privacy notice</h1>
        <p className="mt-1 text-lg text-zinc-500">Notis Privasi</p>
        <p className="mt-4 text-sm text-zinc-500">
          Version {NOTICE_VERSION} · Issued under the Personal Data Protection Act 2010 (Malaysia)
        </p>
        <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Short version: your records are yours. We use them to run the app and
          nothing else, unless you tick a box telling us otherwise. Nothing is
          ticked for you. You can export everything or delete it whenever you
          like.
        </p>
      </header>

      <div className="mt-10 space-y-10">
        {NOTICE_SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-20">
            <h2 className="font-display text-xl font-semibold tracking-tight">{s.en.heading}</h2>
            <ul className="mt-3 space-y-2">
              {s.en.body.map((p, i) => (
                <li key={i} className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {p}
                </li>
              ))}
            </ul>

            {/* The Malay is styled as an equal, not a footnote: same type size,
                same spacing, separated by a rule rather than shrunk. A notice
                that renders one language at 80% opacity has made a statement
                about which reader it is really for. */}
            <div className="mt-5 border-l-2 border-zinc-200 pl-4 dark:border-zinc-800">
              <h3 className="font-display text-lg font-semibold tracking-tight text-zinc-600 dark:text-zinc-400">
                {s.ms.heading}
              </h3>
              <ul className="mt-2 space-y-2">
                {s.ms.body.map((p, i) => (
                  <li key={i} className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-14 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">
        <p>
          Manage what you have agreed to in{" "}
          {/* /setup#privacy, not /settings/privacy: the settings screen has
              always lived at /setup, and this link — the one that makes the
              withdrawal right reachable — used to 404. /settings/privacy is
              kept as a 308 for the copies of this notice already in the wild. */}
          <Link href="/setup#privacy" className="font-medium text-amber-600 hover:underline">
            Settings → Privacy
          </Link>
          , or download everything we hold from the same screen.
        </p>
      </footer>
    </main>
  );
}
