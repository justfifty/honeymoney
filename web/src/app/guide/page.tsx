import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import Logo from "../Logo";
import IosInstallGuide from "../IosInstallGuide";

export const metadata = {
  title: "HoneyMoney — Guide, Disclaimer & Privacy",
};

// In-app guide: how to use + the disclaimer + the privacy promise, in plain
// language. Linked from every screen so a first-time user (or a judge) can find
// "what is this, is my data safe, how do I use it" without leaving the app.
export default async function GuidePage() {
  const locale = await getLocale();
  const tr = (k: string) => t(locale, k);

  return (
    <main className="mx-auto min-h-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Logo size={24} /> {tr("guide.title")}</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/graph" className="text-amber-600 hover:underline">🕸️ {tr("nav.graph")}</Link>
          <Link href="/dashboard" className="text-zinc-500 hover:underline">{tr("nav.dashboard")}</Link>
        </nav>
      </header>
      <p className="mt-2 text-sm text-zinc-500">
        {tr("guide.subtitle")}
      </p>

      {/* How to use */}
      <Section title={`📖 ${tr("guide.howto.title")}`} tone="plain">
        <ol className="list-decimal space-y-2 pl-5">
          <li><b>{tr("guide.howto.1.label")}</b> — {tr("guide.howto.1.body")} <Link className="text-amber-600 hover:underline" href="/graph">/graph</Link> {tr("guide.howto.1.body2")}</li>
          <li><b>{tr("guide.howto.2.label")}</b> — {tr("guide.howto.2.body")} <i>Sankey</i> ({tr("guide.howto.2.sankeyDesc")}), <i>Treemap</i> ({tr("guide.howto.2.treemapDesc")}), <i>Tree</i>, <i>Organic</i> {tr("guide.howto.2.networkLabel")}, <i>Budget</i> {tr("guide.howto.2.barsLabel")}, {tr("guide.howto.2.and")} <i>Flow</i>.</li>
          <li><b>{tr("guide.howto.3.label")}</b> — {tr("guide.howto.3.body")} <b>{tr("guide.howto.3.person")}</b> {tr("guide.howto.3.body2")}</li>
          <li><b>{tr("guide.howto.4.label")}</b> — <b>➕ {tr("guide.howto.4.addPanel")}</b> {tr("guide.howto.4.body")} <b>{tr("guide.howto.4.type")} 📷 {tr("guide.howto.4.scan")}</b> — {tr("guide.howto.4.body2")}</li>
          <li><b>{tr("guide.howto.5.label")}</b> — {tr("guide.howto.5.body")} <i>{tr("guide.howto.5.needs")}</i>, <i>{tr("guide.howto.5.savings")}</i> {tr("guide.howto.5.shield")} <i>{tr("guide.howto.5.personal")}</i> {tr("guide.howto.5.body2")} <b>{tr("guide.howto.5.notItemized")}</b>{tr("guide.howto.5.body3")}</li>
        </ol>
      </Section>

      {/* The AI — killer features, honestly framed */}
      <Section title={`🤖 ${tr("guide.ai.title")}`} tone="plain">
        <p className="mb-3">{tr("guide.ai.intro")}</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><b>{tr("guide.ai.1.label")}</b> — {tr("guide.ai.1.body")}</li>
          <li><b>{tr("guide.ai.2.label")}</b> — {tr("guide.ai.2.body")}</li>
          <li>
            <b>{tr("guide.ai.3.label")}</b> — {tr("guide.ai.3.body")}{" "}
            <Link href="/setup" className="text-amber-600 hover:underline">{tr("guide.ai.setupLink")}</Link>
          </li>
          <li><b>{tr("guide.ai.4.label")}</b> — {tr("guide.ai.4.body")}</li>
        </ul>
        <p className="mt-3 text-xs text-zinc-500">{tr("guide.ai.note")}</p>
      </Section>

      {/* Install on your phone */}
      <Section title={`📲 ${tr("guide.install.title")}`} tone="plain">
        <p className="mb-3">{tr("guide.install.body")}</p>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
          <IosInstallGuide
            strings={{
              title: `🍎 ${tr("install.ios.title")}`,
              openSafari: tr("install.ios.openSafari"),
              step1: tr("install.ios.step1"),
              step2: tr("install.ios.step2"),
              step3: tr("install.ios.step3"),
            }}
          />
        </div>
      </Section>

      {/* Keeping your records — what to save, what to prune, and when.
          Measured rather than guessed: ~400 bytes a record against ~250 KB a
          photo, so the honest advice is the opposite of the instinct. People
          reach for "delete the old data", and the old data is the cheap part. */}
      <Section title={`📦 ${tr("guide.keep.title")}`} tone="plain">
        <p className="mb-3">{tr("guide.keep.intro")}</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><b>{tr("guide.keep.1.label")}</b> {tr("guide.keep.1.body")}</li>
          <li><b>{tr("guide.keep.2.label")}</b> {tr("guide.keep.2.body")}</li>
          <li>
            <b>{tr("guide.keep.3.label")}</b> {tr("guide.keep.3.body")}{" "}
            <Link href="/vault" className="text-amber-600 hover:underline">{tr("more.vault")} →</Link>
          </li>
          <li><b>{tr("guide.keep.4.label")}</b> {tr("guide.keep.4.body")}</li>
        </ul>
      </Section>

      {/* Privacy */}
      <Section title={`🔒 ${tr("guide.privacy.title")}`} tone="good">
        <ul className="list-disc space-y-2 pl-5">
          <li><b>{tr("guide.privacy.1.label")}</b> {tr("guide.privacy.1.body")}</li>
          <li><b>{tr("guide.privacy.2.label")}</b> {tr("guide.privacy.2.body")} <b>{tr("guide.privacy.2.not")}</b> {tr("guide.privacy.2.body2")}</li>
          <li><b>{tr("guide.privacy.3.label")}</b> {tr("guide.privacy.3.body")}</li>
          <li><b>{tr("guide.privacy.4.label")}</b> {tr("guide.privacy.4.body")}</li>
          <li><b>{tr("guide.privacy.5.label")}</b> {tr("guide.privacy.5.body")}</li>
          <li><b>{tr("guide.privacy.6.label")}</b> {tr("guide.privacy.6.body")}</li>
        </ul>
      </Section>

      {/* Disclaimer */}
      <Section title={`⚠️ ${tr("guide.disclaimer.title")}`} tone="warn">
        <ul className="list-disc space-y-2 pl-5">
          <li><b>{tr("guide.disclaimer.1.label")}</b> {tr("guide.disclaimer.1.body")} <a className="text-amber-600 hover:underline" href="https://www.akpk.org.my" target="_blank" rel="noopener noreferrer">AKPK</a> {tr("guide.disclaimer.1.body2")}</li>
          <li><b>{tr("guide.disclaimer.2.label")}</b> {tr("guide.disclaimer.2.body")}</li>
          <li><b>{tr("guide.disclaimer.3.label")}</b> {tr("guide.disclaimer.3.body")}</li>
          <li><b>{tr("guide.disclaimer.4.label")}</b> {tr("guide.disclaimer.4.body")}</li>
          <li><b>{tr("guide.disclaimer.5.label")}</b> {tr("guide.disclaimer.5.body")}</li>
        </ul>
      </Section>

      <p className="mt-8 text-xs text-zinc-400">
        {tr("guide.contact")} <code>docs/AI_DISCLOSURE.md</code>.
      </p>
    </main>
  );
}

function Section({ title, tone, children }: { title: string; tone: "plain" | "good" | "warn"; children: React.ReactNode }) {
  const ring =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
        : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
  return (
    <section className={`mt-6 rounded-2xl border p-5 text-sm leading-relaxed ${ring}`}>
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
