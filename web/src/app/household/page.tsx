import Link from "next/link";
import { redirect } from "next/navigation";
import { isDatabaseConfigured } from "@/lib/config";
import { getContext, listInvites, listMembers, can } from "@/lib/household";
import HouseholdManager from "./HouseholdManager";

export const dynamic = "force-dynamic";

// The answer to "how does family login work", made visible.
//
// A household is one tenant. Each person has their OWN account — their own email
// and password — and joins the household with an invite code. They then all
// resolve to the same tenant, so they see one shared set of records, one graph,
// one set of buckets. Roles decide what each of them can do inside it.
export default async function HouseholdPage() {
  if (!isDatabaseConfigured()) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm">PocketBase isn&apos;t running — start it with <code>npm run pb:start</code>.</p>
      </main>
    );
  }

  const ctx = await getContext();
  if (!ctx) redirect("/login?next=/household");

  const [members, invites] = await Promise.all([
    listMembers(ctx.tenant.id),
    can(ctx.accessRole, "invite") ? listInvites(ctx.tenant.id) : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto min-h-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">👥 {ctx.tenant.name}</h1>
          <p className="text-sm text-zinc-500">
            Everyone here shares one set of records. You are signed in as{" "}
            <span className="font-medium">{ctx.user.email}</span> ({ctx.accessRole}).
          </p>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/dashboard" className="text-zinc-500 hover:underline">📊 Dashboard</Link>
          <Link href="/ledger" className="text-zinc-500 hover:underline">🔗 Audit trail</Link>
        </nav>
      </header>

      <HouseholdManager
        tenantName={ctx.tenant.name}
        me={{ memberId: ctx.memberId, accessRole: ctx.accessRole, email: ctx.user.email }}
        initialMembers={members.map((m) => ({
          id: m.id,
          displayName: m.display_name,
          role: m.role,
          accessRole: m.access_role,
          email: m.expand?.user?.email ?? "",
          isAccount: Boolean(m.user),
          isMe: m.id === ctx.memberId,
        }))}
        initialInvites={invites.map((i) => ({
          id: i.id,
          code: i.code,
          accessRole: i.access_role,
          displayName: i.display_name,
          email: i.email,
          expiresAt: i.expires_at,
        }))}
        canInvite={can(ctx.accessRole, "invite")}
        canManage={can(ctx.accessRole, "manage_members")}
      />

      <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-semibold">How family login works</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-zinc-600 dark:text-zinc-400">
          <li>
            <strong>Everyone keeps their own login.</strong> You never share a password. Your partner
            signs up with their own email — no one is ever logged in as someone else.
          </li>
          <li>
            <strong>One of you invites the other.</strong> Generate a code above and send it to them.
            Tie it to their email address and only that address can use it.
          </li>
          <li>
            <strong>They redeem it</strong> at sign-up, or from <Link href="/join" className="text-amber-600 hover:underline">Join a household</Link> if
            they already have an account.
          </li>
          <li>
            <strong>From then on you share one household.</strong> Both accounts resolve to the same
            records, buckets and graph — add a spend on your phone and it appears on theirs.
          </li>
        </ol>

        <h3 className="mt-5 font-semibold">What each role can do</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-xs">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Role</th>
                <th className="py-1 pr-3 font-medium">Can do</th>
              </tr>
            </thead>
            <tbody className="text-zinc-600 dark:text-zinc-400">
              <tr className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="py-1.5 pr-3 font-medium">Owner</td>
                <td className="py-1.5">Everything, plus invite people and change roles.</td>
              </tr>
              <tr className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="py-1.5 pr-3 font-medium">Adult</td>
                <td className="py-1.5">See everything; add, correct and remove any record; change the plan.</td>
              </tr>
              <tr className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="py-1.5 pr-3 font-medium">Child</td>
                <td className="py-1.5">Log their own spending and correct their own entries — but not see the household&apos;s full books.</td>
              </tr>
              <tr className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="py-1.5 pr-3 font-medium">Viewer</td>
                <td className="py-1.5">Look, but change nothing. (A grandparent, an accountant.)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-zinc-400">
          Every change anyone makes — adding, correcting or removing a record — is written to a
          tamper-evident{" "}
          <Link href="/ledger" className="text-amber-600 hover:underline">
            audit trail
          </Link>
          . Nothing can be quietly deleted.
        </p>
      </section>
    </main>
  );
}
