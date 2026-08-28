// Auth + session for HoneyMoney accounts (PocketBase `app_users` auth collection).
// The Next.js server holds an httpOnly cookie with the user's PB token; the
// browser never talks to PocketBase directly. Roles: "user" | "admin".

import { cache } from "react";
import { cookies } from "next/headers";
import { config } from "./config";
import { pbCreate } from "./pocketbase";

export const AUTH_COOKIE = "hm_auth";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
}

interface PBUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

function toUser(rec: PBUser): SessionUser {
  return {
    id: rec.id,
    email: rec.email,
    name: rec.name ?? "",
    role: rec.role === "admin" ? "admin" : "user",
  };
}

// Verify credentials against PocketBase; returns a token + the user.
export async function loginUser(
  identity: string,
  password: string,
): Promise<{ token: string; user: SessionUser }> {
  const res = await fetch(
    `${config.pocketbaseUrl}/api/collections/app_users/auth-with-password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity, password }),
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error("Invalid email or password.");
  const data = await res.json();
  return { token: data.token, user: toUser(data.record as PBUser) };
}

// Create a new account (role defaults to "user"), superuser-mediated.
export async function signupUser(email: string, password: string, name: string): Promise<void> {
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  await pbCreate("app_users", {
    email,
    password,
    passwordConfirm: password,
    name: name?.trim() || email.split("@")[0],
    role: "user",
    verified: true,
    emailVisibility: false,
  });
}

// Resolve the current session from the auth cookie (null if signed out/expired).
//
// WRAPPED IN React `cache()`, and that is a performance fix, not a tidy-up. One
// page render asks this question four times over — SiteHeader, the deletion
// bar, the legal bar, and the page itself through getContext() — and each ask
// was a separate auth-refresh round trip to PocketBase. Measured against the
// live origin that is ~4 × 15-90 ms of pure duplication before a pixel renders.
// `cache()` scopes the memo to ONE request, so a second caller in the same
// render is free and a different visitor still gets their own lookup.
export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${config.pocketbaseUrl}/api/collections/app_users/auth-refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return toUser(data.record as PBUser);
  } catch {
    return null;
  }
});
