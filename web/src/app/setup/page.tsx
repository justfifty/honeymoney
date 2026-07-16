import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import { config, isTelegramConfigured, activeAiProvider } from "@/lib/config";
import Logo from "../Logo";

export const metadata = {
  title: "AI Setup — connect zero-typing capture",
};

const PROVIDER_LABEL: Record<string, string> = {
  gemini: "Gemini",
  groq: "Groq",
  ollama: "Ollama",
};

// In-app "AI Setup": explains the zero-typing capture channel and walks a user
// through connecting Telegram, with a live capability badge so a judge (or the
// household) can see at a glance whether the bot is wired up. The deeper,
// operator-level steps (BotFather token, webhook) link out to the doc.
export default async function SetupPage() {
  const locale = await getLocale();
  const tr = (k: string) => t(locale, k);

  const telegramReady = isTelegramConfigured();
  const provider = activeAiProvider();
  const botUser = config.telegramBotUsername;

  return (
    <main className="mx-auto min-h-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Logo size={24} /> {tr("setup.title")}
        </h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/guide" className="text-zinc-500 hover:underline">{tr("nav.guide")}</Link>
          <Link href="/dashboard" className="text-zinc-500 hover:underline">{tr("nav.dashboard")}</Link>
        </nav>
      </header>
      <p className="mt-2 text-sm text-zinc-500">{tr("setup.subtitle")}</p>

      {/* Live capability badges */}
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span
          className={
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium " +
            (telegramReady
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400")
          }
        >
          <span className={"h-1.5 w-1.5 rounded-full " + (telegramReady ? "bg-emerald-500" : "bg-zinc-400")} />
          {telegramReady ? tr("setup.status.active") : tr("setup.status.inactive")}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          🤖 {tr("setup.status.provider").replace("{provider}", PROVIDER_LABEL[provider] ?? provider)}
        </span>
      </div>

      {/* What you get */}
      <Section title={`✨ ${tr("setup.what.title")}`} tone="plain">
        <ul className="list-disc space-y-2 pl-5">
          <li>{tr("setup.what.1")}</li>
          <li>{tr("setup.what.2")}</li>
          <li>{tr("setup.what.3")}</li>
          <li>{tr("setup.what.4")}</li>
        </ul>
      </Section>

      {/* The AI engine */}
      <Section title={`🧠 ${tr("setup.stack.title")}`} tone="plain">
        <p className="mb-3">{tr("setup.stack.body")}</p>
        <ul className="space-y-2">
          {(["groq", "gemini", "ollama"] as const).map((p) => (
            <li key={p} className="flex items-start gap-2">
              <span aria-hidden="true">•</span>
              <span>
                {tr(`setup.stack.${p}`)}
                {provider === p && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                    {tr("setup.stack.active")}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Connect Telegram */}
      <Section title={`💬 ${tr("setup.connect.title")}`} tone="good">
        <ol className="list-decimal space-y-2 pl-5">
          <li>{tr("setup.connect.1")}</li>
          <li>{tr("setup.connect.2")}</li>
          <li>{tr("setup.connect.3")}</li>
        </ol>
        {botUser ? (
          <a
            href={`https://t.me/${botUser}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
          >
            💬 {tr("setup.connect.openBot")} · @{botUser}
          </a>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">{tr("setup.connect.noBot")}</p>
        )}
      </Section>

      {/* Self-hosting / admin */}
      <Section title={`🛠️ ${tr("setup.admin.title")}`} tone="plain">
        <p>
          {tr("setup.admin.body")} <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">docs/TELEGRAM_SETUP.md</code>.
        </p>
      </Section>

      {/* Install / remove / account */}
      <Section title={`📱 ${tr("setup.remove.title")}`} tone="plain">
        <p>
          {tr("setup.remove.body")}{" "}
          <Link href="/delete-account" className="text-amber-600 hover:underline">
            {tr("setup.remove.link")}
          </Link>
          .
        </p>
      </Section>

      <p className="mt-8 text-xs text-zinc-400">{tr("setup.disclaimer")}</p>
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
