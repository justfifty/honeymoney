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

/**
 * Every matching record, not the first page of them.
 *
 * ── WHY THIS HAD TO EXIST ──────────────────────────────────────────────────
 *
 * PocketBase caps `perPage` at 1000 and does it SILENTLY. Ask for 5,000 and you
 * get 1,000 rows, status 200, no warning, no flag. Measured on a seeded
 * household of 100,000 transactions:
 *
 *     asked perPage=500     ->  got   500 rows
 *     asked perPage=1000    ->  got 1000 rows
 *     asked perPage=5000    ->  got 1000 rows
 *     asked perPage=100000  ->  got 1000 rows      (totalItems = 100000)
 *
 * Every read path in this app used one `pbList` call and trusted it. So at
 * scale the app was not slow — it was WRONG, and quietly: the dashboard, the
 * record totals, goal progress and the H-Score were all computed from the first
 * 500 or 1000 rows of a ledger that had a hundred thousand, and every figure
 * came out too small with nothing on screen to say so. In the same measurement
 * a single MONTH held 1,110 records, so the truncation had already started
 * inside the current month's figures, not in some far-off future.
 *
 * ── THE CEILING IS A THROW, NOT A TRIM ─────────────────────────────────────
 *
 * The bug was never the limit; it was the silence. So when this hits its own
 * ceiling it raises, naming the collection and the filter. A view that cannot
 * total a household's records must say so — a wrong number that looks right is
 * the one outcome worth failing to avoid.
 *
 * Cost, measured against those 100,000 rows on a local PocketBase:
 *     one month             1,110 rows,   2 pages,   106 ms
 *     goal-linked, all time 3,334 rows,   4 pages,   496 ms
 *     the entire ledger   100,000 rows, 101 pages, 11,300 ms
 *
 * Which is the argument for keeping reads date-bounded: paging a window is
 * cheap and paging a lifetime is not. Callers that genuinely need all-time
 * totals (goal progress, liquid savings) are the ones to convert to stored
 * aggregates first if a household ever gets near the ceiling.
 */
const PB_MAX_PER_PAGE = 1000;

export async function pbListAll<T>(
  collection: string,
  opts: { filter?: string; sort?: string; expand?: string; maxRows?: number } = {},
): Promise<T[]> {
  const maxRows = opts.maxRows ?? 50_000;
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      perPage: String(PB_MAX_PER_PAGE),
      page: String(page),
      skipTotal: "1",
    });
    if (opts.filter) params.set("filter", opts.filter);
    if (opts.sort) params.set("sort", opts.sort);
    if (opts.expand) params.set("expand", opts.expand);
    const data = await pbFetch<PBListResult<T>>(
      `/api/collections/${collection}/records?${params.toString()}`,
    );
    out.push(...data.items);
    // A short page is the end. `skipTotal` means there is no count to compare
    // against, which is the cheap way to page and the reason this is the test.
    if (data.items.length < PB_MAX_PER_PAGE) return out;
    if (out.length >= maxRows) {
      throw new Error(
        `Too many ${collection} records to total in one view (over ${maxRows}). ` +
          `Narrow the date range. Filter: ${opts.filter ?? "(none)"}`,
      );
    }
  }
}

export async function pbFirst<T>(
  collection: string,
  filter: string,
  opts: { sort?: string; expand?: string } = {},
): Promise<T | null> {
  const items = await pbList<T>(collection, {
    filter,
    sort: opts.sort,
    expand: opts.expand,
    perPage: 1,
  });
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

// ── files ──────────────────────────────────────────────────────────────────
//
// Attachments go up as multipart, which is the one place the JSON Content-Type
// above must NOT be set: the boundary is generated by fetch when it serialises
// the FormData, and naming the type by hand produces a body the server cannot
// parse. Hence a separate path rather than a flag on pbFetch.

/** Append files to a record's file field. Returns the record's stored filenames. */
export async function pbUploadFiles(
  collection: string,
  id: string,
  field: string,
  files: { name: string; type: string; bytes: Uint8Array }[],
): Promise<string[]> {
  if (!files.length) return [];
  const token = await getToken();
  const form = new FormData();
  for (const f of files) {
    // "+" prefix appends instead of replacing, so uploading a second photo to a
    // record does not silently discard the first.
    form.append(`+${field}`, new Blob([f.bytes as unknown as BlobPart], { type: f.type }), f.name);
  }
  const res = await fetch(`${config.pocketbaseUrl}/api/collections/${collection}/records/${id}`, {
    method: "PATCH",
    headers: { Authorization: token },
    body: form,
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`PocketBase ${res.status} uploading to ${collection}/${id}: ${detail.slice(0, 300)}`);
  }
  const rec = (await res.json()) as Record<string, unknown>;
  const stored = rec[field];
  return Array.isArray(stored) ? (stored as string[]) : stored ? [String(stored)] : [];
}

/**
 * Stream one stored file back. The caller is responsible for having checked that
 * this user may see the record — this function only knows how to fetch bytes.
 *
 * `transactions` is superuser-only, so its files are not reachable by URL from a
 * browser; the superuser token is what opens them, and it never leaves the
 * server. `thumb` is passed straight to PocketBase, which generates and caches
 * the resize itself — the brief is explicit that thumbnails are not made
 * client-side.
 */
export async function pbFileResponse(
  collection: string,
  recordId: string,
  filename: string,
  opts: { thumb?: string } = {},
): Promise<Response> {
  const token = await getToken();
  const params = new URLSearchParams();
  if (opts.thumb) params.set("thumb", opts.thumb);
  const qs = params.toString();
  return fetch(
    `${config.pocketbaseUrl}/api/files/${collection}/${encodeURIComponent(recordId)}/${encodeURIComponent(filename)}${qs ? `?${qs}` : ""}`,
    { headers: { Authorization: token }, cache: "no-store" },
  );
}

// Escape a value for use inside a PocketBase filter string literal.
export function pbStr(value: string): string {
  return `'${value.replace(/'/g, "\\'")}'`;
}
