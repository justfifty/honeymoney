import Link from "next/link";
import Logo from "../Logo";

export const metadata = {
  title: "Delete your account & data",
  description: "How to delete your HoneyMoney account and data, what gets removed, and the 30-day restore window.",
};

// Public, logged-out account-deletion policy page. Google Play requires a URL,
// reachable without signing in, that explains how a user deletes their account
// and data and what is removed — this is it. The actual button lives in-app on
// /account; this page documents the process and the guarantees.
export default function DeleteAccountInfoPage() {
  return (
    <main className="mx-auto min-h-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center gap-2">
        <Logo size={24} />
        <h1 className="text-2xl font-semibold tracking-tight">Deleting your account &amp; data</h1>
      </header>
      <p className="mt-2 text-sm text-zinc-500">
        HoneyMoney (developer: Team HoneyMoney) lets you delete your account and all associated data at any
        time. Here&apos;s how, and exactly what happens.
      </p>

      <Section title="How to delete your account">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Open the app and sign in.</li>
          <li>
            Go to <b>Menu → Account</b> (or visit <Link href="/account" className="text-amber-600 hover:underline">/account</Link>).
          </li>
          <li>Under <b>Danger zone</b>, type your email to confirm and tap <b>Delete my account</b>.</li>
        </ol>
        <p className="mt-3 text-xs text-zinc-500">
          Child accounts are managed by a household owner: an owner removes them from the Household page.
        </p>
      </Section>

      <Section title="What gets deleted">
        <ul className="list-disc space-y-2 pl-5">
          <li>Your login (email and password).</li>
          <li>
            If you&apos;re the only member of your household: <b>all of its financial data</b> — transactions,
            budgets/buckets, the knowledge graph, members, invites, and the immutable audit trail.
          </li>
          <li>
            If you share the household with others: your login is removed and you leave it. The shared records
            stay for the remaining members (your past entries remain, no longer attributed to you). One person
            can never erase another&apos;s data.
          </li>
        </ul>
      </Section>

      <Section title="The 30-day restore window">
        <p>
          Deletion is not instant. Your household is first <b>scheduled for deletion</b> and stays fully
          recoverable for <b>30 days</b> — sign back in within that time and choose <b>Restore</b>. After 30
          days everything above is <b>permanently erased</b> and cannot be recovered.
        </p>
      </Section>

      <Section title="Uninstalling the app">
        <p>
          Uninstalling removes the app from your device but does <b>not</b> delete your account — use the steps
          above to delete your data. On Android: long-press the HoneyMoney icon → <b>Uninstall</b> (or remove it
          from Google Play). On a browser/desktop PWA: use your browser&apos;s app or extensions menu to remove it.
        </p>
      </Section>

      <p className="mt-8 text-xs text-zinc-400">
        Questions about your data? See the <Link href="/guide" className="text-amber-600 hover:underline">Guide</Link>{" "}
        for the full privacy promise.
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 text-sm leading-relaxed dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
