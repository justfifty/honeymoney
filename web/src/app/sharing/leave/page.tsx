import Link from "next/link";
import type { Metadata } from "next";
import { getContext, listMembers } from "@/lib/household";
import Logo from "../../Logo";
import LeaveHousehold from "./LeaveHousehold";
import QuickExit from "./QuickExit";

export const metadata: Metadata = {
  title: "Leaving and safety",
  description:
    "How to stop sharing, leave a household, take your data with you, and what the other people will and will not be able to see.",
};

// The page for the worst case.
//
// A shared-money app has a failure mode that a budgeting app does not: it can
// become an instrument of control. Financial abuse is a recognised pattern, one
// partner monitoring another's spending is one of its ordinary forms, and an
// app that makes household money visible has built exactly the surface it runs
// on. Pretending otherwise would not make it untrue.
//
// So this page exists, it is linked from the sharing screen and the guide, and
// it is written on three assumptions: the reader may have very little time,
// they may be being watched, and they need facts rather than reassurance —
// including the fact that leaving a household is visible to the people in it.
export default async function LeavingPage() {
  const ctx = await getContext().catch(() => null);
  const members = ctx ? await listMembers(ctx.tenant.id).catch(() => []) : [];
  const others = ctx ? members.filter((m) => m.id !== ctx.memberId) : [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
          <Logo size={24} /> Leaving and safety
        </h1>
        <Link href="/sharing" className="text-sm text-zinc-500 hover:underline">
          Sharing
        </Link>
      </header>

      <div className="mt-6">
        <QuickExit />
      </div>

      {/* ── What the others can tell ───────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          What the other people will be able to tell
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          This is the part most apps leave out, so it goes first. We will not send anyone a
          notification, an email or a message about anything you do here. But some of it is visible
          if they go looking, and you should decide knowing which is which.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
            <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              They cannot see
            </h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-emerald-900 dark:text-emerald-200">
              <li>That you opened this page, or the sharing screen.</li>
              <li>Which switches you changed, or when.</li>
              <li>Anything you have switched off — including your past records.</li>
              <li>That you exported your data.</li>
              <li>Your access log. Yours is yours; theirs is theirs.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20">
            <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              They can tell
            </h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              <li>
                That figures they used to see are no longer there — a hidden record leaves a gap
                where it used to be.
              </li>
              <li>That you are no longer on the member list, if you leave the household.</li>
              <li>Anything they already read, remembered or screenshotted.</li>
              <li>Anything on a device they can unlock.</li>
            </ul>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">
          If being seen to withdraw is itself the risk, the safest order is usually: take your
          export first, then decide. Nothing about exporting is visible to anyone else.
        </p>
      </section>

      {/* ── Take your data ─────────────────────────────────────────────── */}
      <section className="mt-10 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold">1. Take your data first</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          One click, no notification, machine-readable JSON containing everything you can see. Do
          this before anything else — after you leave a household you can no longer export its
          shared history, only your own records.
        </p>
        <a
          href="/api/account/export"
          className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-zinc-300 px-5 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Download my data
        </a>
      </section>

      {/* ── Stop sharing ───────────────────────────────────────────────── */}
      <section className="mt-6 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold">2. Stop sharing, without leaving</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          If staying in the household matters — practically, or because leaving would be noticed —
          you can close everything down and stay. Switching every share off hides your history as
          well as anything new, and you remain on the member list exactly as before.
        </p>
        <Link
          href="/sharing"
          className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-zinc-300 px-5 text-sm font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Open sharing settings
        </Link>
      </section>

      {/* ── Leave ──────────────────────────────────────────────────────── */}
      <section className="mt-6 rounded-2xl border border-rose-300 p-5 dark:border-rose-900">
        <h2 className="text-base font-semibold">3. Leave the household</h2>
        {!ctx ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            <Link href="/login?next=/sharing/leave" className="text-amber-600 hover:underline">
              Sign in
            </Link>{" "}
            to leave a household.
          </p>
        ) : others.length === 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            There is nobody else in <strong>{ctx.tenant.name}</strong>, so there is nothing to leave
            — nobody can see your records. If you want the account itself gone,{" "}
            <Link href="/setup#privacy" className="text-amber-600 hover:underline">
              close it from Settings
            </Link>
            .
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Immediate, and nobody has to agree to it. Your sharing is switched off first, then
              your membership is removed. You keep your account, and you get a household of your own
              with nobody else in it.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              <strong>Records you entered stay in that household&rsquo;s history.</strong> They are
              part of its accounts, and removing them would silently change months of totals for the
              people still there. What goes is the link to you: your sharing is revoked, your name
              comes off the member list, and nothing new of yours ever reaches them.
            </p>
            <div className="mt-4">
              <LeaveHousehold householdName={ctx.tenant.name} />
            </div>
          </>
        )}
      </section>

      {/* ── Real help ──────────────────────────────────────────────────── */}
      <section className="mt-10 rounded-2xl border border-zinc-300 bg-zinc-50 p-5 dark:border-zinc-700 dark:bg-zinc-900/60">
        <h2 className="text-base font-semibold">If someone is controlling your money</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Being stopped from having your own money, having your spending policed, or having debt
          taken out in your name is a recognised form of abuse, and there is help for it in
          Malaysia. HoneyMoney is a budgeting app — it is not a counsellor, a lawyer or a refuge,
          and these are.
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <li>
            <strong>Talian Kasih — 15999</strong> (also on WhatsApp at 019-261 5999). The national
            helpline, 24 hours, run by the Ministry of Women, Family and Community Development.
          </li>
          <li>
            <strong>Women&rsquo;s Aid Organisation</strong> —{" "}
            <a
              href="https://wao.org.my"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-600 underline underline-offset-2"
            >
              wao.org.my
            </a>
            . Free, confidential support and shelter, including on financial abuse.
          </li>
          <li>
            <strong>AKPK</strong> —{" "}
            <a
              href="https://www.akpk.org.my"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-600 underline underline-offset-2"
            >
              akpk.org.my
            </a>
            . Free credit counselling from Bank Negara, including debt taken out in your name.
          </li>
          <li>
            In immediate danger, call <strong>999</strong>.
          </li>
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          These organisations are independent of us. We do not tell them anything about you, and we
          have no arrangement with any of them.
        </p>
      </section>

      <footer className="mt-12 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">
        <p>
          <Link href="/sharing" className="underline underline-offset-2">
            Sharing settings
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy notice
          </Link>{" "}
          · <strong>privacy@honeymoney.app</strong>
        </p>
      </footer>
    </main>
  );
}
