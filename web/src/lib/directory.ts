// Product directory — a catalogue, not a recommendation engine.
//
// The distinction is the whole compliance position, so it is enforced in the
// data model rather than left to UI discipline:
//
//   • Listings carry NO score, rank, rating or "best for" field. There is
//     nowhere to put one, so nothing downstream can sort by merit.
//   • getListings() never accepts a band, a score, or a household id. A
//     score-gated directory is a recommendation with extra steps, and it would
//     make HoneyMoney an unlicensed adviser.
//   • Every listing names its regulator and licence so a user can verify it
//     against the BNM FSP directory or the SC public register themselves.
//   • Revenue is a flat listing or referral fee — never commission tied to a
//     score tier. Tying income to the score would corrupt the score.
//
// Goals route INTO a category page (see the H-Score tab); the directory is never
// pushed at a user who didn't ask for it.

export type Regulator = "BNM" | "SC" | "PIDM" | "none";

/** Sort orders a user may choose. Deliberately no "recommended" or "best". */
export type SortOrder = "alphabetical" | "provider";

export interface CategoryDef {
  key: string;
  /** i18n key for the category name. */
  labelKey: string;
  /** The weakest sub-score that routes a goal here. */
  addresses: "savingsRate" | "essentialBurden" | "debtService" | "emergencyBuffer" | "personalCap";
}

/**
 * Categories a goal can open. Each maps to the sub-score it addresses, so the
 * route from "your buffer is thin" to "here are deposit accounts" is explicit
 * and inspectable rather than an opaque match.
 */
export const CATEGORIES: CategoryDef[] = [
  { key: "deposits", labelKey: "dir.cat.deposits", addresses: "emergencyBuffer" },
  { key: "savings", labelKey: "dir.cat.savings", addresses: "savingsRate" },
  { key: "unitTrust", labelKey: "dir.cat.unitTrust", addresses: "savingsRate" },
  { key: "debtHelp", labelKey: "dir.cat.debtHelp", addresses: "debtService" },
  { key: "takaful", labelKey: "dir.cat.takaful", addresses: "essentialBurden" },
  // Deliberately no category for personalCap: staying inside your own
  // cap is a habit, and there is no product that sells it to you. The goal
  // still shows on the H-Score tab; it just has nowhere to route, which is
  // the honest outcome rather than a manufactured one.
];

export interface Listing {
  id: string;
  category: string;
  provider: string;
  /** i18n key for the plain description of what the product IS. No claims. */
  descKey: string;
  regulator: Regulator;
  /** Licence or registration reference the user can look up themselves. */
  licenceRef: string;
  url: string;
  /** How this listing is paid for — surfaced in the UI, never hidden. */
  commercial: "unpaid" | "listing_fee" | "referral_fee";
}

/**
 * The catalogue. Alphabetical by provider in source order too, so that even a
 * careless render is unranked.
 *
 * AGENSI KAUNSELING DAN PENGURUSAN KREDIT (AKPK) is BNM's own free counselling
 * agency — it belongs at the top of any debt category and takes no fee, which is
 * exactly why the directory must not sort by what pays.
 */
export const LISTINGS: Listing[] = [
  {
    id: "akpk-dms",
    category: "debtHelp",
    provider: "AKPK",
    descKey: "dir.l.akpk",
    regulator: "BNM",
    licenceRef: "Agency established by Bank Negara Malaysia",
    url: "https://www.akpk.org.my",
    commercial: "unpaid",
  },
  {
    id: "asnb-fixed",
    category: "unitTrust",
    provider: "ASNB",
    descKey: "dir.l.asnb",
    regulator: "SC",
    licenceRef: "Amanah Saham Nasional Berhad — SC-registered UTMC",
    url: "https://www.asnb.com.my",
    commercial: "unpaid",
  },
  {
    id: "bsn-savings",
    category: "deposits",
    provider: "Bank Simpanan Nasional",
    descKey: "dir.l.bsn",
    regulator: "PIDM",
    licenceRef: "Government-owned savings bank; deposits protected by PIDM",
    url: "https://www.bsn.com.my",
    commercial: "unpaid",
  },
  {
    id: "etiqa-takaful",
    category: "takaful",
    provider: "Etiqa Takaful",
    descKey: "dir.l.takafulOperator",
    regulator: "BNM",
    licenceRef: "Licensed takaful operator under the Islamic Financial Services Act 2013",
    url: "https://www.etiqa.com.my",
    commercial: "unpaid",
  },
  {
    id: "ppa-prs",
    category: "savings",
    provider: "Private Pension Administrator Malaysia",
    descKey: "dir.l.ppa",
    regulator: "SC",
    licenceRef: "PPA — approved by the Securities Commission to administer the PRS",
    url: "https://www.ppa.my",
    commercial: "unpaid",
  },
  {
    id: "prubsn-takaful",
    category: "takaful",
    provider: "Prudential BSN Takaful",
    descKey: "dir.l.takafulOperator",
    regulator: "BNM",
    licenceRef: "Licensed takaful operator under the Islamic Financial Services Act 2013",
    url: "https://www.prubsn.com.my",
    commercial: "unpaid",
  },
  {
    id: "takaful-malaysia",
    category: "takaful",
    provider: "Syarikat Takaful Malaysia Keluarga",
    descKey: "dir.l.takafulOperator",
    regulator: "BNM",
    licenceRef: "Licensed takaful operator under the Islamic Financial Services Act 2013",
    url: "https://www.takaful-malaysia.com.my",
    commercial: "unpaid",
  },
  {
    id: "epf-i-saraan",
    category: "savings",
    provider: "KWSP / EPF",
    descKey: "dir.l.epf",
    regulator: "none",
    licenceRef: "Statutory body under the EPF Act 1991",
    url: "https://www.kwsp.gov.my",
    commercial: "unpaid",
  },
  {
    id: "pidm-deposit",
    category: "deposits",
    provider: "PIDM member banks",
    descKey: "dir.l.pidm",
    regulator: "PIDM",
    licenceRef: "Deposits protected up to RM250,000 per depositor per member bank",
    url: "https://www.pidm.gov.my",
    commercial: "unpaid",
  },
];

/** Vouchers and merchant deals. Kept structurally apart from money products. */
export interface Voucher {
  id: string;
  merchant: string;
  descKey: string;
  url: string;
  commercial: "listing_fee" | "referral_fee";
}

export const VOUCHERS: Voucher[] = [];

/**
 * Listings in a category.
 *
 * The signature is the guarantee: no score, no band, no household. There is no
 * way to call this function that would let the score influence what comes back.
 */
export function getListings(category: string, sort: SortOrder = "alphabetical"): Listing[] {
  const rows = LISTINGS.filter((l) => l.category === category);
  const key = sort === "provider" ? (l: Listing) => l.provider : (l: Listing) => l.provider;
  return [...rows].sort((a, b) => key(a).localeCompare(key(b)));
}

/** The category that addresses a given sub-score — how a goal opens a page. */
export function categoryFor(subScore: CategoryDef["addresses"]): CategoryDef | null {
  return CATEGORIES.find((c) => c.addresses === subScore) ?? null;
}

/** Shown on every directory page. Not dismissible, not collapsed. */
export const DISCLAIMER_KEY = "dir.disclaimer";
export const REGISTRY_LINKS = [
  { labelKey: "dir.registry.bnm", url: "https://www.bnm.gov.my/regulations/fsp-directory" },
  { labelKey: "dir.registry.sc", url: "https://www.sc.com.my/regulation/licensing-and-registration" },
];
