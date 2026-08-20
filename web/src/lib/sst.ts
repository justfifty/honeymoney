// Malaysian SST — validating the tax breakdown a receipt claims.
//
// Malaysia repealed GST in 2018 and returned to SST, so a receipt printing "GST"
// in 2026 is either a very old receipt or a misread. Getting this wrong is not
// cosmetic: mislabelling the 10% service charge as tax breaks the arithmetic on
// most restaurant receipts, and a total that doesn't reconcile is a total the
// user has to re-key by hand.
//
// Rates in force (verify against the Royal Malaysian Customs schedules before
// quoting these to anyone — they move with the budget):
//   Sales tax   5% or 10%, by goods classification
//   Service tax 6% or 8% — 8% is the standard rate since 1 March 2024, with 6%
//               retained for F&B, telecommunications, logistics and parking
//   Service charge — typically 10%, NOT a tax. It is the establishment's own
//               charge, it is taxed itself, and it belongs to the merchant.
//
// The order on a Malaysian restaurant bill is:
//   subtotal → + service charge → + service tax on (subtotal + service charge)
//            → ± rounding → total

export const SALES_TAX_RATES = [0.05, 0.1] as const;
export const SERVICE_TAX_RATES = [0.06, 0.08] as const;
export const SERVICE_TAX_STANDARD = 0.08;
/** Categories that kept 6% when the standard rate rose to 8% in March 2024. */
export const SERVICE_TAX_PROTECTED = 0.06;
export const PROTECTED_CATEGORIES = ["f&b", "telco", "logistics", "parking"] as const;
export const TYPICAL_SERVICE_CHARGE = 0.1;

/** Cash rounding: Malaysia rounds to the nearest 5 sen. */
export const ROUNDING_STEP = 0.05;

export interface TaxBreakdown {
  subtotal: number;
  serviceCharge: number;
  tax: number;
  total: number;
}

export type TaxFlagCode =
  | "gst_anachronism"
  | "total_mismatch"
  | "service_charge_as_tax"
  | "unknown_tax_rate"
  | "service_charge_unusual"
  | "no_breakdown";

export interface TaxFlag {
  code: TaxFlagCode;
  /** i18n key for the human explanation. */
  messageKey: string;
  vars: Record<string, string | number>;
  /** "warn" still commits; "check" asks the user to look before confirming. */
  severity: "warn" | "check";
}

export interface TaxAssessment {
  flags: TaxFlag[];
  /** Implied service-charge rate, when both it and the subtotal are printed. */
  serviceChargeRate: number | null;
  /** Implied tax rate against the correct base (subtotal + service charge). */
  taxRate: number | null;
  /** Does subtotal + serviceCharge + tax reconcile to total, within rounding? */
  reconciles: boolean;
  /** Rounding adjustment implied by the printed figures. */
  roundingDelta: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/** Is `rate` one of `allowed`, within half a percentage point? */
function matchesRate(rate: number, allowed: readonly number[]): boolean {
  return allowed.some((r) => near(rate, r, 0.005));
}

/** Categories billed as a SERVICE (service tax), rather than goods (sales tax). */
const SERVICE_CATEGORY_HINTS = [
  ...PROTECTED_CATEGORIES,
  "restaurant",
  "cafe",
  "food",
  "dining",
  "hotel",
  "salon",
  "repair",
  "consultancy",
  "insurance",
];

export function isServiceCategory(category?: string): boolean {
  const c = (category ?? "").toLowerCase();
  return c !== "" && SERVICE_CATEGORY_HINTS.some((h) => c.includes(h));
}

/**
 * The tax rates that could legitimately appear, given what was sold. An unknown
 * category leaves both schedules open — better to accept a real rate we can't
 * classify than to badger the user about a correct receipt.
 */
export function plausibleRates(category?: string): readonly number[] {
  if (isServiceCategory(category)) return SERVICE_TAX_RATES;
  return [...SALES_TAX_RATES, ...SERVICE_TAX_RATES];
}

/**
 * Check a parsed breakdown against how Malaysian receipts actually add up.
 *
 * This never rewrites the numbers — it reports. The user confirms the draft, so
 * the honest move is to show them what looks wrong and let them decide, not to
 * silently "fix" a figure the merchant actually printed.
 */
export function assessTax(
  b: TaxBreakdown,
  opts: { rawText?: string; category?: string } = {},
): TaxAssessment {
  const flags: TaxFlag[] = [];
  const { subtotal, serviceCharge, tax, total } = b;

  // A receipt printing GST after 2018 is a misread far more often than it's a
  // genuine antique, so surface it rather than recording a tax that no longer
  // exists.
  if (opts.rawText && /\bGST\b/i.test(opts.rawText) && !/\bSST\b/i.test(opts.rawText)) {
    flags.push({
      code: "gst_anachronism",
      messageKey: "tax.flag.gst",
      vars: {},
      severity: "check",
    });
  }

  if (subtotal <= 0 && serviceCharge <= 0 && tax <= 0) {
    return {
      flags: [
        ...flags,
        { code: "no_breakdown", messageKey: "tax.flag.noBreakdown", vars: {}, severity: "warn" },
      ],
      serviceChargeRate: null,
      taxRate: null,
      // Nothing to reconcile is not the same as failing to reconcile.
      reconciles: true,
      roundingDelta: 0,
    };
  }

  const serviceChargeRate = subtotal > 0 && serviceCharge > 0 ? serviceCharge / subtotal : null;

  // Service tax is charged on the subtotal PLUS the service charge — computing
  // it against the bare subtotal overstates the implied rate by ~10% and makes
  // a correct 8% receipt look like an unknown 8.8% one.
  const taxBase = subtotal + serviceCharge;
  const taxRate = taxBase > 0 && tax > 0 ? tax / taxBase : null;

  const computed = round2(subtotal + serviceCharge + tax);
  const roundingDelta = round2(total - computed);
  // Allow 5-sen cash rounding, plus a sen of float slack.
  const reconciles = total > 0 ? Math.abs(roundingDelta) <= ROUNDING_STEP + 0.011 : true;

  if (!reconciles) {
    flags.push({
      code: "total_mismatch",
      messageKey: "tax.flag.mismatch",
      vars: { computed: computed.toFixed(2), printed: total.toFixed(2) },
      severity: "check",
    });
  }

  if (serviceChargeRate !== null && !near(serviceChargeRate, TYPICAL_SERVICE_CHARGE, 0.02)) {
    flags.push({
      code: "service_charge_unusual",
      messageKey: "tax.flag.serviceChargeRate",
      vars: { pct: (serviceChargeRate * 100).toFixed(1) },
      severity: "warn",
    });
  }

  if (taxRate !== null) {
    // Which rates are even plausible depends on what was sold. A restaurant
    // charges SERVICE tax (6/8%) and never sales tax, so a 10% line on an F&B
    // bill is the service charge in the wrong field — while the same 10% on a
    // hardware receipt is a perfectly ordinary sales tax. Without the category
    // both readings stay open and we only flag genuinely impossible rates.
    const allowed = plausibleRates(opts.category);
    if (!matchesRate(taxRate, allowed)) {
      const looksLikeServiceCharge =
        near(taxRate, TYPICAL_SERVICE_CHARGE, 0.01) &&
        serviceCharge === 0 &&
        (isServiceCategory(opts.category) || /service\s*charge/i.test(opts.rawText ?? ""));

      if (looksLikeServiceCharge) {
        flags.push({
          code: "service_charge_as_tax",
          messageKey: "tax.flag.serviceChargeAsTax",
          vars: {},
          severity: "check",
        });
      } else {
        flags.push({
          code: "unknown_tax_rate",
          messageKey: "tax.flag.unknownRate",
          vars: { pct: (taxRate * 100).toFixed(1) },
          severity: "check",
        });
      }
    }
  }

  return { flags, serviceChargeRate, taxRate, reconciles, roundingDelta };
}

/** The service-tax rate that should apply to a category. */
export function expectedServiceTaxRate(category?: string): number {
  const c = (category ?? "").toLowerCase();
  return PROTECTED_CATEGORIES.some((p) => c.includes(p)) ? SERVICE_TAX_PROTECTED : SERVICE_TAX_STANDARD;
}

/** Build a restaurant-style bill from a subtotal — used by tests and the demo. */
export function buildBill(
  subtotal: number,
  opts: { serviceChargeRate?: number; taxRate?: number } = {},
): TaxBreakdown {
  const scRate = opts.serviceChargeRate ?? TYPICAL_SERVICE_CHARGE;
  const taxRate = opts.taxRate ?? SERVICE_TAX_PROTECTED;
  const serviceCharge = round2(subtotal * scRate);
  const tax = round2((subtotal + serviceCharge) * taxRate);
  const raw = subtotal + serviceCharge + tax;
  // Malaysian cash rounding to the nearest 5 sen.
  const total = round2(Math.round(raw / ROUNDING_STEP) * ROUNDING_STEP);
  return { subtotal: round2(subtotal), serviceCharge, tax, total };
}
