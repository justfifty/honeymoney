import { config } from "@/lib/config";

// Forgotten-password flow, on top of PocketBase's own two calls.
//
// ── THE SHAPE, AND WHY IT IS THIS SHAPE ────────────────────────────────────
//
//   1. /forgot-password   email  →  POST request-password-reset
//      PocketBase emails a one-time token. It answers 204 whether or not the
//      address exists, and so do we: a login page that says "no account with
//      that email" is a directory of who uses the product.
//   2. the email's link   →  /reset-password?token=…
//      The link is whatever the auth collection's resetPasswordTemplate says.
//      Out of the box that is PocketBase's own admin-UI page; the migration in
//      pb_migrations/…_password_reset_link.js points it at the app's page, so
//      a household never sees a screen that is not HoneyMoney.
//   3. /reset-password    token + new password  →  POST confirm-password-reset
//      Consumes the token. It is valid for the collection's
//      passwordResetToken duration — 30 minutes unless changed.
//
// Neither call needs a signed-in session or a superuser, which is the point:
// the person has no credentials, that is why they are here.

export class PasswordResetError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "PasswordResetError";
  }
}

const COLLECTION = "app_users";

/**
 * Ask PocketBase to email a reset link. Resolves for a known and an unknown
 * address alike — the caller must not be able to tell them apart either.
 * Throws PasswordResetError(503) only when PocketBase itself cannot be reached.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${config.pocketbaseUrl}/api/collections/${COLLECTION}/request-password-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
    });
  } catch {
    throw new PasswordResetError("The ledger is unreachable right now. Please try again in a minute.", 503);
  }
  // 204: sent (or silently not, for an unknown address). 400: PocketBase did
  // not like the address — which for an ill-formed one is fine to swallow,
  // because the page has already said "if an account exists". Anything 5xx is
  // PocketBase in trouble, and that the person should be told.
  if (res.status >= 500) {
    throw new PasswordResetError("The ledger is unreachable right now. Please try again in a minute.", 503);
  }
}

/**
 * Consume a reset token and set the new password. The token is the only
 * proof of identity here, so its rejection is the one error worth wording.
 */
export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${config.pocketbaseUrl}/api/collections/${COLLECTION}/confirm-password-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password, passwordConfirm: password }),
      cache: "no-store",
    });
  } catch {
    throw new PasswordResetError("The ledger is unreachable right now. Please try again in a minute.", 503);
  }
  if (res.status === 204 || res.ok) return;
  if (res.status >= 500) {
    throw new PasswordResetError("The ledger is unreachable right now. Please try again in a minute.", 503);
  }
  // 400 from PocketBase covers an expired, already-used or forged token, and a
  // password its rules refuse. Read the body for the second case so a real
  // validation message is not replaced by a wrong one about the link.
  let detail = "";
  try {
    const body = (await res.json()) as { data?: Record<string, { message?: string }> };
    detail = body?.data?.password?.message ?? "";
  } catch {
    /* no body, or not JSON */
  }
  if (detail) throw new PasswordResetError(detail, 400);
  throw new PasswordResetError(
    "This reset link is invalid or has expired. Request a new one from the login page.",
    400,
  );
}

// ── A SMALL, HONEST RATE LIMIT ─────────────────────────────────────────────
//
// request-password-reset sends an email on every call, to any address. Left
// open, it is a way to make HoneyMoney spam somebody, and a way to burn the
// day's Brevo quota (300, per docs/EMAIL_SETUP.md) in under a minute.
//
// In-memory and per-process, deliberately. Both origins run exactly one Node
// process (Passenger on DOM Cloud; `next start` on the laptop), so a Map is
// the whole store, and a limit that resets when the process does is fine: the
// aim is to blunt a loop, not to be a ledger.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

/** True if `key` may make another request now; records the attempt if so. */
export function allowResetRequest(key: string, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const since = now - WINDOW_MS;
  const recent = (hits.get(key) ?? []).filter((t) => t > since);
  if (recent.length >= MAX_PER_WINDOW) {
    const retryAfterSec = Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000));
    hits.set(key, recent);
    return { ok: false, retryAfterSec };
  }
  recent.push(now);
  hits.set(key, recent);
  // Keep the map from growing with every address ever tried.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => t > since)) hits.delete(k);
  }
  return { ok: true, retryAfterSec: 0 };
}
