import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import Logo from "../Logo";

export const metadata = {
  title: "Deck & Documents",
  description: "HoneyMoney's pitch deck, one-page project summary, AI disclosure and demo video.",
};

// Everything a judge or a visitor might want to read in one place. Like
// /gallery this is PocketBase-free by design so it stays up in the static
// snapshot when the origin is off (scripts/build-static-site.mjs).
const DOCS = [
  { k: "pitch", href: "/deck/HoneyMoney_Pitch_Deck_MAIC2026.pdf", icon: "📊", cta: "deck.pdf" },
  { k: "summary", href: "/deck/HoneyMoney_Project_Summary_MAIC2026.pdf", icon: "📄", cta: "deck.pdf" },
  { k: "ai", href: "/deck/HoneyMoney_AI_Disclosure_MAIC2026.pdf", icon: "🤖", cta: "deck.pdf" },
];

export default async function DeckPage() {
  const locale = await getLocale();
  const tr = (k: string) => t(locale, k);

  return (
    <main className="mx-auto min-h-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Logo size={24} /> {tr("deck.title")}
        </h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/gallery" className="text-amber-600 hover:underline">
            🖼️ {tr("gallery.title")}
          </Link>
          <Link href="/guide" className="text-zinc-500 hover:underline">
            {tr("nav.guide")}
          </Link>
        </nav>
      </header>
      <p className="mt-2 text-sm text-zinc-500">{tr("deck.subtitle")}</p>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold">
          🎬 {tr("deck.demo.t")}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">{tr("deck.demo.b")}</p>
        <video
          className="mt-4 w-full rounded-xl border border-zinc-200 bg-black dark:border-zinc-800"
          controls
          preload="none"
          playsInline
          poster="/product-sankey.png"
          src="/deck/HoneyMoney_Demo_MAIC2026.mp4"
        />
      </section>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {DOCS.map((d) => (
          <a
            key={d.k}
            href={d.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-amber-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-amber-800"
          >
            <span className="text-2xl">{d.icon}</span>
            <h2 className="mt-2 text-sm font-semibold">{tr(`deck.${d.k}.t`)}</h2>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-zinc-500">{tr(`deck.${d.k}.b`)}</p>
            <span className="mt-3 text-xs font-semibold text-amber-600">{tr(d.cta)} →</span>
          </a>
        ))}
      </div>

      <p className="mt-8 text-xs text-zinc-400">{tr("deck.note")}</p>
    </main>
  );
}
