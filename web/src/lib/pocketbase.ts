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

/**
 * How long any ONE call to PocketBase may take before it is abandoned.
 *
 * ── WHY THIS HAD TO EXIST ──────────────────────────────────────────────────
 *
 * There was no timeout here at all, and `fetch` does not impose one. That is
 * fine while PocketBase answers in milliseconds on the same host, and it is not
 * fine in the one case that actually happens: the host stops accepting
 * connections without refusing them. A refusal fails in under a second; a
 * blackhole hangs until the operating system gives up, which is tens of
 * seconds, and every server render that touched the ledger hung with it.
 *
 * Measured on 2026-08-31, during a DOM Cloud outage in sgp, against the LANDING
 * PAGE — a route with no household data on it, which reaches PocketBase only
 * for the cached FX table in the root layout:
 *
 *     PocketBase unreachable      10.7 s, every request, consistently
 *     PocketBase answering         0.22 s
 *
 * So an outage on the ledger did not degrade the site, it stopped it — and it
 * did so on pages that do not need a ledger to render.
 *
 * ── WHY 6 SECONDS, AND WHY PER REQUEST ─────────────────────────────────────
 *
 * Per REQUEST, not per operation, which is what makes this safe for
 * `pbListAll`: paging a hundred thousand rows legitimately takes 11 s (see the
 * note below), but it does so as a hundred separate calls of ~100 ms each, and
 * each of those is what is bounded here.
 *
 * 6 s clears the slowest thing a single call is known to do by a wide margin —
 * a cold PocketBase start is a SQLite open, measured at 1.8 s — while turning
 * an unreachable ledger from a hang into an error the page can catch and say
 * something about. Every read path in this app is already wrapped in a
 * try/catch that renders a notice; none of them had a way to reach it.
 */
const PB_TIMEOUT_MS = Number(process.env.POCKETBASE_TIMEOUT_MS ?? 6000);

/**
 * `fetch`, but it always ends. The error names the collection path so a failure
 * says WHICH read gave up, not merely that something did.
 */
/**
 * "The ledger is not answering" — as a type, so a PAGE can tell it apart from
 * every other thing that can go wrong behind a read.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * On 2026-08-31 the DOM Cloud host went down, taking PocketBase with it, and
 * the dashboard told the household: "Almost there — finish setup". Nothing was
 * unfinished. Their data was fine, sitting on a machine that had stopped
 * answering for twenty minutes. That message sends somebody hunting for a
 * settings screen that was never broken, and it is the difference between "the
 * app is having a moment" and "I have lost my records".
 *
 * A page cannot make that distinction from a string, so the distinction has to
 * survive the throw.
 */
export class PocketBaseUnreachable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PocketBaseUnreachable";
  }
}

/** True for the one failure a reader should be reassured about, not alarmed by. */
export function isUnreachable(err: unknown): boolean {
  return err instanceof PocketBaseUnreachable;
}

async function pbTimedFetch(
  url: string,
  init: RequestInit,
  what: string,
  ms: number = PB_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new PocketBaseUnreachable(
        `PocketBase did not answer within ${ms}ms on ${what} — is it running, and is ${config.pocketbaseUrl} reachable?`,
      );
    }
    // DNS, TLS, connection refused, socket reset — the host, not the request.
    // `fetch` reports all of them as a bare TypeError, which is indistinguishable
    // from a programming mistake until you look at the cause; treating them as
    // "unreachable" is right because there is no request the caller could have
    // made that would have worked.
    if (err instanceof TypeError) {
      throw new PocketBaseUnreachable(
        `PocketBase at ${config.pocketbaseUrl} could not be reached on ${what}: ${err.message}`,
      );
    }
    throw err;
  }
}

async function getToken(): Promise<string> {
  if (!isPocketBaseConfigured()) {
    throw new Error(
      "PocketBase is not configured. Set POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD.",
    );
  }
  // superuser tokens last ~2 weeks; refresh well before that
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  const res = await pbTimedFetch(
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
    "auth",
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
  const res = await pbTimedFetch(
    `${config.pocketbaseUrl}${path}`,
    {
      ...init,
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    },
    path,
  );
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
  opts: {
    filter?: string;
    sort?: string;
    expand?: string;
    perPage?: number;
    /**
     * Only these columns, comma-separated — PocketBase's own `?fields=`.
     *
     * Worth having because some reads want ONE column of a wide row. The
     * logging streak on /hscore is the clearest case: it asks for up to a
     * thousand transactions and uses nothing but `occurred_at`, so without this
     * it pulls every amount, note, bucket, attribution and attachment name in
     * the household's month to build a set of "YYYY-MM" strings.
     *
     * Leave it unset when the caller genuinely reads the record — a narrowed
     * read that later grows a field is a silently-undefined property, which is
     * a worse failure than a wide one.
     */
    fields?: string;
  } = {},
): Promise<T[]> {
  const params = new URLSearchParams({ perPage: String(opts.perPage ?? 500), skipTotal: "1" });
  if (opts.filter) params.set("filter", opts.filter);
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.expand) params.set("expand", opts.expand);
  if (opts.fields) params.set("fields", opts.fields);
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
  // A far longer budget than PB_TIMEOUT_MS, and deliberately so: this request
  // carries a receipt photo, and the timeout has to clear the upload rather
  // than the round trip. It is here at all for the same reason as the others —
  // a blackholed host must fail, not hang — and 30 s is well past anything a
  // phone-sized image takes while still being an end.
  const res = await pbTimedFetch(
    `${config.pocketbaseUrl}/api/collections/${collection}/records/${id}`,
    {
      method: "PATCH",
      headers: { Authorization: token },
      body: form,
      cache: "no-store",
    },
    `${collection}/${id} (upload)`,
    30000,
  );
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
  // ⚠️ NO TIMEOUT HERE, and that is not an oversight. This returns a STREAMING
  // response that the caller pipes to the browser, and `AbortSignal.timeout`
  // covers the whole exchange — body included — so any budget generous enough
  // for a large attachment on a slow connection is no longer a useful bound,
  // and any budget tight enough to be a bound would truncate real downloads
  // mid-stream. A hung attachment costs one image; a truncated one costs the
  // reader a file they think they have.
  return fetch(
    `${config.pocketbaseUrl}/api/files/${collection}/${encodeURIComponent(recordId)}/${encodeURIComponent(filename)}${qs ? `?${qs}` : ""}`,
    { headers: { Authorization: token }, cache: "no-store" },
  );
}

// Escape a value for use inside a PocketBase filter string literal.
export function pbStr(value: string): string {
  return `'${value.replace(/'/g, "\\'")}'`;
}
