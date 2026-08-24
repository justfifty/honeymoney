import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import { config, isTelegramConfigured, activeAiProvider } from "@/lib/config";
import { getContext, listMembers } from "@/lib/household";
import { DELETE_GRACE_DAYS } from "@/lib/account";
import Logo from "../Logo";
import IosInstallGuide from "../IosInstallGuide";
import ProfileSettings from "../account/ProfileSettings";
import AccountActions from "../account/AccountActions";
import AiStatus from "./AiStatus";
import PrivacyControls from "./PrivacyControls";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Setup — account, AI capture & install",
};

const PROVIDER_LABEL: Record<string, string> = {
  gemini: "Gemini",
  groq: "Groq",
  ollama: "Ollama",
};

// The one Setup hub: personal account settings (name, password, delete/restore)
// for a signed-in user, plus the AI-capture wiring and how-to-install — each a
// self-contained section so signed-out visitors still get AI + install info.
export default async function SetupPage() {
  const locale = await getLocale();
  const tr = (k: string) => t(locale, k);

  const ctx = await getContext().catch(() => null);
  const telegramReady = isTelegramConfigured();
  const provider = activeAiProvider();
  const botUser = config.telegramBotUsername;

  // Account-deletion context (only needed when signed in).
  let members: Awaited<ReturnType<typeof listMembers>> = [];
  if (ctx) members = await listMembers(ctx.tenant.id);
  const others = ctx ? members.filter((m) => m.id !== ctx.memberId) : [];
  const owners = members.filter((m) => m.access_role === "owner");
  const purgeAtISO = ctx?.tenant.deletedAt
    ? new Date(new Date(ctx.tenant.deletedAt.replace(" ", "T")).getTime() + DELETE_GRACE_DAYS * 86_400_000).toISOString()
    : undefined;

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

      {/* ── Your account (signed in) ─────────────────────────────────────── */}
      {ctx ? (
        <>
          <Section title="👤 Your account" tone="plain">
            <dl className="mb-5 grid grid-cols-[7rem_1fr] gap-y-1.5 text-sm">
              <dt className="text-zinc-500">Email</dt>
              <dd className="font-medium">{ctx.user.email}</dd>
              <dt className="text-zinc-500">Household</dt>
              <dd className="font-medium">{ctx.tenant.name}</dd>
              <dt className="text-zinc-500">Your role</dt>
              <dd className="font-medium capitalize">{ctx.accessRole}</dd>
            </dl>
            <ProfileSettings initialName={ctx.user.name} email={ctx.user.email} />
          </Section>

          {/* Privacy sits ABOVE delete deliberately: withdrawing one purpose is
              the proportionate action, and a user who can only find the nuclear
              option will use the nuclear option. */}
          <Section title="🔒 Privacy & your data" tone="plain">
            <PrivacyControls />
          </Section>

          {/* Delete / restore — reuses the guarded, reversible flow. */}
          <AccountActions
            email={ctx.user.email}
            role={ctx.accessRole}
            shared={others.length > 0}
            soleOwner={ctx.accessRole === "owner" && owners.length <= 1 && others.length > 0}
            pending={ctx.pendingDeletion}
            purgeAtISO={purgeAtISO}
            graceDays={DELETE_GRACE_DAYS}
          />
        </>
      ) : (
        <Section title="👤 Your account" tone="plain">
          <p className="text-zinc-600 dark:text-zinc-400">
            <Link href="/login?next=/setup" className="text-amber-600 hover:underline">Sign in</Link> to change your
            name or password, or to delete your account.
          </p>
        </Section>
      )}

      {/* ── AI capture ───────────────────────────────────────────────────── */}
      <div className="mt-8 flex flex-wrap gap-2 text-xs">
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

      {/* Bot-capture walkthrough, shown only when a bot is actually configured.
          These sections used to render unconditionally, so /setup spent three
          panels teaching a feature that answered nothing — a user could follow
          every step and reach a bot that does not exist. The deck no longer
          claims Telegram; the setup screen should not either, until the day
          TELEGRAM_BOT_TOKEN is set and it quietly returns. */}
      {telegramReady && (
      <Section title={`✨ ${tr("setup.what.title")}`} tone="plain">
        <ul className="list-disc space-y-2 pl-5">
          <li>{tr("setup.what.1")}</li>
          <li>{tr("setup.what.2")}</li>
          <li>{tr("setup.what.3")}</li>
          <li>{tr("setup.what.4")}</li>
        </ul>
      </Section>
      )}

      {/* The AI engine section used to be three static bullets plus whichever
          provider an env var named. That told a user what the app *intends*,
          never whether it works — so someone whose key was rejected saw the
          same screen as someone whose key was fine. AiStatus probes instead. */}
      <Section title={`🧠 ${tr("setup.ai.title")}`} tone="plain">
        <p className="mb-4">{tr("setup.ai.body")}</p>
        <AiStatus
          activeProvider={provider}
          signedIn={Boolean(ctx)}
          strings={{
            testBtn: tr("setup.ai.testBtn"),
            testing: tr("setup.ai.testing"),
            retest: tr("setup.ai.retest"),
            ready: tr("setup.ai.ready"),
            noneReady: tr("setup.ai.noneReady"),
            failed: tr("setup.ai.failed"),
            colProvider: tr("setup.ai.colProvider"),
            colStatus: tr("setup.ai.colStatus"),
            live: tr("setup.ai.live"),
            keyBad: tr("setup.ai.keyBad"),
            notSet: tr("setup.ai.notSet"),
            active: tr("setup.stack.active"),
            howTo: tr("setup.ai.howTo"),
            askHint: tr("setup.ai.askHint"),
            ownTitle: tr("setup.ai.ownTitle"),
            ownBody: tr("setup.ai.ownBody"),
            ownSaved: tr("setup.ai.ownSaved"),
            ownNone: tr("setup.ai.ownNone"),
            ownNotOwner: tr("setup.ai.ownNotOwner"),
            ownSignedOut: tr("setup.ai.ownSignedOut"),
            usingOwn: tr("setup.ai.usingOwn"),
            fieldKey: tr("setup.ai.fieldKey"),
            fieldUrl: tr("setup.ai.fieldUrl"),
            fieldModel: tr("setup.ai.fieldModel"),
            modelHint: tr("setup.ai.modelHint"),
            save: tr("setup.ai.save"),
            saving: tr("setup.ai.saving"),
            remove: tr("setup.ai.remove"),
            removed: tr("setup.ai.removed"),
            savedOk: tr("setup.ai.savedOk"),
          }}
        />
      </Section>

      {telegramReady && (
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
      )}

      <Section title={`🛠️ ${tr("setup.admin.title")}`} tone="plain">
        <p>
          {tr("setup.admin.body")} <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">docs/TELEGRAM_SETUP.md</code>.
        </p>
      </Section>

      {/* ── Install / remove ─────────────────────────────────────────────── */}
      <Section title={`📱 ${tr("setup.remove.title")}`} tone="plain">
        <p>
          {tr("setup.remove.body")}{" "}
          <Link href="/delete-account" className="text-amber-600 hover:underline">
            {tr("setup.remove.link")}
          </Link>
          .
        </p>
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
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
