import Link from "next/link";
import Image from "next/image";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import Logo from "./Logo";
import IosInstallHint from "./IosInstallHint";
import TryItNow from "./TryItNow";

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
      {/* no background: the site-wide sunburst field (see layout) shows through */}
      <section className="relative overflow-hidden px-6 pt-6 pb-14 text-center sm:pt-16">
        <div className="relative z-10 mx-auto max-w-3xl">
          <span className="hm-animate mb-4 inline-block rounded-full border border-amber-300 bg-amber-100/80 px-3 py-1 text-xs font-semibold tracking-wide text-amber-800">
            {tr("home.badge")}
          </span>
          {/* Wordmark, then the OUTCOME. The old hero led with the brand and made
              the visitor infer the benefit; the h1 now says what they get. */}
          <h1 className="hm-animate hm-delay-1 mt-1 flex items-center justify-center gap-0 text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl">
            {/* The mark only fills ~45% of its own viewBox, so a ~1.9em box lands
                its rays at roughly the wordmark's cap height and the leftover
                padding becomes the lockup's optical gap. */}
            <Logo size={72} className="h-[1.9em] w-[1.9em] shrink-0" />
            <span>Honey<span className="text-amber-500">Money</span></span>
          </h1>
          <p className="hm-animate hm-delay-1 mx-auto mt-4 max-w-2xl text-xl font-bold leading-snug tracking-tight text-zinc-900 sm:text-3xl">
            {tr("home.outcome")}
          </p>
          {/* Hidden on a phone: three lines of positioning between the headline
              and the try-it box pushed the result card — the payoff — below the
              fold on a 390×844 screen. The headline already carries the promise;
              this paragraph is the elaboration, and it fits once there's room. */}
          <p className="hm-animate hm-delay-2 mx-auto mt-3 hidden max-w-xl text-base text-zinc-600 sm:block">
            {tr("home.tagline")}
          </p>

          {/* The hook: a working expense parser, above the fold, no account.
              This replaces the two same-weight CTAs that used to sit here —
              the primary action is now doing the thing, not navigating to it. */}
          <TryItNow lang={locale} />

          {/* trust bar — honest signals, immediately under the thing they qualify */}
          <ul className="hm-animate hm-delay-3 mx-auto mt-6 flex max-w-3xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-zinc-600">
            {trust.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <span aria-hidden className="text-amber-500">✓</span>
                {item}
              </li>
            ))}
          </ul>

          {/* Secondary routes, demoted to text so they don't compete with the box */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
            {/* /demo, not /dashboard: it needs no login and no origin machine —
                it holds its own data in memory, so it is the one CTA here that
                still works when the laptop serving the app is off. */}
            <Link href="/demo" className="font-medium text-amber-600 hover:underline">
              {tr("home.ctaDemo")} →
            </Link>
            <span aria-hidden className="text-zinc-300">·</span>
            <Link href="/guide" className="font-medium text-zinc-600 hover:underline">{tr("home.ctaGuide")}</Link>
            <span aria-hidden className="text-zinc-300">·</span>
            <Link href="/login" className="font-medium text-zinc-600 hover:underline">{tr("auth.login")}</Link>
          </div>
          <p className="mt-3 text-xs text-zinc-500">{tr("home.heroNote")}</p>

          <IosInstallHint
            label={tr("install.ios.hintCta")}
            guide={{
              title: `🍎 ${tr("install.ios.title")}`,
              openSafari: tr("install.ios.openSafari"),
              step1: tr("install.ios.step1"),
              step2: tr("install.ios.step2"),
              step3: tr("install.ios.step3"),
            }}
          />
        </div>
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
            <Persona emoji="🧑" label={tr("home.personas.solo")} />
            <span aria-hidden className="text-zinc-300">→</span>
            <Persona emoji="👫" label={tr("home.personas.couple")} />
            <span aria-hidden className="text-zinc-300">→</span>
            <Persona emoji="👨‍👩‍👧" label={tr("home.personas.family")} />
          </div>
          <p className="mt-8 text-lg font-semibold text-amber-700">{tr("home.slogan")}</p>
        </div>
      </section>

      {/* ---------- THE 3-MINUTE PATH ---------- */}
      {/* The claim the hero makes, itemised and timed, so it reads as a designed
          funnel rather than marketing. Each step is a real screen in this app. */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-amber-600">
            {tr("home.path.kicker")}
          </p>
          <h2 className="mx-auto mt-2 max-w-2xl text-center text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
            {tr("home.path.title")}
          </h2>
          <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { at: "0:00", title: tr("home.path.s1.title"), body: tr("home.path.s1.body") },
              { at: "0:45", title: tr("home.path.s2.title"), body: tr("home.path.s2.body") },
              { at: "1:45", title: tr("home.path.s3.title"), body: tr("home.path.s3.body") },
              { at: "3:00", title: tr("home.path.s4.title"), body: tr("home.path.s4.body") },
            ].map((s) => (
              <li key={s.at} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold tabular-nums text-amber-800">
                  {s.at}
                </span>
                <h3 className="mt-3 text-sm font-semibold text-zinc-900">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{s.body}</p>
              </li>
            ))}
          </ol>
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

        {/* Three ways in. These used to sit in the hero, where they were three
            extra decisions competing with the one that mattered. */}
        <div className="mx-auto mt-10 grid max-w-xl grid-cols-3 gap-3">
          {[
            { href: "/graph", emoji: "📷", title: tr("nav.capture"), desc: tr("home.do.captureDesc") },
            { href: "/dashboard", emoji: "📊", title: tr("nav.dashboard"), desc: tr("home.do.dashboardDesc") },
            { href: "/goals", emoji: "🎯", title: tr("nav.goals"), desc: tr("home.do.goalsDesc") },
          ].map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-2xl border border-zinc-200 bg-white/70 p-4 text-center transition-colors hover:border-amber-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-amber-800"
            >
              <div className="text-2xl" aria-hidden="true">{c.emoji}</div>
              <div className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-100">{c.title}</div>
              <div className="mt-0.5 text-xs text-zinc-500">{c.desc}</div>
            </Link>
          ))}
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
