import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import { activeAiProvider } from "@/lib/config";
import { getContext, listMembers } from "@/lib/household";
import { DELETE_GRACE_DAYS } from "@/lib/account";
import Logo from "../Logo";
import IosInstallGuide from "../IosInstallGuide";
import ProfileSettings from "../account/ProfileSettings";
import AccountActions from "../account/AccountActions";
import SealedBackup from "./SealedBackup";
import { listVaults } from "@/lib/vault";
import AiStatus from "./AiStatus";
import PrivacyControls from "./PrivacyControls";
import DataDashboard from "./DataDashboard";

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
  const provider = activeAiProvider();

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
          {/* The dashboard sits ABOVE the toggles. A person opening this
              screen is answering "what do they have on me?" before they can
              sensibly answer "what should I switch off?", and a page that opens
              with controls asks the second question first. */}
          <Section id="data" title="📊 What we hold about you" tone="plain">
            <DataDashboard />
          </Section>

          <Section id="privacy" title="🔒 Privacy & your data" tone="plain">
            <PrivacyControls />
            {/* Consent governs what WE may do with your records. Sharing governs
                what the people in your household can see. They are different
                questions with different answers, so they get different screens —
                but a user looking for "who can see my spending" will look here
                first, and finding only the consent toggles would send them away
                believing the answer is everyone. */}
            <p className="mt-5 border-t border-zinc-200 pt-4 text-sm leading-relaxed text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              These control what <em>we</em> may do with your records. What the people in your
              household can see is a separate set of choices —{" "}
              <Link href="/sharing" className="font-medium text-amber-600 hover:underline">
                Sharing &amp; privacy
              </Link>
              . Your individual transactions, receipts, goals, score and forecast are private there
              by default.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Every notice we owe you, separately and in both languages:{" "}
              <Link href="/legal" className="font-medium text-amber-600 hover:underline">
                Notices
              </Link>{" "}
              — including the{" "}
              <Link href="/legal/ai" className="font-medium text-amber-600 hover:underline">
                AI notice
              </Link>
              , the{" "}
              <Link href="/legal/hscore" className="font-medium text-amber-600 hover:underline">
                H-Score limits
              </Link>{" "}
              and the{" "}
              <Link href="/legal/retention" className="font-medium text-amber-600 hover:underline">
                retention schedule
              </Link>
              .
            </p>
          </Section>

          {/* Sealed backup sits between privacy and delete on purpose: it is
              the thing a person should do BEFORE they consider leaving, and the
              screen they are on when they think about their data leaving is the
              screen where the option belongs. */}
          <Section title="🔐 Sealed backup" tone="plain">
            <SealedBackup initial={await listVaults(ctx.tenant.id, ctx.user.id)} />
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

      {/* The AI engine section used to be three static bullets plus whichever
          provider an env var named. That told a user what the app *intends*,
          never whether it works — so someone whose key was rejected saw the
          same screen as someone whose key was fine. AiStatus probes instead. */}
      <div className="mt-8 flex flex-wrap gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          🤖 {tr("setup.status.provider").replace("{provider}", PROVIDER_LABEL[provider] ?? provider)}
        </span>
      </div>

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

      <Section title={`🛠️ ${tr("setup.admin.title")}`} tone="plain">
        <p>
          {tr("setup.admin.body")} <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">DEPLOY.md</code>.
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

// `id` is optional but load-bearing where it is passed: /privacy and the
// /settings/privacy redirect both deep-link to #privacy, and a notice that
// promises "manage this in Settings" has to land the reader ON the controls
// rather than at the top of a long page for them to hunt down.
function Section({ id, title, tone, children }: { id?: string; title: string; tone: "plain" | "good" | "warn"; children: React.ReactNode }) {
  const ring =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
        : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
  return (
    <section id={id} className={`mt-6 scroll-mt-20 rounded-2xl border p-5 text-sm leading-relaxed ${ring}`}>
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
