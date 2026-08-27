import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { legalDoc, LEGAL_DOCS } from "@/lib/legalDocs";
import Logo from "../../Logo";

// One renderer, every notice.
//
// The alternative was nine near-identical page files, which is nine places for
// the bilingual layout to drift and nine files to update when the footer link
// changes. Adding a notice is now adding an entry to lib/legalDocs.ts — the
// content is the work, and the chrome is not repeated.
//
// Both languages render on ONE page, English then Malay, exactly as /privacy
// and /terms do. Not a switcher: a notice a reader has to go and find has not
// been given to them, and rendering from one array means a section can never be
// live in one language and missing in the other.

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ doc: string }>;
}): Promise<Metadata> {
  const doc = legalDoc((await params).doc);
  if (!doc) return { title: "Not found · HoneyMoney" };
  return { title: `${doc.en.title} · HoneyMoney`, description: doc.en.summary };
}

export default async function LegalDocPage({ params }: { params: Promise<{ doc: string }> }) {
  const doc = legalDoc((await params).doc);
  if (!doc) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <nav className="text-sm">
        <Link href="/legal" className="text-zinc-500 hover:underline">
          ← All notices
        </Link>
      </nav>

      <header className="mt-6">
        <h1 className="flex items-start gap-2 font-display text-3xl font-bold tracking-tight">
          <Logo size={26} className="mt-1.5 flex-none" /> {doc.en.title}
        </h1>
        <p className="mt-1 text-lg text-zinc-500">{doc.ms.title}</p>
        <p className="mt-4 text-sm text-zinc-500">
          Version {doc.version} · English and Bahasa Malaysia · Operated by Team JUST50, Malaysia
        </p>
        <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {doc.en.summary}
          <span className="mt-2 block text-amber-800/90 dark:text-amber-300/90">
            {doc.ms.summary}
          </span>
        </p>
      </header>

      <div className="mt-10 space-y-10">
        {doc.sections.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-20">
            <h2 className="font-display text-xl font-semibold tracking-tight">{s.en.heading}</h2>
            <ul className="mt-3 space-y-2">
              {s.en.body.map((p, i) => (
                <li key={i} className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {p}
                </li>
              ))}
            </ul>

            {/* The Malay renders as an equal — same type size, same spacing,
                separated by a rule rather than shrunk. A notice that renders one
                language at 80% opacity has made a statement about which reader
                it is really for. */}
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
          Questions about this notice: <strong>privacy@honeymoney.app</strong>
        </p>
        <p className="mt-2">
          <Link href="/legal" className="underline underline-offset-2">
            All notices
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="underline underline-offset-2">
            Terms
          </Link>
        </p>
        <p className="mt-3 text-xs leading-relaxed">
          The Bahasa Malaysia here is a careful working translation and has not been certified by a
          Malaysian legal practitioner. Where the two differ, tell us at privacy@honeymoney.app.
        </p>
      </footer>
    </main>
  );
}
