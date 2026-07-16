import Link from "next/link";
import { redirect } from "next/navigation";
import { isDatabaseConfigured } from "@/lib/config";
import { getContext, listMembers } from "@/lib/household";
import { DELETE_GRACE_DAYS } from "@/lib/account";
import Logo from "../Logo";
import AccountActions from "./AccountActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your account" };

// Account home: who you are, plus the reversible "delete my account" flow (Play
// Store / GDPR). What deletion actually does depends on your household and role,
// so we compute that here and let AccountActions render the right, guarded UI.
export default async function AccountPage() {
  if (!isDatabaseConfigured()) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm">
          PocketBase isn&apos;t running — start it with <code>npm run pb:start</code>.
        </p>
      </main>
    );
  }

  const ctx = await getContext();
  if (!ctx) redirect("/login?next=/account");

  const members = await listMembers(ctx.tenant.id);
  const others = members.filter((m) => m.id !== ctx.memberId);
  const owners = members.filter((m) => m.access_role === "owner");

  const purgeAtISO = ctx.tenant.deletedAt
    ? new Date(new Date(ctx.tenant.deletedAt.replace(" ", "T")).getTime() + DELETE_GRACE_DAYS * 86_400_000).toISOString()
    : undefined;

  return (
    <main className="mx-auto min-h-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Logo size={24} /> Your account
        </h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/household" className="text-zinc-500 hover:underline">👥 Household</Link>
          <Link href="/dashboard" className="text-zinc-500 hover:underline">📊 Dashboard</Link>
        </nav>
      </header>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <dl className="grid grid-cols-[7rem_1fr] gap-y-2">
          <dt className="text-zinc-500">Email</dt>
          <dd className="font-medium">{ctx.user.email}</dd>
          <dt className="text-zinc-500">Household</dt>
          <dd className="font-medium">{ctx.tenant.name}</dd>
          <dt className="text-zinc-500">Your role</dt>
          <dd className="font-medium capitalize">{ctx.accessRole}</dd>
        </dl>
      </section>

      <AccountActions
        email={ctx.user.email}
        role={ctx.accessRole}
        shared={others.length > 0}
        soleOwner={ctx.accessRole === "owner" && owners.length <= 1 && others.length > 0}
        pending={ctx.pendingDeletion}
        purgeAtISO={purgeAtISO}
        graceDays={DELETE_GRACE_DAYS}
      />
    </main>
  );
}
