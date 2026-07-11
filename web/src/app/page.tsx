import Link from "next/link";
import Image from "next/image";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import Logo from "./Logo";

export default async function Home() {
  const locale = await getLocale();
  const tr = (k: string) => t(locale, k);

  const trust = [
    tr("home.trust.live"),
    tr("home.trust.local"),
    tr("home.trust.privacy"),
    tr("home.trust.free"),
    tr("home.trust.langs"),
  ];

  return (
    <div className="flex flex-1 flex-col">
      {/* ---------- HERO ---------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-amber-50 via-white to-white px-6 pt-16 pb-14 text-center sm:pt-24">
        {/* soft honeycomb glows */}
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-20 top-24 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />

        <div className="relative mx-auto max-w-3xl">
          <span className="hm-animate mb-5 inline-block rounded-full border border-amber-300 bg-amber-100/80 px-3 py-1 text-xs font-semibold tracking-wide text-amber-800">
            {tr("home.badge")}
          </span>
          <div className="hm-animate hm-delay-1 mb-4 flex justify-center">
            <Logo size={76} className="drop-shadow-[0_6px_16px_rgba(232,160,18,0.35)]" />
          </div>
          <h1 className="hm-animate hm-delay-1 text-5xl font-extrabold tracking-tight text-zinc-900 sm:text-7xl">
            Honey<span className="brand-gradient">Money</span>
          </h1>
          <p className="hm-animate hm-delay-2 mx-auto mt-5 max-w-2xl text-lg text-zinc-600 sm:text-xl">
            {tr("home.tagline")}
          </p>
          <p className="hm-animate hm-delay-2 mt-3 text-lg font-semibold text-amber-700">{tr("home.slogan")}</p>

          <div className="hm-animate hm-delay-3 mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className="w-full rounded-full bg-amber-500 px-7 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 sm:w-auto"
            >
              {tr("home.ctaDemo")} →
            </Link>
            <Link
              href="/guide"
              className="w-full rounded-full border border-zinc-300 bg-white px-7 py-3 text-base font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 sm:w-auto"
            >
              {tr("home.ctaGuide")}
            </Link>
          </div>
          <p className="mt-4 text-xs text-zinc-500">{tr("home.heroNote")}</p>

          <div className="mt-5 flex items-center justify-center gap-3 text-sm">
            <Link href="/login" className="font-medium text-amber-600 hover:underline">{tr("auth.login")}</Link>
            <span className="text-zinc-300">·</span>
            <Link href="/signup" className="font-medium text-amber-600 hover:underline">{tr("auth.createAccount")}</Link>
            <span className="text-zinc-300">·</span>
            <a href="https://github.com/justfifty/honeymoney" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:underline">{tr("home.ctaRepo")}</a>
          </div>
        </div>

        {/* trust bar — honest signals, next to the decision */}
        <ul className="relative mx-auto mt-12 flex max-w-4xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-zinc-600">
          {trust.map((item) => (
            <li key={item} className="flex items-center gap-1.5">
              <span aria-hidden className="text-emerald-500">✓</span>
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- PRODUCT SHOT ---------- */}
      <section className="px-6 pb-4">
        <figure className="hm-animate hm-delay-4 mx-auto max-w-4xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl ring-1 ring-amber-100">
          <Image
            src="/product-sankey.png"
            alt={tr("home.shot.caption")}
            width={1600}
            height={900}
            priority
            className="h-auto w-full"
          />
          <figcaption className="border-t border-zinc-100 px-4 py-2 text-center text-xs text-zinc-500">
            {tr("home.shot.caption")}
          </figcaption>
        </figure>
      </section>

      {/* ---------- HOW IT WORKS ---------- */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-amber-600">{tr("home.how.kicker")}</p>
          <h2 className="mx-auto mt-2 max-w-2xl text-center text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
            {tr("home.how.title")}
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <Feature n="1" title={tr("home.card1.title")} body={tr("home.card1.body")} />
            <Feature n="2" title={tr("home.card2.title")} body={tr("home.card2.body")} />
            <Feature n="3" title={tr("home.card3.title")} body={tr("home.card3.body")} />
          </div>
        </div>
      </section>

      {/* ---------- PERSONAS ---------- */}
      <section className="bg-gradient-to-b from-white to-amber-50/60 px-6 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">{tr("home.personas.kicker")}</p>
          <h2 className="mx-auto mt-2 max-w-2xl text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
            {tr("home.personas.title")}
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Persona emoji="🧑‍💻" label={tr("home.personas.solo")} />
            <span aria-hidden className="text-zinc-300">→</span>
            <Persona emoji="👨‍👩‍👧" label={tr("home.personas.family")} />
            <span aria-hidden className="text-zinc-300">→</span>
            <Persona emoji="🏪" label={tr("home.personas.business")} />
          </div>
        </div>
      </section>

      {/* ---------- FINAL CTA ---------- */}
      <section className="px-6 py-16 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">{tr("home.finalCta.title")}</h2>
        <p className="mx-auto mt-3 max-w-md text-zinc-600">{tr("home.finalCta.body")}</p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="w-full rounded-full bg-amber-500 px-7 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 sm:w-auto"
          >
            {tr("home.ctaDemo")} →
          </Link>
          <Link
            href="/graph"
            className="w-full rounded-full border border-zinc-300 bg-white px-7 py-3 text-base font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 sm:w-auto"
          >
            🕸️ {tr("nav.graph")}
          </Link>
        </div>
      </section>
    </div>
  );
}

function Feature({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="hm-lift rounded-2xl border border-zinc-200 bg-white p-6 text-left shadow-sm">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-base font-bold text-amber-700">{n}</div>
      <h3 className="mt-4 font-semibold text-zinc-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">{body}</p>
    </div>
  );
}

function Persona({ emoji, label }: { emoji: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm">
      <span aria-hidden className="text-lg">{emoji}</span>
      {label}
    </span>
  );
}
