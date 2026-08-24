import Link from "next/link";
import Image from "next/image";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
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
          {/* The outcome IS the h1 now. The wordmark used to sit here at 72px,
              repeating the sticky header two rows above and costing ~150px of a
              844px fold before the visitor learned anything. A brand a first-time
              visitor has never heard of does not earn the top of the fold; what
              they get does. */}
          <h1 className="hm-animate hm-delay-1 mx-auto mt-2 max-w-2xl text-[1.7rem] font-extrabold leading-[1.15] tracking-tight text-balance text-zinc-900 sm:text-4xl dark:text-white">
            {tr("home.outcome")}
          </h1>
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

          {/* Trust bar — one line, three claims. Five ticks wrapped to three
              lines here and read as a wall rather than as reassurance; the rest
              of the list is still made, and made better, further down the page. */}
          <ul className="hm-animate hm-delay-3 mx-auto mt-5 flex max-w-xl flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {trust.slice(0, 3).map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <span aria-hidden className="text-amber-500">✓</span>
                {item}
              </li>
            ))}
          </ul>

          {/* ONE primary CTA. This was three same-weight text links in a row —
              demo, guide, log in — which is three ways of saying "you decide".
              /demo, not /dashboard: it needs no login and no origin machine, so
              it is the one destination here that still works when the laptop
              serving the app is off. */}
          <div className="mt-6 flex flex-col items-center gap-3">
            <Link
              href="/demo"
              className="inline-flex min-h-[3rem] items-center justify-center gap-2 rounded-full bg-amber-400 px-7 text-base font-bold text-zinc-950 shadow-lg shadow-amber-500/25 transition hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
            >
              {tr("home.ctaDemo")} <span aria-hidden>→</span>
            </Link>
            <p className="text-xs text-zinc-500">{tr("home.heroNote")}</p>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
              <Link href="/guide" className="text-zinc-500 hover:text-zinc-700 hover:underline dark:hover:text-zinc-300">{tr("home.ctaGuide")}</Link>
              <span aria-hidden className="text-zinc-300 dark:text-zinc-700">·</span>
              <Link href="/login" className="text-zinc-500 hover:text-zinc-700 hover:underline dark:hover:text-zinc-300">{tr("auth.login")}</Link>
            </div>
          </div>

          {/* The competition badge, demoted from the top of the fold to a
              credential under the CTA. It is a signal for judges, and it was
              occupying the single highest-value row on the page — the one a
              first-time user reads before deciding whether to keep reading. */}
          <p className="hm-animate hm-delay-3 mt-6 text-[11px] font-medium tracking-wide text-zinc-400">
            {tr("home.badge")}
          </p>

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
          {/* /demo, not /dashboard. This carries the same label as the hero CTA
              — "Open the live demo" — and pointed somewhere else, so the two
              buttons on the page promising the identical thing delivered
              different pages. A first-time visitor who clicks it is not signed
              in, so /dashboard gave them an empty shell of someone else's
              household instead of the four seeded Malaysian families the label
              offered. The demo is also the one public page that keeps working
              with the origin switched off, which is exactly what a judge
              following a link at 2am needs. */}
          <Link
            href="/demo"
            className="w-full rounded-full bg-amber-400 px-7 py-3 text-base font-bold text-zinc-950 shadow-sm transition-colors hover:bg-amber-300 sm:w-auto"
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
            // /record, not /graph. This card is a camera icon labelled "Capture"
            // and it used to open the graph — which has the flexible-input box
            // but no Scan receipt or Photo button anywhere on it. A visitor who
            // tapped the camera got a page with no camera on it, which reads as
            // a missing feature rather than a wrong link.
            { href: "/record", emoji: "📷", title: tr("nav.capture"), desc: tr("home.do.captureDesc") },
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
