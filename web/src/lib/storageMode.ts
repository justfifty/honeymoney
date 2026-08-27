// Where a household's records are allowed to live, and what each answer costs.
//
// "Cloud-optional" was the claim this module exists to make true. It was not
// true before: there was no switch, and nothing that would have honoured one.
//
// ── THE HONEST SHAPE OF THE CHOICE ─────────────────────────────────────────
//
// Local-only is not a free upgrade with a privacy benefit attached. It is a
// trade, and a steep one: the server computes the H-Score, resolves household
// sharing, and answers Ask Honey, and it cannot do any of that over records it
// does not have. A switch presented as pure gain would be a lie by omission,
// and the person who discovers the cost afterwards is the person who trusted
// the switch most.
//
// So COSTS below is not marketing copy that got out of hand. It is rendered
// verbatim in the UI before the choice, stored as a policy version against the
// decision, and repeated in the privacy notice. If a cost is ever removed from
// this list it has to be because the feature genuinely started working, not
// because the list got long.
//
// ── WHY THE SWITCH DELETES ─────────────────────────────────────────────────
//
// Turning the mode on without purging what is already stored would be theatre:
// the records would sit in Singapore exactly as before, under a flag saying
// they should not. The switch is only worth anything if it is destructive, and
// it is only safe to be destructive if the household demonstrably holds a
// current copy first. Both halves are enforced in the API, not here.

export const STORAGE_POLICY_VERSION = "2026-08-27";

export type StorageMode = "cloud" | "local_only";

export const DEFAULT_MODE: StorageMode = "cloud";

export function isStorageMode(v: unknown): v is StorageMode {
  return v === "cloud" || v === "local_only";
}

/**
 * Unrecognised values read as `cloud`.
 *
 * Failing safe here means failing towards KEEPING data. A parse slip that
 * resolved to local_only would put an account into a mode whose entry
 * condition is deletion.
 */
export function coerceMode(v: unknown): StorageMode {
  return isStorageMode(v) ? v : DEFAULT_MODE;
}

export interface ModeSpec {
  key: StorageMode;
  label: string;
  summary: string;
  /** What stops working. Empty for cloud, deliberately long for local-only. */
  costs: string[];
  /** What is gained. Deliberately short — it is one thing, stated plainly. */
  gains: string[];
}

export const MODES: ModeSpec[] = [
  {
    key: "cloud",
    label: "Keep my records on HoneyMoney's server",
    summary:
      "The default. Your records are stored in Singapore, and everything in the app works. We can read them — that is what lets the server compute your score and resolve what your household sees.",
    costs: [],
    gains: [
      "Your Money Health Score, forecasts and shortfall warnings are computed and kept up to date.",
      "Household sharing works: what you choose to share reaches the people you share it with.",
      "Your records are on every device you sign in from.",
      "Ask Honey can answer questions about your money.",
      "If you lose your phone, your records are still there.",
    ],
  },
  {
    key: "local_only",
    label: "Keep my records only on my own devices",
    summary:
      "Your records are deleted from our server and live only on this device and in the file you chose. We hold your account and nothing else. This is a real trade, not a free upgrade — read what stops working.",
    costs: [
      "Your Money Health Score stops updating. The server computes it, and it will no longer have the records to compute it from. You keep the last one, dated.",
      "Forecasts and shortfall warnings stop. Same reason.",
      "Household sharing stops entirely. Nobody in your household can see anything of yours, and you cannot see anything of theirs that depended on your records being here.",
      "Ask Honey stops answering questions about your money.",
      "Your records are on THIS device only. Signing in on a phone as well as a laptop gives you two separate sets, and they do not merge.",
      "If you lose the device and the file you chose, the records are gone. We will not have a copy to restore from — that is the point, and it is not reversible.",
      "Receipt images already uploaded are deleted with everything else.",
    ],
    gains: [
      "We cannot read your records, because we do not have them.",
      "Nothing about your money crosses a border, because nothing about your money leaves your device.",
    ],
  },
];

export function specForMode(m: StorageMode): ModeSpec {
  return MODES.find((s) => s.key === m) ?? MODES[0];
}

/**
 * Is a household's local copy fresh enough to delete the server's?
 *
 * Twenty-four hours. Not "any copy at all", because a six-month-old export is
 * not a copy of what is about to be destroyed; and not "this minute", because
 * clock skew and a slow sync would block a legitimate choice for no gain.
 *
 * The count check matters as much as the age: a copy that holds zero records is
 * a file that exists, not a backup, and it is exactly what an interrupted first
 * sync leaves behind.
 */
export const LOCAL_COPY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface LocalCopyClaim {
  at?: string | null;
  records?: number | null;
}

export function localCopyIsAdequate(
  claim: LocalCopyClaim,
  serverRecords: number,
  now: number = Date.now(),
): { ok: boolean; reason?: string } {
  if (!claim.at) {
    return { ok: false, reason: "You do not have a local copy yet. Save one first." };
  }
  const at = new Date(claim.at).getTime();
  if (!Number.isFinite(at)) {
    return { ok: false, reason: "That local copy has no readable date." };
  }
  if (now - at > LOCAL_COPY_MAX_AGE_MS) {
    return {
      ok: false,
      reason: "Your local copy is over a day old. Save a fresh one before we delete the server's.",
    };
  }
  const held = Number(claim.records) || 0;
  if (serverRecords > 0 && held < serverRecords) {
    return {
      ok: false,
      reason: `Your local copy holds ${held} records but the server has ${serverRecords}. Save a fresh copy first.`,
    };
  }
  return { ok: true };
}
