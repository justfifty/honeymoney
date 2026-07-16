// Account lifecycle: delete (soft, reversible), restore, and the scheduled
// hard-purge. Server-only. See pb_migrations/*_account_soft_delete.js for the
// two-phase model and lib/household.ts for the role/permission layer.
//
// Rules baked in here (product decisions):
//   • Children can't self-delete — a household owner manages child accounts.
//   • In a SHARED household you can't erase the shared books; you may only LEAVE
//     (your login + roster entry go; your past entries stay, unattributed). A
//     sole owner must hand ownership over first.
//   • A SOLO household is soft-deleted whole, recoverable for the grace window,
//     then permanently purged (login + immutable ledger included).

import { pbList, pbFirst, pbUpdate, pbDelete, pbStr } from "./pocketbase";
import { getSessionUser, loginUser } from "./auth";
import { AuthError, type AccessRole } from "./household";

export const DELETE_GRACE_DAYS = 30;
const DAY_MS = 86_400_000;

interface TenantRow {
  id: string;
  name: string;
  deleted_at?: string;
}
interface MemberLite {
  id: string;
  user: string;
  access_role: AccessRole;
  tenant: string;
}

// PocketBase stores datetimes as "YYYY-MM-DD HH:MM:SS.sssZ"; a space, not a "T".
function pbDate(d: Date): string {
  return d.toISOString().replace("T", " ");
}

// ── Profile edits ───────────────────────────────────────────────────────────

// Change the display name on the account (and mirror it onto the roster entry so
// the household list and the graph attribution stay in sync).
export async function updateMyName(name: string): Promise<{ name: string }> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Sign in first.", 401);
  const clean = name.trim();
  if (!clean) throw new AuthError("Name can’t be empty.", 400);
  if (clean.length > 80) throw new AuthError("That name is too long.", 400);
  await pbUpdate("app_users", user.id, { name: clean });
  const member = await pbFirst<{ id: string }>("members", `user = ${pbStr(user.id)}`, { sort: "created" });
  if (member) await pbUpdate("members", member.id, { display_name: clean });
  return { name: clean };
}

// Change the password. We verify the *current* one by re-authenticating (the
// superuser could set it without proof, but that would let a stolen session
// change the password), then set the new one. Because PocketBase rotates the
// token secret on a password change — invalidating the current session cookie —
// we log back in and hand the caller a fresh token to re-set the cookie.
export async function changeMyPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ token: string }> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Sign in first.", 401);
  if (newPassword.length < 8) throw new AuthError("New password must be at least 8 characters.", 400);
  try {
    await loginUser(user.email, currentPassword);
  } catch {
    throw new AuthError("Your current password is incorrect.", 403);
  }
  await pbUpdate("app_users", user.id, { password: newPassword, passwordConfirm: newPassword });
  const { token } = await loginUser(user.email, newPassword);
  return { token };
}

export interface DeleteResult {
  mode: "soft" | "left";
  household: string;
  purgeAt?: string; // ISO — only when mode === "soft"
}

// Delete the signed-in account, acting on the household it currently resolves to
// (its first membership, matching getContext).
export async function deleteMyAccount(): Promise<DeleteResult> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Sign in first.", 401);

  const memberships = await pbList<MemberLite>("members", {
    filter: `user = ${pbStr(user.id)}`,
    sort: "created",
  });
  if (!memberships.length) {
    await pbDelete("app_users", user.id); // orphan login, nothing attached
    return { mode: "left", household: "" };
  }
  const mine = memberships[0];

  // Family rule: children are managed by an owner, not self-service.
  if (mine.access_role === "child") {
    throw new AuthError(
      "Child accounts are managed by a household owner — ask them to remove your account.",
      403,
    );
  }

  const tenant = await pbFirst<TenantRow>("tenants", `id = ${pbStr(mine.tenant)}`);
  const householdName = tenant?.name ?? "your household";

  const all = await pbList<MemberLite>("members", { filter: `tenant = ${pbStr(mine.tenant)}` });
  const others = all.filter((m) => m.id !== mine.id);

  if (others.length > 0) {
    // Shared household: one person can never erase the shared books. Leave only —
    // and only while the household keeps an owner.
    if (mine.access_role === "owner") {
      const owners = all.filter((m) => m.access_role === "owner");
      if (owners.length <= 1) {
        throw new AuthError("You're the only owner. Make someone else an owner before you leave.", 400);
      }
    }
    await pbDelete("members", mine.id); // your past entries stay (member nulled)
    await pbDelete("app_users", user.id);
    return { mode: "left", household: householdName };
  }

  // Solo household: soft-delete the whole thing, recoverable for the grace window.
  const now = new Date();
  const purgeAt = new Date(now.getTime() + DELETE_GRACE_DAYS * DAY_MS);
  await pbUpdate("tenants", mine.tenant, { deleted_at: pbDate(now), deleted_by: user.id });
  return { mode: "soft", household: householdName, purgeAt: purgeAt.toISOString() };
}

// Undo a soft-delete while still inside the grace window.
export async function restoreMyAccount(): Promise<{ household: string }> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Sign in first.", 401);
  const mine = await pbFirst<MemberLite>("members", `user = ${pbStr(user.id)}`, { sort: "created" });
  if (!mine) throw new AuthError("No household to restore.", 404);
  const tenant = await pbFirst<TenantRow>("tenants", `id = ${pbStr(mine.tenant)}`);
  if (!tenant?.deleted_at) throw new AuthError("This household isn't scheduled for deletion.", 400);
  // Clearing PB date/relation fields: send empty strings, not null.
  await pbUpdate("tenants", tenant.id, { deleted_at: "", deleted_by: "" });
  return { household: tenant.name };
}

// Permanently erase every household whose grace window has elapsed. Idempotent —
// safe to run on a schedule (see /api/account/purge-expired).
export async function purgeExpiredHouseholds(): Promise<{ purged: number; households: string[] }> {
  const cutoff = pbDate(new Date(Date.now() - DELETE_GRACE_DAYS * DAY_MS));
  const expired = await pbList<TenantRow>("tenants", {
    filter: `deleted_at != '' && deleted_at < ${pbStr(cutoff)}`,
    perPage: 200,
  });

  const names: string[] = [];
  for (const t of expired) {
    // Capture member logins before the tenant cascade removes their rows.
    const members = await pbList<MemberLite>("members", { filter: `tenant = ${pbStr(t.id)}` });

    // The immutable trail is cascadeDelete:false by design; erase it explicitly
    // so a purged household leaves no financial record behind.
    await deleteAllForTenant("ledger", t.id);
    await deleteAllForTenant("ledger_anchors", t.id);
    await deleteAllForTenant("ai_usage", t.id); // tenant stored as free text, no cascade

    // Cascade handles members/nodes/edges/transactions/invites/channel_links/…
    await pbDelete("tenants", t.id);

    // Remove member logins that now belong to no remaining household.
    for (const m of members) {
      const still = await pbFirst<MemberLite>("members", `user = ${pbStr(m.user)}`);
      if (!still) {
        try {
          await pbDelete("app_users", m.user);
        } catch {
          /* already gone */
        }
      }
    }
    names.push(t.name);
  }
  return { purged: expired.length, households: names };
}

async function deleteAllForTenant(collection: string, tenantId: string): Promise<void> {
  let rows = await pbList<{ id: string }>(collection, {
    filter: `tenant = ${pbStr(tenantId)}`,
    perPage: 500,
  });
  while (rows.length) {
    for (const r of rows) await pbDelete(collection, r.id);
    rows = await pbList<{ id: string }>(collection, {
      filter: `tenant = ${pbStr(tenantId)}`,
      perPage: 500,
    });
  }
}
