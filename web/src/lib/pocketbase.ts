// PocketBase client via REST (fetch) — no SDK dependency, mirrors the style
// of gemini.ts. The Next.js server authenticates as a PocketBase superuser;
// collections are never exposed directly to browsers (all API rules are
// superuser-only). Server-side only — never import from a "use client" module.

import { config, isPocketBaseConfigured } from "./config";

interface PBListResult<T> {
  items: T[];
  totalItems: number;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (!isPocketBaseConfigured()) {
    throw new Error(
      "PocketBase is not configured. Set POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD.",
    );
  }
  // superuser tokens last ~2 weeks; refresh well before that
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  const res = await fetch(
    `${config.pocketbaseUrl}/api/collections/_superusers/auth-with-password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identity: config.pocketbaseAdminEmail,
        password: config.pocketbaseAdminPassword,
      }),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`PocketBase auth failed (${res.status}) — is it running? Try: npm run pb:start`);
  }
  const data = await res.json();
  cachedToken = { token: data.token, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
  return data.token;
}

async function pbFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${config.pocketbaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`PocketBase ${res.status} on ${path}: ${detail.slice(0, 300)}`);
  }
  // DELETE and some writes return 204 No Content — nothing to parse.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// List records with a PocketBase filter expression.
export async function pbList<T>(
  collection: string,
  opts: { filter?: string; sort?: string; expand?: string; perPage?: number } = {},
): Promise<T[]> {
  const params = new URLSearchParams({ perPage: String(opts.perPage ?? 500), skipTotal: "1" });
  if (opts.filter) params.set("filter", opts.filter);
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.expand) params.set("expand", opts.expand);
  const data = await pbFetch<PBListResult<T>>(
    `/api/collections/${collection}/records?${params.toString()}`,
  );
  return data.items;
}

export async function pbFirst<T>(
  collection: string,
  filter: string,
  opts: { sort?: string } = {},
): Promise<T | null> {
  const items = await pbList<T>(collection, { filter, sort: opts.sort, perPage: 1 });
  return items[0] ?? null;
}

export async function pbCreate<T>(
  collection: string,
  body: Record<string, unknown>,
): Promise<T> {
  return pbFetch<T>(`/api/collections/${collection}/records`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function pbUpdate<T>(
  collection: string,
  id: string,
  body: Record<string, unknown>,
): Promise<T> {
  return pbFetch<T>(`/api/collections/${collection}/records/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function pbDelete(collection: string, id: string): Promise<void> {
  await pbFetch<unknown>(`/api/collections/${collection}/records/${id}`, {
    method: "DELETE",
  });
}

// Escape a value for use inside a PocketBase filter string literal.
export function pbStr(value: string): string {
  return `'${value.replace(/'/g, "\\'")}'`;
}
