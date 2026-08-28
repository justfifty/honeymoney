// Can you sign out? And does refusing to let you ever protect anything real?
//
//   npm run check:signout
//
// ── THE BUG THIS PINS ──────────────────────────────────────────────────────
//
// Sign-out refused whenever the local ledger held any row at all. Since the
// ordinary capture path writes every spend there before sending it, one spend
// was enough to refuse for ever — and the refusal told you to save a copy,
// which does not empty the ledger, so no sequence of actions unblocked it.
// Reported from a shared household browser, which is exactly the device this
// product is for and the one place sign-out has to work.
//
// Nothing was broken about the storage reads. The predicate was wrong. That is
// a defect that reviews fine, needs a populated browser to reproduce, and is
// only caught by asking the rule directly — so this asks the rule directly.

import { assessSignOutRisk } from "../src/lib/localTeardown.ts";

type Row = { origin: "local_only" | "local_first"; syncedAt?: string | null; createdAt: string };

const T = (h: number) => new Date(Date.UTC(2026, 7, 28, h)).toISOString();
const ms = (h: number) => new Date(T(h)).getTime();

const synced = (h: number): Row => ({ origin: "local_first", syncedAt: T(h), createdAt: T(h) });
const unsent = (h: number): Row => ({ origin: "local_first", syncedAt: null, createdAt: T(h) });
const localOnly = (h: number): Row => ({ origin: "local_only", syncedAt: null, createdAt: T(h) });

interface Case {
  name: string;
  rows: Row[];
  savedAt: number;
  queued: number;
  blocked: number;
  unsent: number;
}

const CASES: Case[] = [
  // ── The reported failure ────────────────────────────────────────────────
  {
    name: "one spend, already on the server → sign out freely (THE REPORTED BUG)",
    rows: [synced(9)],
    savedAt: 0,
    queued: 0,
    blocked: 0,
    unsent: 0,
  },
  {
    name: "a year of synced history still blocks nothing",
    rows: Array.from({ length: 400 }, (_, i) => synced(i % 24)),
    savedAt: 0,
    queued: 0,
    blocked: 0,
    unsent: 0,
  },

  // ── What must still be protected ────────────────────────────────────────
  {
    name: "local-only records with no saved copy → refuse",
    rows: [localOnly(9), localOnly(10)],
    savedAt: 0,
    queued: 0,
    blocked: 2,
    unsent: 0,
  },
  {
    name: "local-only records written to the file → refusal lifts",
    rows: [localOnly(9), localOnly(10)],
    savedAt: ms(11),
    queued: 0,
    blocked: 0,
    unsent: 0,
  },
  {
    name: "one recorded AFTER the last save is still uncovered",
    rows: [localOnly(9), localOnly(12)],
    savedAt: ms(11),
    queued: 0,
    blocked: 1,
    unsent: 0,
  },

  // ── Unsent records warn, never refuse ───────────────────────────────────
  {
    name: "unsent capture in the ledger is counted (it used to vanish)",
    rows: [unsent(9)],
    savedAt: 0,
    queued: 0,
    blocked: 0,
    unsent: 1,
  },
  {
    name: "ledger and legacy queue are added, not chosen between",
    rows: [unsent(9), unsent(10)],
    savedAt: 0,
    queued: 3,
    blocked: 0,
    unsent: 5,
  },
  {
    name: "a saved copy does NOT excuse an unsent server-bound record",
    rows: [unsent(9)],
    savedAt: ms(23),
    queued: 0,
    blocked: 0,
    unsent: 1,
  },

  // ── Mixtures, which is what a real device looks like ────────────────────
  {
    name: "synced + unsent + covered local-only",
    rows: [synced(1), synced(2), unsent(3), localOnly(4)],
    savedAt: ms(5),
    queued: 0,
    blocked: 0,
    unsent: 1,
  },
  {
    name: "empty device",
    rows: [],
    savedAt: 0,
    queued: 0,
    blocked: 0,
    unsent: 0,
  },
];

let failed = 0;
for (const c of CASES) {
  const r = assessSignOutRisk(c.rows, c.savedAt, c.queued);
  const ok = r.blocked === c.blocked && r.unsent === c.unsent;
  if (!ok) failed++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"}  ${c.name}\n` +
      (ok ? "" : `        expected blocked=${c.blocked} unsent=${c.unsent}, got blocked=${r.blocked} unsent=${r.unsent}\n`),
  );
}

// The invariant behind every case above, stated once so it cannot rot: a record
// the server has acknowledged is never a reason to refuse anything.
const acknowledgedOnly = Array.from({ length: 50 }, (_, i) => synced(i % 24));
const r = assessSignOutRisk(acknowledgedOnly, 0, 0);
if (r.blocked !== 0 || r.unsent !== 0) {
  failed++;
  console.log("  FAIL  INVARIANT: acknowledged records must never block or warn");
}

console.log(
  failed === 0
    ? `\n✅ sign-out: ${CASES.length} cases + 1 invariant pass.\n`
    : `\n❌ sign-out: ${failed} failing.\n`,
);
process.exit(failed === 0 ? 0 : 1);
