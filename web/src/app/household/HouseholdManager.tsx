"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AccessRole = "owner" | "adult" | "child" | "viewer";

interface Member {
  id: string;
  displayName: string;
  role: string;
  accessRole: AccessRole;
  email: string;
  isAccount: boolean;
  isMe: boolean;
}

interface Invite {
  id: string;
  code: string;
  accessRole: AccessRole;
  displayName: string;
  email: string;
  expiresAt: string;
}

const ROLES: AccessRole[] = ["owner", "adult", "child", "viewer"];

const ROLE_HINT: Record<AccessRole, string> = {
  owner: "Full control, including invites and roles",
  adult: "Full access to money; cannot invite",
  child: "Logs only their own spending",
  viewer: "Read-only",
};

export default function HouseholdManager({
  tenantName,
  me,
  initialMembers,
  initialInvites,
  canInvite,
  canManage,
}: {
  tenantName: string;
  me: { memberId: string; accessRole: AccessRole; email: string };
  initialMembers: Member[];
  initialInvites: Invite[];
  canInvite: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [inviteRole, setInviteRole] = useState<AccessRole>("adult");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");

  async function createInvite() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/household/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: inviteRole, displayName: inviteName, email: inviteEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create an invite.");
      setInvites((v) => [data.invite, ...v]);
      setInviteName("");
      setInviteEmail("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create an invite.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/household/invite?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not revoke that invite.");
      setInvites((v) => v.filter((i) => i.id !== id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not revoke that invite.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(memberId: string, role: AccessRole) {
    setBusy(true);
    setErr(null);
    const prev = members;
    setMembers((ms) => ms.map((m) => (m.id === memberId ? { ...m, accessRole: role } : m)));
    try {
      const res = await fetch("/api/household/member", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, role }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not change that role.");
      router.refresh();
    } catch (e) {
      setMembers(prev); // the server refused — put the UI back
      setErr(e instanceof Error ? e.message : "Could not change that role.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(code: string) {
    const link = `${window.location.origin}/signup?code=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setErr("Couldn't copy — select the code and copy it manually.");
    }
  }

  const field =
    "rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <>
      {err && (
        <p role="alert" className="mt-6 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
          ⚠️ {err}
        </p>
      )}

      {/* Who's in the household */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          People in {tenantName}
        </h2>
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-50 px-4 py-3 last:border-0 dark:border-zinc-800/60"
            >
              <div className="min-w-0">
                <span className="text-sm font-medium">
                  {m.displayName}
                  {m.isMe && <span className="ml-2 text-xs font-normal text-amber-600">you</span>}
                </span>
                <div className="text-xs text-zinc-400">
                  {m.isAccount ? (
                    m.email || "has a login"
                  ) : (
                    // A roster name with no account: spending can be attributed to
                    // them, but they can't sign in. Worth saying plainly — it's a
                    // confusing distinction otherwise.
                    <span title="A name on the graph, not an account — invite them to give them a login.">
                      no login yet
                    </span>
                  )}
                  {m.role && <span> · {m.role}</span>}
                </div>
              </div>

              {canManage && !m.isMe ? (
                <select
                  value={m.accessRole}
                  disabled={busy}
                  onChange={(e) => changeRole(m.id, e.target.value as AccessRole)}
                  className={`${field} text-xs`}
                  title={ROLE_HINT[m.accessRole]}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {m.accessRole}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Invites */}
      {canInvite && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Invite someone
          </h2>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs text-zinc-500">
                Their name
                <input
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="e.g. Siti"
                  className={field}
                />
              </label>
              <label className="flex min-w-44 flex-1 flex-col gap-1 text-xs text-zinc-500">
                Their email (optional)
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="locks the code to them"
                  className={field}
                />
              </label>
              <label className="flex w-28 flex-col gap-1 text-xs text-zinc-500">
                Role
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as AccessRole)}
                  className={field}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={createInvite}
                disabled={busy}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {busy ? "…" : "Create code"}
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              {ROLE_HINT[inviteRole]}. Codes expire after 14 days.{" "}
              {inviteEmail
                ? "Only that email address will be able to redeem it."
                : "Anyone with the code can join — set an email to lock it down."}
            </p>
          </div>

          {invites.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              {invites.map((i) => (
                <div
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-50 px-4 py-3 last:border-0 dark:border-zinc-800/60"
                >
                  <div className="min-w-0">
                    <code className="rounded bg-zinc-100 px-2 py-1 font-mono text-sm font-semibold tracking-widest dark:bg-zinc-800">
                      {i.code}
                    </code>
                    <span className="ml-2 text-xs text-zinc-400">
                      {i.accessRole}
                      {i.displayName && ` · ${i.displayName}`}
                      {i.email && ` · ${i.email}`}
                      {i.expiresAt && ` · expires ${new Date(i.expiresAt).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copy(i.code)}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      {copied === i.code ? "✅ Copied link" : "Copy invite link"}
                    </button>
                    <button
                      type="button"
                      onClick={() => revoke(i.id)}
                      disabled={busy}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-rose-950/30"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
