// Purpose-limited consent, read and written as a ledger.
//
// The shape of this module is set by one rule in Malaysia's PDPA: consent is
// valid only for the purposes the person was actually shown, at the time they
// were shown them. So nothing here asks "is marketing on?" — every question is
// "what is the newest answer this user gave for THIS purpose, and under which
// notice?".
//
// See pocketbase/pb_migrations/1751900023_consents.js for why the store is
// append-only. The short version: withdrawal has to be evidence, not silence.

import { pbList, pbCreate, pbStr } from "./pocketbase";

/**
 * Bumped whenever docs/PRIVACY.md changes MATERIALLY — new purpose, new class
 * of recipient, new retention period. Cosmetic edits do not bump it.
 *
 * Bumping deliberately does NOT invalidate existing consent on its own: that
 * would silently switch off a household's AI on the morning we fixed a typo.
 * What it does is make staleness *visible* — `isStale` below — so the UI can
 * re-ask for the purposes that actually changed instead of pretending old
 * consent covers new processing.
 */
export const NOTICE_VERSION = "2026-08-24";

export type Purpose =
  | "core_processing"
  | "ai_processing"
  | "partner_offers"
  | "research_aggregate";

export interface PurposeSpec {
  key: Purpose;
  /** i18n key for the checkbox label. */
  labelKey: string;
  /** i18n key for the one-line explanation under it. */
  helpKey: string;
  /**
   * Required purposes are a condition of having an account, not a choice
   * dressed up as one. Presenting "you may decline, but then nothing works" as
   * a tickbox is the pattern regulators call forced consent, so the UI states
   * it as a term instead and records the agreement.
   */
  required: boolean;
  /** What the box is set to before the user touches it. Opt-in means false. */
  default: boolean;
  /**
   * True where withdrawing must take effect immediately and permanently — the
   * PDPA s.43 direct-marketing right. Kept as data so the withdrawal path
   * cannot be forgotten when a purpose is added.
   */
  directMarketing: boolean;
}

export const PURPOSES: PurposeSpec[] = [
  {
    key: "core_processing",
    labelKey: "consent.core.label",
    helpKey: "consent.core.help",
    required: true,
    default: true,
    directMarketing: false,
  },
  {
    key: "ai_processing",
    labelKey: "consent.ai.label",
    helpKey: "consent.ai.help",
    required: false,
    default: false,
    directMarketing: false,
  },
  {
    // OFF by default, and it stays off until someone deliberately turns it on.
    // This is the purpose the business model is built on, which is exactly why
    // it gets the strictest treatment rather than the most convenient one.
    key: "partner_offers",
    labelKey: "consent.partner.label",
    helpKey: "consent.partner.help",
    required: false,
    default: false,
    directMarketing: true,
  },
  {
    key: "research_aggregate",
    labelKey: "consent.research.label",
    helpKey: "consent.research.help",
    required: false,
    default: false,
    directMarketing: false,
  },
];

/**
 * Whether the app ASKS for partner_offers at all.
 *
 * OFF, and this is a legal switch rather than a product one. Disclosing a
 * spending tier to a financial partner is what drags HoneyMoney from "an app
 * that holds personal data" into three regimes it is not ready for: the
 * Disclosure Principle, the s.43 direct-marketing right, and -- the expensive
 * one -- whether introducing financial products needs a BNM or SC licence,
 * which is criminal exposure rather than administrative.
 *
 * None of that is a reason to delete the code. The purpose, the ledger and the
 * withdrawal path all stay built and tested; they are simply not offered. When
 * counsel has cleared the licensing question and a licensed partner has papered
 * the arrangement, this becomes true and the whole path lights up.
 *
 * Turning it on WITHOUT that clearance is the single most dangerous edit in
 * this repository.
 */
export const PARTNER_OFFERS_ENABLED = false;

/**
 * The purposes actually offered to a user right now.
 *
 * Everything user-facing reads THIS, never PURPOSES: the signup form, the
 * settings screen, and the consent API all agree by construction, so a purpose
 * cannot be quietly askable on one screen and hidden on another.
 */
export const OFFERED_PURPOSES = PURPOSES.filter(
  (p) => p.key !== "partner_offers" || PARTNER_OFFERS_ENABLED,
);

export function isOffered(purpose: Purpose): boolean {
  return OFFERED_PURPOSES.some((p) => p.key === purpose);
}

export const PURPOSE_KEYS = PURPOSES.map((p) => p.key);
export const OPTIONAL_PURPOSES = PURPOSES.filter((p) => !p.required);

export function specFor(purpose: Purpose): PurposeSpec | undefined {
  return PURPOSES.find((p) => p.key === purpose);
}

export function isPurpose(v: unknown): v is Purpose {
  return typeof v === "string" && PURPOSE_KEYS.includes(v as Purpose);
}

export type ConsentSource = "signup" | "settings" | "withdrawal" | "import";

interface ConsentRow {
  id: string;
  user: string;
  tenant?: string;
  purpose: Purpose;
  granted: boolean;
  notice_version: string;
  source?: ConsentSource;
  created: string;
}

export interface ConsentState {
  purpose: Purpose;
  granted: boolean;
  noticeVersion: string;
  at: string;
  /** The person agreed, but under an older notice than the one now in force. */
  isStale: boolean;
}

/** Nothing recorded yet — not the same as a recorded "no", and shown as such. */
export type ConsentMap = Partial<Record<Purpose, ConsentState>>;

/**
 * The current answer for every purpose: newest row wins.
 *
 * One query, sorted, folded in memory rather than four queries with a limit —
 * a household has a handful of these rows, and the fold keeps the "newest row
 * wins" rule in one readable place instead of spread across four filters.
 */
export async function getConsents(userId: string): Promise<ConsentMap> {
  const rows = await pbList<ConsentRow>("consents", {
    filter: `user = ${pbStr(userId)}`,
    sort: "created",
    perPage: 500,
  });
  const out: ConsentMap = {};
  for (const r of rows) {
    if (!isPurpose(r.purpose)) continue;
    // Ascending sort, so a later row simply overwrites an earlier one.
    out[r.purpose] = {
      purpose: r.purpose,
      granted: Boolean(r.granted),
      noticeVersion: r.notice_version,
      at: r.created,
      isStale: r.notice_version !== NOTICE_VERSION,
    };
  }
  return out;
}

/**
 * Has this user agreed to this purpose RIGHT NOW?
 *
 * Absence is "no". That is the whole point of opt-in: a purpose with no record
 * has never been agreed to, and defaulting it to true would make the ledger
 * decorative.
 */
export async function hasConsent(userId: string, purpose: Purpose): Promise<boolean> {
  const map = await getConsents(userId);
  return map[purpose]?.granted === true;
}

/**
 * Append one answer.
 *
 * Deliberately does not check what the previous answer was: re-affirming under
 * a new notice version is a real event worth recording, and de-duplicating it
 * would lose the evidence that we re-asked.
 */
export async function recordConsent(input: {
  userId: string;
  tenantId?: string;
  purpose: Purpose;
  granted: boolean;
  source: ConsentSource;
}): Promise<void> {
  await pbCreate("consents", {
    user: input.userId,
    tenant: input.tenantId ?? "",
    purpose: input.purpose,
    granted: input.granted,
    notice_version: NOTICE_VERSION,
    source: input.source,
  });
}

/**
 * Write the whole answer sheet at sign-up.
 *
 * Every purpose gets a row, including the declined ones. A declined purpose
 * with no row is indistinguishable from a purpose we never asked about, and
 * "we asked and they said no" is the more useful fact to be able to prove.
 */
export async function recordSignupConsents(input: {
  userId: string;
  tenantId?: string;
  answers: Partial<Record<Purpose, boolean>>;
}): Promise<void> {
  // Only the purposes we actually offered. A consent row for something the
  // user was never shown is not evidence of anything.
  for (const spec of OFFERED_PURPOSES) {
    const granted = spec.required ? true : input.answers[spec.key] === true;
    await recordConsent({
      userId: input.userId,
      tenantId: input.tenantId,
      purpose: spec.key,
      granted,
      source: "signup",
    });
  }
}
