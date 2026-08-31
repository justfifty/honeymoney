// Did the thing we built actually get used?
//
// ── WHY THIS EXISTS, AND WHY NOW ───────────────────────────────────────────
//
// The pitch deck's traction slide currently reads "User numbers come with the
// pilot". That is honest and it is also the weakest line in the deck, on the
// axis worth 25 marks. The fix is not more features; it is being able to say
// "8 of 10 households were still logging in week 4, median time to first
// expense 2m40s, 6 of them used a private bucket."
//
// RETENTION IS MEASURED FORWARD. A household's first week cannot be
// reconstructed after the fact, so this has to exist before the first pilot
// signup rather than after — which is the entire reason it was built ahead of
// the outreach that needs it.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────
//
// It records six events and four fields. No path, no IP, no country, no
// user-agent, no session replay, no third party. `page_views` already carries
// the traffic shape and this is not that; the narrowness is the privacy design.
// The legal pack promises a sponsor can never receive "identifiable usage data
// — not whether you logged in, not how often, not when you stopped", and the
// cheapest way to keep a promise about a column is not to have the column.
//
// That promise is about SPONSORS, not about us: measuring your own product,
// first-party, in your own database, is what the same document rules in when it
// says "nothing on any page of this app reports to ANYBODY ELSE about you".
// Anything that ever leaves for an employer must still go through
// lib/aggregateDisclosure.ts — MIN_COHORT = 10, and it is not a tuning knob.
//
// ── AND WHY NOTHING HERE CAN BREAK A PAGE ──────────────────────────────────
//
// Every write is fire-and-forget inside `after()`, so it runs once the response
// is already on its way to the reader and cannot add a millisecond to a render
// or fail one. Measurement that degrades the thing it measures is worse than no
// measurement, because it is measurement of a product nobody else would ship.

import { after } from "next/server";
import { pbCreate, pbListAll } from "./pocketbase";
import { isDatabaseConfigured } from "./config";

/**
 * The whole vocabulary. Six, and adding a seventh should require an argument.
 *
 * Six events answer every question a judge asks about activation and
 * retention. Twenty answer none of them and turn a narrow, defensible
 * collection into a behavioural profile — which is the thing this product's
 * entire pitch says it does not build.
 */
export type ProductEvent =
  /** An account was created. The denominator for everything below. */
  | "signup"
  /** This user's FIRST ever record. Activation, and the 3-minute claim. */
  | "first_expense"
  /** Every record after that. Frequency. */
  | "expense_logged"
  /** The user was active at all today — at most one row per user per day. */
  | "session_open"
  /** A private bucket was created: the couple-privacy differentiator, used. */
  | "private_bucket"
  /** Honey's sentence was rendered to somebody. */
  | "insight_viewed";

/** UTC day stamp. One definition, because two would silently split a cohort. */
function today(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

interface EventRow {
  id: string;
  user: string;
  tenant: string;
  event: ProductEvent;
  day: string;
  created: string;
}

/**
 * Record an event, after the response has gone out.
 *
 * Never throws, never blocks, never awaited by a caller. A failed analytics
 * write is not an incident and must never become the reader's problem.
 */
export function record(
  event: ProductEvent,
  userId: string | null | undefined,
  tenantId?: string | null,
): void {
  if (!isDatabaseConfigured() || !userId) return;
  after(async () => {
    try {
      await pbCreate("product_events", {
        user: userId,
        tenant: tenantId ?? "",
        event,
        day: today(),
      });
    } catch {
      // Includes the UNIQUE index rejecting a duplicate daily row, which is the
      // mechanism working rather than an error — see recordOncePerDay.
    }
  });
}

/**
 * Record at most one row per user per day.
 *
 * ⚠️ IT DOES NOT CHECK FIRST. The UNIQUE INDEX on (user, event, day) does the
 * work, and the duplicate insert is expected to fail. Reading before writing is
 * how two requests from the same phone in the same second both find nothing and
 * both insert — and a `session_open` counted twice is a retention figure that
 * is wrong in the flattering direction, which is the worst kind.
 *
 * A PWA resuming on every app switch makes that not a hypothetical race.
 */
const seenToday = new Map<string, string>();

export function recordOncePerDay(
  event: ProductEvent,
  userId: string | null | undefined,
  tenantId?: string | null,
): void {
  if (!userId) return;
  // An in-process memo in FRONT of the index, purely to stop the pointless
  // work. `session_open` is called from a path every authenticated page render
  // goes through, so without this every page view fires a write to Singapore
  // that the unique index then rejects — correct, and wasteful all day.
  //
  // It is a cache, NOT the guarantee. It is per-process, it is empty after a
  // restart, and there are two origins serving this app — so duplicates still
  // reach the database, and the UNIQUE INDEX is still the thing that makes the
  // count right. Removing this map would cost writes; removing the index would
  // cost the truth.
  const key = `${userId}:${event}`;
  const day = today();
  if (seenToday.get(key) === day) return;
  seenToday.set(key, day);
  // Unbounded growth is the obvious failure here. One entry per active user per
  // process is small, but "small" is not "bounded", so it is swept when it gets
  // silly rather than left to grow for the lifetime of the server.
  if (seenToday.size > 5000) {
    for (const [k, v] of seenToday) if (v !== day) seenToday.delete(k);
  }
  record(event, userId, tenantId);
}

/**
 * The user's first record, recorded once and only once — ever.
 *
 * ⚠️ `day` IS THE LITERAL "once", NOT A DATE, and that is the whole mechanism.
 * The unique index is on (user, event, day), so pinning `day` to a constant
 * makes (user, "first_expense") unrepeatable for the lifetime of the account.
 * The real moment is still recorded — `created` is an autodate — so the median
 * time-to-first-expense is computed from a true timestamp; `day` is doing
 * uniqueness here, not calendar work.
 *
 * The first version of this used the user's SIGNUP day instead, which meant
 * every caller had to know it. `SessionUser` does not carry `created`, so that
 * design needed an extra read of the user record on every single save just to
 * find a date it then only used as a uniqueness token. A constant does the same
 * job with no lookup at all.
 */
const FIRST_EVER = "once";

export function recordFirstExpense(
  userId: string | null | undefined,
  tenantId?: string | null,
): void {
  if (!isDatabaseConfigured() || !userId) return;
  after(async () => {
    try {
      await pbCreate("product_events", {
        user: userId,
        tenant: tenantId ?? "",
        event: "first_expense" satisfies ProductEvent,
        day: FIRST_EVER,
      });
    } catch {
      /* already recorded — the index said so */
    }
  });
}

// ── the rollup ──────────────────────────────────────────────────────────────

export interface Funnel {
  /** Accounts created in the window. */
  signups: number;
  /** …of which logged a first expense within 24h. */
  activated: number;
  activationRate: number | null;
  /** Median minutes from signup to first expense. The 3-minute claim, tested. */
  medianMinutesToFirstExpense: number | null;
  /** Signed up ≥7 days ago and active in days 1-7. */
  d7: number;
  d7Cohort: number;
  d7Rate: number | null;
  /** Signed up ≥30 days ago and active in days 8-30. */
  d30: number;
  d30Cohort: number;
  d30Rate: number | null;
  /** Households that made a private bucket — the differentiator, used. */
  privateBucketUsers: number;
  /** Total records logged, all users. */
  expensesLogged: number;
  /** Days with at least one active user, over the window. */
  activeDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const rate = (n: number, d: number): number | null => (d > 0 ? n / d : null);

/**
 * Every figure the traction slide needs, from one read.
 *
 * Deliberately computed here rather than by six separate PocketBase queries:
 * the whole table is one narrow row per event, a pilot is single-digit
 * households, and one `pbListAll` beats six round trips to Singapore. Revisit
 * if this ever holds more than a few hundred thousand rows — at which point the
 * answer is a stored daily rollup, not a cleverer query.
 */
export async function getFunnel(): Promise<Funnel | null> {
  if (!isDatabaseConfigured()) return null;

  const rows = await pbListAll<EventRow>("product_events", { sort: "created" });

  const firstAt = new Map<string, number>();   // user -> signup time
  const firstExpAt = new Map<string, number>(); // user -> first expense time
  const activeDaysBy = new Map<string, Set<string>>(); // user -> days seen
  const privateUsers = new Set<string>();
  const allDays = new Set<string>();
  let expensesLogged = 0;

  for (const r of rows) {
    const t = Date.parse(r.created);
    allDays.add(r.day);
    if (r.event === "signup") firstAt.set(r.user, t);
    if (r.event === "first_expense" && !firstExpAt.has(r.user)) firstExpAt.set(r.user, t);
    if (r.event === "expense_logged") expensesLogged++;
    if (r.event === "private_bucket") privateUsers.add(r.user);
    // ANY event means the person was there. Retention is "did they come back",
    // not "did they come back and log something" — a household that opened the
    // dashboard to look at their buckets was retained.
    if (!activeDaysBy.has(r.user)) activeDaysBy.set(r.user, new Set());
    activeDaysBy.get(r.user)!.add(r.day);
  }

  const now = Date.now();
  const minutesTo: number[] = [];
  let activated = 0;
  let d7 = 0, d7Cohort = 0, d30 = 0, d30Cohort = 0;

  for (const [user, signedAt] of firstAt) {
    const exp = firstExpAt.get(user);
    if (exp !== undefined) {
      const mins = (exp - signedAt) / 60000;
      minutesTo.push(mins);
      if (exp - signedAt <= DAY_MS) activated++;
    }

    const days = activeDaysBy.get(user) ?? new Set<string>();
    const age = now - signedAt;
    const dayOffset = (n: number) => new Date(signedAt + n * DAY_MS).toISOString().slice(0, 10);
    const activeBetween = (lo: number, hi: number) => {
      for (let n = lo; n <= hi; n++) if (days.has(dayOffset(n))) return true;
      return false;
    };

    // ONLY COUNT COHORTS THAT HAVE HAD THE CHANCE. Somebody who signed up
    // yesterday has not failed D7; they have not reached it. Including them
    // would drag the rate down by exactly the number of recent signups, which
    // is to say a growing product would report falling retention.
    if (age >= 7 * DAY_MS) {
      d7Cohort++;
      if (activeBetween(1, 7)) d7++;
    }
    if (age >= 30 * DAY_MS) {
      d30Cohort++;
      if (activeBetween(8, 30)) d30++;
    }
  }

  const signups = firstAt.size;
  return {
    signups,
    activated,
    activationRate: rate(activated, signups),
    medianMinutesToFirstExpense: median(minutesTo),
    d7, d7Cohort, d7Rate: rate(d7, d7Cohort),
    d30, d30Cohort, d30Rate: rate(d30, d30Cohort),
    privateBucketUsers: privateUsers.size,
    expensesLogged,
    activeDays: allDays.size,
  };
}
