// Households, membership and roles — the layer that was missing.
//
// Before: `app_users` (accounts) had no relation to `tenants` (households), so
// every logged-in user was shown the same DEMO_TENANT_ID household and the API
// trusted whatever tenantId the caller passed in its body. This module makes a
// household a real, owned, shareable thing:
//
//   account  --members.user-->  member  --members.tenant-->  tenant (household)
//
// A household is shared by *inviting* another account into it. Both partners
// keep their own login; they resolve to the same tenant, so they see one set of
// records. That is the whole answer to "how does family login work".
//
// Server-only. Never import from a "use client" module.

import { randomBytes } from "node:crypto";
import { config } from "./config";
import { pbCreate, pbFirst, pbList, pbUpdate, pbStr } from "./pocketbase";
import { getSessionUser, type SessionUser } from "./auth";

export type AccessRole = "owner" | "adult" | "child" | "viewer";

export interface Household {
  id: string;
  name: string;
  baseCurrency: string;
  deletedAt?: string; // set while soft-deleted (pending purge); see lib/account.ts
}

export interface MemberRow {
  id: string;
  tenant: string;
  user: string;
  display_name: string;
  role: string; // free-text display label ("Wife", "Barista")
  access_role: AccessRole;
  created: string;
  expand?: { user?: { email: string; name: string } };
}

export interface Ctx {
  user: SessionUser;
  tenant: Household;
  memberId: string;
  accessRole: AccessRole;
  pendingDeletion: boolean; // the household is soft-deleted, awaiting purge/restore
}

// ── Permissions ─────────────────────────────────────────────────────────────
// Deliberately coarse. `child` can log their own spending but cannot see the
// household's whole financial picture or change anyone else's records — the
// point is to let a teenager build the habit without handing them the books.
export type Action =
  | "view_all"
  | "add_record"
  | "edit_any_record"
  | "edit_own_record"
  | "void_record"
  | "manage_graph"
  | "manage_members"
  | "invite";

const PERMISSIONS: Record<AccessRole, Action[]> = {
  owner: [
    "view_all",
    "add_record",
    "edit_any_record",
    "edit_own_record",
    "void_record",
    "manage_graph",
    "manage_members",
    "invite",
  ],
  adult: ["view_all", "add_record", "edit_any_record", "edit_own_record", "void_record", "manage_graph"],
  child: ["add_record", "edit_own_record"],
  viewer: ["view_all"],
};

export function can(role: AccessRole, action: Action): boolean {
  return PERMISSIONS[role]?.includes(action) ?? false;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// ── Session → household ─────────────────────────────────────────────────────

async function loadTenant(id: string): Promise<Household | null> {
  const t = await pbFirst<{ id: string; name: string; kind: string; base_currency: string; deleted_at?: string }>(
    "tenants",
    `id = ${pbStr(id)}`,
  );
  if (!t) return null;
  return {
    id: t.id,
    name: t.name,
    baseCurrency: t.base_currency || "MYR",
    deletedAt: t.deleted_at || undefined,
  };
}

// The household this account belongs to. If the account has no membership yet
// (i.e. it signed up before this existed), one is created on the spot so nobody
// lands on a broken dashboard.
export async function getContext(): Promise<Ctx | null> {
  const user = await getSessionUser();
  if (!user) return null;

  let member = await pbFirst<MemberRow>("members", `user = ${pbStr(user.id)}`, { sort: "created" });
  if (!member) {
    const created = await createHouseholdFor(user);
    member = created.member;
  }

  const tenant = await loadTenant(member.tenant);
  if (!tenant) return null;

  return {
    user,
    tenant,
    memberId: member.id,
    accessRole: (member.access_role as AccessRole) || "adult",
    pendingDeletion: Boolean(tenant.deletedAt),
  };
}

export async function requireContext(): Promise<Ctx> {
  const ctx = await getContext();
  if (!ctx) throw new AuthError("Sign in to do that.", 401);
  return ctx;
}

export async function requirePermission(action: Action): Promise<Ctx> {
  const ctx = await requireContext();
  if (!can(ctx.accessRole, action)) {
    throw new AuthError(`Your role (${ctx.accessRole}) cannot do that.`, 403);
  }
  return ctx;
}

// The tenant a *page* should render. Signed in → your own household. Signed out
// → the public demo household, read-only. Browsing is never gated behind an
// account (NEXT.md: "don't gate browsing behind an account"), but writing is.
export async function resolveViewTenant(): Promise<{ tenantId: string; ctx: Ctx | null; isDemo: boolean }> {
  const ctx = await getContext();
  if (ctx) return { tenantId: ctx.tenant.id, ctx, isDemo: false };
  return { tenantId: config.demoTenantId, ctx: null, isDemo: true };
}

// ── Creating a household ────────────────────────────────────────────────────

// A brand-new household with no buckets would break every view (the graph write
// path throws "No bucket exists for this tenant"), so seed the 3-bucket model.
const STARTER_BUCKETS: { label: string; props: Record<string, unknown> }[] = [
  { label: "Must-paid", props: { bucket: 1 } },
  { label: "Savings", props: { bucket: 2 } },
  { label: "Spendings", props: { bucket: 3, default_spend: true } },
];

export async function createHouseholdFor(
  user: SessionUser,
  opts: { name?: string } = {},
): Promise<{ tenant: Household; member: MemberRow }> {
  const displayName = user.name?.trim() || user.email.split("@")[0];
  const tenantRec = await pbCreate<{ id: string }>("tenants", {
    kind: "household",
    name: opts.name?.trim() || `${displayName}'s household`,
    base_currency: "MYR",
  });

  const member = await pbCreate<MemberRow>("members", {
    tenant: tenantRec.id,
    user: user.id,
    display_name: displayName,
    role: "Owner",
    access_role: "owner",
  });

  await Promise.all(
    STARTER_BUCKETS.map((b) =>
      pbCreate("nodes", { tenant: tenantRec.id, kind: "bucket", label: b.label, props: b.props }),
    ),
  );

  const tenant = await loadTenant(tenantRec.id);
  return { tenant: tenant!, member };
}

// ── Members ─────────────────────────────────────────────────────────────────

export async function listMembers(tenantId: string): Promise<MemberRow[]> {
  return pbList<MemberRow>("members", {
    filter: `tenant = ${pbStr(tenantId)}`,
    sort: "created",
    expand: "user",
  });
}

export async function setMemberRole(
  tenantId: string,
  memberId: string,
  role: AccessRole,
): Promise<void> {
  const member = await pbFirst<MemberRow>(
    "members",
    `id = ${pbStr(memberId)} && tenant = ${pbStr(tenantId)}`,
  );
  if (!member) throw new AuthError("No such member in this household.", 404);

  // Never let the last owner demote themselves — the household would be
  // unmanageable, with no one able to invite or change roles again.
  if (member.access_role === "owner" && role !== "owner") {
    const owners = await pbList<MemberRow>("members", {
      filter: `tenant = ${pbStr(tenantId)} && access_role = 'owner'`,
    });
    if (owners.length <= 1) {
      throw new AuthError("A household must keep at least one owner.", 400);
    }
  }
  await pbUpdate("members", memberId, { access_role: role });
}

// ── Invites ─────────────────────────────────────────────────────────────────

export interface Invite {
  id: string;
  code: string;
  tenant: string;
  access_role: AccessRole;
  display_name: string;
  email: string;
  expires_at: string;
  accepted_at: string;
  accepted_by: string;
  revoked: boolean;
}

const INVITE_TTL_DAYS = 14;

// Human-typeable: no O/0/I/1 confusion, grouped for reading aloud over the phone.
function inviteCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
}

export async function createInvite(
  tenantId: string,
  createdBy: string,
  opts: { role?: AccessRole; displayName?: string; email?: string } = {},
): Promise<Invite> {
  const expires = new Date();
  expires.setDate(expires.getDate() + INVITE_TTL_DAYS);

  return pbCreate<Invite>("invites", {
    tenant: tenantId,
    code: inviteCode(),
    access_role: opts.role ?? "adult",
    display_name: opts.displayName?.trim() ?? "",
    email: opts.email?.trim().toLowerCase() ?? "",
    created_by: createdBy,
    expires_at: expires.toISOString().replace("T", " "),
    revoked: false,
  });
}

export async function listInvites(tenantId: string): Promise<Invite[]> {
  return pbList<Invite>("invites", {
    filter: `tenant = ${pbStr(tenantId)} && revoked != true && accepted_at = ''`,
    sort: "-created",
  });
}

export async function revokeInvite(tenantId: string, inviteId: string): Promise<void> {
  const inv = await pbFirst<Invite>("invites", `id = ${pbStr(inviteId)} && tenant = ${pbStr(tenantId)}`);
  if (!inv) throw new AuthError("No such invite.", 404);
  await pbUpdate("invites", inviteId, { revoked: true });
}

// Join the household an invite points at. The joining account keeps its own
// login — it just gains a second membership row, and from then on resolves to
// the shared household.
export async function acceptInvite(user: SessionUser, rawCode: string): Promise<Household> {
  const code = rawCode.trim().toUpperCase();
  const invite = await pbFirst<Invite>("invites", `code = ${pbStr(code)}`);
  if (!invite) throw new AuthError("That invite code isn't valid.", 404);
  if (invite.revoked) throw new AuthError("That invite has been revoked.", 410);
  if (invite.accepted_at) throw new AuthError("That invite has already been used.", 410);
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    throw new AuthError("That invite has expired. Ask for a new one.", 410);
  }
  if (invite.email && invite.email !== user.email.toLowerCase()) {
    throw new AuthError("That invite was issued to a different email address.", 403);
  }

  const already = await pbFirst<MemberRow>(
    "members",
    `user = ${pbStr(user.id)} && tenant = ${pbStr(invite.tenant)}`,
  );
  if (already) throw new AuthError("You're already in this household.", 409);

  await pbCreate("members", {
    tenant: invite.tenant,
    user: user.id,
    display_name: invite.display_name || user.name || user.email.split("@")[0],
    role: "Member",
    access_role: invite.access_role || "adult",
  });

  await pbUpdate("invites", invite.id, {
    accepted_by: user.id,
    accepted_at: new Date().toISOString().replace("T", " "),
  });

  const tenant = await loadTenant(invite.tenant);
  if (!tenant) throw new AuthError("That household no longer exists.", 404);
  return tenant;
}

// Every household this account can reach (it may have been invited to more than
// one — e.g. their own, plus a parent's).
export async function listHouseholdsFor(userId: string): Promise<(Household & { accessRole: AccessRole })[]> {
  const memberships = await pbList<MemberRow>("members", {
    filter: `user = ${pbStr(userId)}`,
    sort: "created",
    expand: "tenant",
  });
  const out: (Household & { accessRole: AccessRole })[] = [];
  for (const m of memberships) {
    const t = await loadTenant(m.tenant);
    if (t) out.push({ ...t, accessRole: (m.access_role as AccessRole) || "adult" });
  }
  return out;
}
