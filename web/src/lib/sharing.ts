// What each person shares with their household, per data type.
//
// The old model was one boolean on a transaction (lib/attribution.ts), and it
// is kept and still enforced — it answers "may my partner see THIS ROW?". This
// module answers the larger question it could not: which KINDS of thing about
// me are household-visible at all. A household member is not one dial between
// "open book" and "hidden"; they are eight separate decisions, and the honest
// interface is to ask them as eight.
//
// ── DEFAULTS ARE THE WHOLE FEATURE ─────────────────────────────────────────
//
// Two are on. Six are off. That ratio is deliberate and is the answer to the
// question "if this is a shared-money app, why is almost everything private?"
//
// What a household genuinely needs from each other is: what must be paid, and
// what each person put in. Those two make the app work — a couple can run their
// obligations and see that the load is fair. Everything else — the itemised
// transactions, the category breakdown, the receipts, the goals, the score, the
// forecast — is detail ABOUT A PERSON, and a household does not need it to
// function. It is the difference between "we can both see the electricity bill
// is unpaid" and "I can see you spent RM40 at a pharmacy on Tuesday".
//
// Defaulting the second group to ON would be the surveillance product this app
// was built not to be, and — the part that matters more — the person harmed by
// that default is never the one who set the household up.
//
// ── REVOCATION IS RETROACTIVE ──────────────────────────────────────────────
//
// Turning a share off hides the HISTORY too, not just what happens next. It is
// the more surprising of the two possible rules, so it is the one that gets
// written down, stated in the UI at the moment of the change, and repeated in
// the privacy notice.
//
// The alternative — "future data is private, past data stays shared" — is
// indefensible for the case this exists to serve. Someone revoking under
// pressure is revoking BECAUSE of what is already there. A revocation that
// leaves the last two years visible has not protected them from anything.
//
// What revocation cannot do is un-see. A partner who already read a figure
// still knows it, and a record genuinely entered as household money does not
// become private because one person changed a switch. Both limits are stated to
// the user rather than glossed.

export const SHARING_POLICY_VERSION = "2026-08-27";

export type ShareType =
  | "must_pay"
  | "contributed_totals"
  | "categories"
  | "transactions"
  | "goals"
  | "documents"
  | "score"
  | "insights";

export interface ShareSpec {
  key: ShareType;
  /** Short label. The UI prefers the i18n string and falls back to this. */
  label: string;
  /** What the household sees when this is ON. */
  onMeans: string;
  /** What the household sees when OFF — never "nothing", always the truth. */
  offMeans: string;
  /** Default for a member who has never answered. */
  default: boolean;
  /**
   * True where the data type identifies a PERSON rather than describing money
   * the household holds jointly. Decides what earns an access-log entry when
   * another member reads it: a total nobody can attribute is not worth logging,
   * an itemised list is.
   */
  detail: boolean;
}

export const SHARE_SPECS: ShareSpec[] = [
  {
    key: "must_pay",
    label: "Must-pay items",
    onMeans:
      "Your household sees the bills and commitments you have recorded, and whether they are outstanding.",
    offMeans:
      "Your commitments are yours alone. Nobody else can see what is due, so nobody else can cover it for you.",
    default: true,
    detail: false,
  },
  {
    key: "contributed_totals",
    label: "What you contributed",
    onMeans:
      "Your household sees one number: the total you put in this month. Never what it was spent on.",
    offMeans:
      "Your contribution is not attributed to you. Household totals still add up; they just do not say how much of it was yours.",
    default: true,
    detail: false,
  },
  {
    key: "categories",
    label: "Your spending categories",
    onMeans:
      "Your household sees how much you spent per category — groceries, transport, dining — without the individual purchases.",
    offMeans:
      "Your category breakdown is yours. Household totals still include your spending; it is simply not broken down by you.",
    default: false,
    detail: true,
  },
  {
    key: "transactions",
    label: "Your individual transactions",
    onMeans:
      "Your household sees each purchase you record: merchant, amount, date, and any note you attached.",
    offMeans:
      "Your purchases are yours. This is the default, and it is the one most people should leave alone.",
    default: false,
    detail: true,
  },
  {
    key: "goals",
    label: "Your goals",
    onMeans: "Your household sees what you are saving towards and how far along you are.",
    offMeans:
      "Your goals are yours until you decide to say so. Goals the household set together are unaffected.",
    default: false,
    detail: true,
  },
  {
    key: "documents",
    label: "Receipts and statements",
    onMeans:
      "Your household can open the receipt photos and imported statements attached to your records.",
    offMeans:
      "Your documents are yours. A receipt is a photograph of where you were, so this stays off unless you turn it on.",
    default: false,
    detail: true,
  },
  {
    key: "score",
    label: "Your Money Health Score",
    onMeans:
      "Your household sees your personal H-Score, its band, and the five sub-scores behind it.",
    offMeans:
      "Your score is yours. The household score, computed over shared money, is unaffected.",
    default: false,
    detail: true,
  },
  {
    key: "insights",
    label: "Your insights and forecast",
    onMeans:
      "Your household sees the forecasts and Honey insights written about your money — including shortfall warnings.",
    offMeans:
      "Your forecast is yours. A forecast says what you will not be able to afford, which is nobody else's business by default.",
    default: false,
    detail: true,
  },
];

export const SHARE_TYPES: ShareType[] = SHARE_SPECS.map((s) => s.key);

export function specForShare(t: ShareType): ShareSpec | undefined {
  return SHARE_SPECS.find((s) => s.key === t);
}

export function isShareType(v: unknown): v is ShareType {
  return typeof v === "string" && (SHARE_TYPES as string[]).includes(v);
}

/**
 * The default answer sheet — what is true for a member who has never opened the
 * sharing screen.
 *
 * Read this rather than SHARE_SPECS directly, so a data type added to the list
 * later cannot arrive switched on for everybody who has already answered every
 * other question.
 */
export function defaultShares(): Record<ShareType, boolean> {
  return Object.fromEntries(SHARE_SPECS.map((s) => [s.key, s.default])) as Record<
    ShareType,
    boolean
  >;
}

export interface ShareState {
  type: ShareType;
  shared: boolean;
  /** Null ⇒ never answered; the value above is the default, not their decision. */
  at: string | null;
  policyVersion: string | null;
  /** They answered, but under an older description of what sharing means. */
  isStale: boolean;
}

export type ShareMap = Record<ShareType, ShareState>;

export interface ShareRowLike {
  data_type: string;
  shared: boolean;
  policy_version?: string;
  created: string;
}

/**
 * Fold an append-only list of decisions into the current answer sheet.
 *
 * Pure, and kept separate from the database read so that "newest row wins,
 * absence means the default" can be tested without a database. It is the rule
 * every privacy guarantee in this file rests on.
 */
export function foldShareRows(rows: ShareRowLike[]): ShareMap {
  const out = {} as ShareMap;
  for (const spec of SHARE_SPECS) {
    out[spec.key] = {
      type: spec.key,
      shared: spec.default,
      at: null,
      policyVersion: null,
      isStale: false,
    };
  }
  const sorted = [...rows].sort((a, b) => a.created.localeCompare(b.created));
  for (const r of sorted) {
    if (!isShareType(r.data_type)) continue;
    out[r.data_type] = {
      type: r.data_type,
      shared: Boolean(r.shared),
      at: r.created,
      policyVersion: r.policy_version ?? null,
      isStale: (r.policy_version ?? "") !== SHARING_POLICY_VERSION,
    };
  }
  return out;
}

/**
 * Can `viewer` see `subject`'s data of this type?
 *
 * Three rules, and the order matters:
 *
 *   1. You always see your own. Every privacy control here is about privacy
 *      FROM A HOUSEHOLD MEMBER, never from yourself, and a screen that hid a
 *      person's own receipts from them would be a bug wearing a feature's
 *      clothes.
 *   2. Unattributed data — money recorded against the household rather than a
 *      person — is household data. There is nobody to be private from.
 *   3. Otherwise the subject's own switch decides.
 */
export function canSeeShared(
  shares: ShareMap,
  type: ShareType,
  subjectMemberId: string | null | undefined,
  viewerMemberId: string | null | undefined,
): boolean {
  if (!subjectMemberId) return true;
  if (subjectMemberId === viewerMemberId) return true;
  return shares[type]?.shared === true;
}
