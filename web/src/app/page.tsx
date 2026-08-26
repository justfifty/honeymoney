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
    // Precise on purpose: the backup is what we cannot read, not the live
    // ledger — the server computes an H-Score over that. docs/ZERO_KNOWLEDGE.md
    // §2 draws the line, and a trust bar that overstated it would be the first
    // thing a judge checked and the first thing they found wrong.
    tr("home.trust.sealed"),
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

          {/* NO CTA BLOCK HERE, deliberately. "Open the live demo", the
              "no sign-up needed" note, "How it works" and "Log in" all sat here
              and were removed on request. TryItNow above is the primary action
              and it needs no navigation at all — the visitor is already doing
              the thing. The header still carries Log in and Sign up, and the
              footer still links the demo and the guide, so nothing became
              unreachable; the fold just stopped offering four alternatives to
              the one control that matters. */}

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

        {/* The Sankey above is one of six views. Saying so directly under it is
            the only place on the page where that claim is legible — a visitor
            has just looked at the picture and is primed to ask "is this all of
            it?". /gallery answers with the other five. */}
        <div className="mx-auto mt-3 max-w-4xl text-center">
          <Link
            href="/gallery"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-5 text-sm font-semibold text-zinc-700 transition-colors hover:border-amber-400 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-amber-700"
          >
            🕸️ {tr("home.shot.gallery")} <span aria-hidden>→</span>
          </Link>
        </div>
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

      {/* NO FINAL CTA SECTION. "See it working — it's live" lived here with a
          second "Open the live demo", a 🕸️ Graph button, and three cards
          (Capture / Dashboard / Goals). Removed on request: it repeated the
          hero's promise at the bottom of the page, and the three cards were
          three more decisions after the visitor had already been given one.
          Those destinations remain in the header, the bottom nav and the
          footer, which is where navigation belongs. */}
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
