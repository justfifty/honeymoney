import Link from "next/link";
import type { Metadata } from "next";
import { PACK_ORDER } from "@/lib/legal";
import { LEGAL_DOCS } from "@/lib/legalDocs";
import { NOTICE_VERSION } from "@/lib/consent";
import { TERMS_VERSION } from "@/lib/agreements";
import Logo from "../Logo";

export const metadata: Metadata = {
  title: "Notices",
  description:
    "Every notice HoneyMoney owes you, separately: privacy, terms, the advice boundary, the H-Score's limits, AI, household sharing, sponsors, storage, retention, acceptable use and licences.",
};

// The hub.
//
// Ordered by when a person needs a document, not by legal weight. Someone
// scanning this list should meet their own question — "is this financial
// advice?", "can my partner see this?", "what does the AI send?" — before they
// meet ours about liability and intellectual property.
//
// The summaries are the point of the page. A list of eleven titles is a filing
// cabinet; a list of eleven titles each with the sentence that says whether it
// is the one you want is a way in.

const STATIC_SUMMARY: Record<string, { en: string; ms: string; title: string; msTitle: string }> = {
  privacy: {
    title: "Privacy notice",
    msTitle: "Notis Privasi",
    en: "What we collect, why, who else sees it, where it is stored, how long we keep it, and how to stop any of it. Issued under the PDPA 2010.",
    ms: "Apa yang kami kumpul, sebabnya, siapa lagi yang melihatnya, di mana ia disimpan, berapa lama kami menyimpannya, dan cara menghentikan mana-mana daripadanya.",
  },
  terms: {
    title: "Terms of service",
    msTitle: "Terma Perkhidmatan",
    en: "The contract: what the service is, that it is free, what you may do with it, what we are and are not responsible for, and how either side ends it.",
    ms: "Kontrak: apa itu perkhidmatan ini, bahawa ia percuma, apa yang boleh anda lakukan dengannya, apa yang kami bertanggungjawab dan tidak, dan cara mana-mana pihak menamatkannya.",
  },
};

export default function LegalHubPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header>
        <h1 className="flex items-center gap-2 font-display text-3xl font-bold tracking-tight">
          <Logo size={26} /> Notices
        </h1>
        <p className="mt-1 text-lg text-zinc-500">Notis</p>
        <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Eleven short documents rather than one long one, so the notice that matters to you is
          findable and so we can put the relevant two sentences in front of you at the moment they
          apply — before an upload, before an AI call, before an invite. Every one of them is in
          English and Bahasa Malaysia.
          <span className="mt-2 block text-amber-800/90 dark:text-amber-300/90">
            Sebelas dokumen pendek dan bukan satu dokumen panjang, supaya notis yang penting kepada
            anda mudah ditemui. Kesemuanya dalam bahasa Inggeris dan Bahasa Malaysia.
          </span>
        </p>
      </header>

      <ul className="mt-10 space-y-3">
        {PACK_ORDER.map((entry) => {
          const doc = LEGAL_DOCS[entry.slug];
          const stat = STATIC_SUMMARY[entry.slug];
          const href = entry.href ?? `/legal/${entry.slug}`;
          const title = doc?.en.title ?? stat?.title ?? entry.slug;
          const msTitle = doc?.ms.title ?? stat?.msTitle ?? "";
          const summary = doc?.en.summary ?? stat?.en ?? "";
          const msSummary = doc?.ms.summary ?? stat?.ms ?? "";
          const version =
            doc?.version ??
            (entry.slug === "privacy" ? NOTICE_VERSION : entry.slug === "terms" ? TERMS_VERSION : "");

          return (
            <li key={entry.slug}>
              <Link
                href={href}
                className="flex gap-4 rounded-2xl border border-zinc-200 p-5 transition hover:border-amber-400 hover:bg-amber-50/40 dark:border-zinc-800 dark:hover:border-amber-700 dark:hover:bg-amber-950/10"
              >
                <span aria-hidden className="text-2xl leading-none">
                  {entry.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-base font-semibold tracking-tight">
                    {title}
                  </span>
                  {msTitle && (
                    <span className="block text-sm text-zinc-500">{msTitle}</span>
                  )}
                  <span className="mt-1.5 block text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {summary}
                  </span>
                  {msSummary && (
                    <span className="mt-1 block text-xs leading-relaxed text-zinc-500">
                      {msSummary}
                    </span>
                  )}
                  {version && (
                    <span className="mt-2 block text-xs text-zinc-400">Version {version}</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <section className="mt-12 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold">Your controls, not just our words</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Documents describe. These do something:
        </p>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {[
            ["/setup#privacy", "Privacy & data dashboard", "What we hold, and every switch"],
            ["/sharing", "Sharing & privacy", "What your household can see, and who looked"],
            ["/sharing/leave", "Leaving and safety", "Stop sharing, leave, or get out quickly"],
            ["/api/account/export", "Export everything", "One click, machine-readable"],
          ].map(([href, label, desc]) => (
            <li key={href}>
              <Link
                href={href}
                className="block rounded-xl border border-zinc-200 p-3 hover:border-amber-400 dark:border-zinc-800 dark:hover:border-amber-700"
              >
                <span className="block font-medium">{label}</span>
                <span className="block text-xs text-zinc-500">{desc}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-12 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">
        <p>
          Any request or complaint under any of these: <strong>privacy@honeymoney.app</strong>. We
          aim to respond within 21 days. You may also complain to the Personal Data Protection
          Commissioner (Jabatan Perlindungan Data Peribadi, Malaysia) at pdp.gov.my.
        </p>
        <p className="mt-3 text-xs leading-relaxed">
          HoneyMoney is early software built to align with the PDPA 2010. It has not been through an
          independent privacy audit or certification, and no Malaysian legal practitioner has yet
          reviewed these documents. We say so here rather than letting the length of this list imply
          otherwise.
        </p>
      </footer>
    </main>
  );
}
