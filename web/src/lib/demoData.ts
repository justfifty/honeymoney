// The public demo's dataset — four households, a year of ledger each.
//
// Everything here is generated, pure and dependency-free so /demo can run with
// no login, no PocketBase and no network: the whole thing is built in the
// browser's memory on first render. Edits in the demo are session-local and die
// on reload, which is what makes a public, unauthenticated, zero-abuse-surface
// demo possible at all — there is no shared server state for a visitor to
// vandalise for the next visitor, and it still works on a conference wifi that
// has fallen over.
//
// The four households exist to put every score band on screen without a toggle:
//
//   family      → Building    a real squeeze: thin savings, heavy must-paid
//   couple      → Steady      coping, with the buffer still short
//   individual  → Strong      one earner, disciplined, buffer building
//   thriving    → Thriving    the top band, so it isn't a theoretical state
//
// The figures are Malaysian and deliberately ordinary — Lotus's and 99
// Speedmart, PTPTN, a Perodua loan, Astro, road tax once a year, and a Raya
// month that costs visibly more than the eleven around it.
//
// Determinism matters twice over: a demo that shuffles on reload can't be
// pitched from, and a seeded generator means the screenshots in the deck match
// what a judge sees when they open the link. No Math.random() anywhere.

import {
  computeHScore,
  assessConfidence,
  applyHysteresis,
  bandFor,
  MIN_TXNS_30D,
  type Band,
  type HScore,
  type ScoreInputs,
} from "./hscore";

export type PersonaKey = "individual" | "couple" | "family" | "thriving";

export interface DemoContributor {
  id: string;
  name: string;
  /** Rendered as the avatar chip on a ledger row. */
  initial: string;
}

export interface DemoBucket {
  id: string;
  label: string;
  /** 1 = must-paid · 2 = savings · 3 = spendings (3 may be private). */
  tier: 1 | 2 | 3;
  private?: boolean;
  /** The household's OWN cap. Only tier 3 carries one; it drives privacy discipline. */
  cap?: number;
  /** Whose personal bucket this is, for the couple/family privacy story. */
  ownerId?: string;
}

export type CaptureSource = "text" | "voice" | "receipt" | "statement";

export interface DemoTxn {
  id: string;
  /** ISO date, local midnight-ish. */
  date: string;
  amount: number;
  vendor: string;
  bucketId: string;
  /** Who logged it. null = the household, not a person. */
  contributorId: string | null;
  /** Flagged during capture; annual items are amortised by the score. */
  recurrence?: "annual" | "monthly" | null;
  source: CaptureSource;
}

export interface DemoPersona {
  key: PersonaKey;
  /** i18n key for the household's display name. */
  nameKey: string;
  /** i18n key for the one-line description under the switcher. */
  blurbKey: string;
  emoji: string;
  contributors: DemoContributor[];
  buckets: DemoBucket[];
  grossMonthly: number;
  netMonthly: number;
  /** A stock, not a flow — what is actually liquid today. */
  liquidSavings: number;
  ledger: DemoTxn[];
  /** The band this household is built to sit in. Asserted by the demo tests. */
  targetBand: Band;
}

// ── deterministic noise ─────────────────────────────────────────────────────
// mulberry32: tiny, fast, and identical on every machine — which is the only
// property that matters here. Seeded per persona so the four households vary
// independently, and re-seeded from a stable string so a redeploy doesn't
// reshuffle a screenshot in the deck.

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Jitter a figure by ±pct, deterministically. Keeps two decimals. */
const jitter = (rnd: () => number, base: number, pct: number) =>
  Math.round(base * (1 + (rnd() * 2 - 1) * pct) * 100) / 100;

// ── the calendar ────────────────────────────────────────────────────────────

const MONTHS_OF_HISTORY = 12;

/** Hari Raya Aidilfitri moves ~11 days earlier each year; 2026 falls in March. */
const RAYA_MONTH = 2; // 0-indexed

function iso(y: number, m: number, d: number, hour = 12): string {
  const days = new Date(y, m + 1, 0).getDate();
  const day = Math.min(d, days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m + 1)}-${pad(day)}T${pad(hour)}:00:00`;
}

/** The last N calendar months ending with the current one, oldest first. */
function monthWindow(asOf: Date, n = MONTHS_OF_HISTORY): { y: number; m: number }[] {
  const out: { y: number; m: number }[] = [];
  for (let back = n - 1; back >= 0; back--) {
    const d = new Date(asOf.getFullYear(), asOf.getMonth() - back, 1);
    out.push({ y: d.getFullYear(), m: d.getMonth() });
  }
  return out;
}

// ── the household plans ─────────────────────────────────────────────────────
// A plan is the monthly shape of a household: what lands, what must be paid,
// what is put away, what is spent. The generator turns it into a ledger; the
// score is then read back OFF that ledger, so the number on the ring and the
// rows a visitor scrolls can never disagree.

interface RecurringItem {
  vendor: string;
  bucket: string;
  amount: number;
  /** Day of month it lands. */
  day: number;
  by?: string; // contributor id
  recurrence?: "annual" | "monthly" | null;
  /** Only in this month (0-indexed) — road tax, insurance, Raya. */
  onlyMonth?: number;
}

interface VariableItem {
  vendors: string[];
  bucket: string;
  /** Times per month. */
  times: number;
  /** Average ringgit per occurrence. */
  each: number;
  spread: number; // ± fraction
  by?: string[]; // rotates through these contributors
  source?: CaptureSource;
}

interface Plan {
  gross: number;
  net: number;
  liquidSavings: number;
  contributors: DemoContributor[];
  buckets: DemoBucket[];
  recurring: RecurringItem[];
  variable: VariableItem[];
  /** Extra Raya spend, split across the Raya month. */
  raya?: { bucket: string; total: number; vendors: string[] };
}

const SOURCES: CaptureSource[] = ["text", "receipt", "voice", "statement"];

function contributor(id: string, name: string): DemoContributor {
  return { id, name, initial: name.slice(0, 1).toUpperCase() };
}

// ─────────────────────────────────────────────────────────────────────────────
// FAMILY — Building. Two earners, two kids, and the arithmetic that produces
// most of Malaysia's household stress: a must-paid line that eats three
// quarters of net income, a car and a PTPTN sitting on top, and a savings
// habit that keeps getting raided. Nothing here is a mistake the household
// made; it is what RM7,000 gross across four people looks like.
// ─────────────────────────────────────────────────────────────────────────────
const FAMILY: Plan = {
  gross: 7000,
  net: 6100,
  liquidSavings: 2850,
  contributors: [contributor("f-azlan", "Azlan"), contributor("f-mariam", "Mariam")],
  buckets: [
    { id: "fb-home", label: "Rent & Home", tier: 1 },
    { id: "fb-util", label: "Utilities & Bills", tier: 1 },
    { id: "fb-school", label: "School & Kids", tier: 1 },
    { id: "fb-transport", label: "Car & Transport", tier: 1 },
    { id: "fb-debt", label: "Loan Repayments", tier: 1 },
    { id: "fb-ins", label: "Insurance & Takaful", tier: 1 },
    { id: "fb-family", label: "Sokongan Ibu Bapa", tier: 1 },
    { id: "fb-save", label: "Savings", tier: 2 },
    { id: "fb-food", label: "Groceries & Eating Out", tier: 3 },
    { id: "fb-azlan", label: "Personal — Azlan", tier: 3, private: true, cap: 220, ownerId: "f-azlan" },
    { id: "fb-mariam", label: "Personal — Mariam", tier: 3, private: true, cap: 220, ownerId: "f-mariam" },
  ],
  recurring: [
    { vendor: "Rumah Sewa (Kajang)", bucket: "fb-home", amount: 1750, day: 1, by: "f-azlan" },
    { vendor: "TNB (Elektrik)", bucket: "fb-util", amount: 235, day: 6, by: "f-mariam" },
    { vendor: "Air Selangor", bucket: "fb-util", amount: 34, day: 6, by: "f-mariam" },
    { vendor: "Unifi (Fibre)", bucket: "fb-util", amount: 139, day: 7, by: "f-azlan" },
    { vendor: "CelcomDigi", bucket: "fb-util", amount: 98, day: 7, by: "f-azlan" },
    { vendor: "Astro", bucket: "fb-util", amount: 79.9, day: 9, by: "f-mariam" },
    { vendor: "Yuran Sekolah", bucket: "fb-school", amount: 520, day: 3, by: "f-mariam" },
    { vendor: "Pusat Tuisyen", bucket: "fb-school", amount: 430, day: 4, by: "f-mariam" },
    { vendor: "Perodua Bezza (Loan)", bucket: "fb-debt", amount: 1148, day: 5, by: "f-azlan" },
    { vendor: "PTPTN", bucket: "fb-debt", amount: 352, day: 5, by: "f-mariam" },
    { vendor: "Pinjaman Peribadi", bucket: "fb-debt", amount: 700, day: 8, by: "f-azlan" },
    { vendor: "Takaful Keluarga", bucket: "fb-ins", amount: 330, day: 10, by: "f-azlan" },
    { vendor: "Duit Belanja Ibu Bapa", bucket: "fb-family", amount: 350, day: 2, by: "f-azlan" },
    { vendor: "Tabung Simpanan", bucket: "fb-save", amount: 250, day: 2, by: "f-azlan" },
    // Annual, flagged at capture — amortised rather than treated as a bad month.
    { vendor: "Cukai Jalan + Insurans Kereta", bucket: "fb-transport", amount: 1980, day: 14, by: "f-azlan", recurrence: "annual", onlyMonth: 5 },
  ],
  variable: [
    { vendors: ["Lotus's", "99 Speedmart", "Mydin", "Pasar Tani"], bucket: "fb-food", times: 9, each: 132, spread: 0.3, by: ["f-mariam", "f-azlan"], source: "receipt" },
    { vendors: ["GrabFood", "Kopitiam", "McDonald's"], bucket: "fb-food", times: 6, each: 38, spread: 0.35, by: ["f-azlan", "f-mariam"] },
    { vendors: ["Petronas", "Shell", "Petron"], bucket: "fb-transport", times: 4, each: 145, spread: 0.2, by: ["f-azlan"] },
    { vendors: ["Touch 'n Go (Tol)"], bucket: "fb-transport", times: 3, each: 46, spread: 0.25, by: ["f-azlan"] },
    { vendors: ["Watsons", "Shopee", "Mr DIY"], bucket: "fb-azlan", times: 3, each: 82, spread: 0.4, by: ["f-azlan"] },
    { vendors: ["Shopee", "Guardian", "Uniqlo"], bucket: "fb-mariam", times: 3, each: 78, spread: 0.4, by: ["f-mariam"] },
  ],
  raya: { bucket: "fb-food", total: 1650, vendors: ["Baju Raya (Jakel)", "Duit Raya", "Balik Kampung (tol + minyak)", "Kuih Raya"] },
};

// ─────────────────────────────────────────────────────────────────────────────
// COUPLE — Steady. Two incomes, no kids yet, and a mortgage instead of rent.
// Coping comfortably month to month; the gap is the buffer, which is barely
// over one month of must-paid. That is exactly the household the buffer meter
// was designed for.
// ─────────────────────────────────────────────────────────────────────────────
const COUPLE: Plan = {
  gross: 9500,
  net: 8200,
  liquidSavings: 7100,
  contributors: [contributor("c-nadia", "Nadia"), contributor("c-faiz", "Faiz")],
  buckets: [
    { id: "cb-home", label: "Home Loan", tier: 1 },
    { id: "cb-util", label: "Utilities & Bills", tier: 1 },
    { id: "cb-transport", label: "Car & Transport", tier: 1 },
    { id: "cb-debt", label: "Loan Repayments", tier: 1 },
    { id: "cb-ins", label: "Insurance & Takaful", tier: 1 },
    { id: "cb-family", label: "Sokongan Ibu Bapa", tier: 1 },
    { id: "cb-save", label: "Savings", tier: 2 },
    { id: "cb-food", label: "Groceries & Eating Out", tier: 3 },
    { id: "cb-nadia", label: "Personal — Nadia", tier: 3, private: true, cap: 600, ownerId: "c-nadia" },
    { id: "cb-faiz", label: "Personal — Faiz", tier: 3, private: true, cap: 600, ownerId: "c-faiz" },
  ],
  recurring: [
    { vendor: "Pinjaman Rumah (Setapak)", bucket: "cb-home", amount: 3100, day: 1, by: "c-nadia" },
    { vendor: "TNB (Elektrik)", bucket: "cb-util", amount: 210, day: 6, by: "c-nadia" },
    { vendor: "Air Selangor", bucket: "cb-util", amount: 31, day: 6, by: "c-nadia" },
    { vendor: "Unifi (Fibre)", bucket: "cb-util", amount: 139, day: 7, by: "c-faiz" },
    { vendor: "CelcomDigi", bucket: "cb-util", amount: 88, day: 7, by: "c-faiz" },
    { vendor: "Netflix", bucket: "cb-util", amount: 55, day: 9, by: "c-nadia" },
    { vendor: "Spotify Duo", bucket: "cb-util", amount: 24.9, day: 9, by: "c-faiz" },
    { vendor: "Perodua Myvi (Loan)", bucket: "cb-debt", amount: 986, day: 5, by: "c-faiz" },
    { vendor: "PTPTN", bucket: "cb-debt", amount: 410, day: 5, by: "c-nadia" },
    { vendor: "Kad Kredit (ansuran)", bucket: "cb-debt", amount: 890, day: 8, by: "c-nadia" },
    { vendor: "Etiqa Takaful", bucket: "cb-ins", amount: 260, day: 10, by: "c-faiz" },
    { vendor: "AIA Medical", bucket: "cb-ins", amount: 280, day: 10, by: "c-nadia" },
    { vendor: "Duit Belanja Ibu Bapa", bucket: "cb-family", amount: 600, day: 2, by: "c-faiz" },
    { vendor: "Tabung Kecemasan", bucket: "cb-save", amount: 700, day: 2, by: "c-nadia" },
    { vendor: "Cukai Jalan + Insurans", bucket: "cb-transport", amount: 1640, day: 16, by: "c-faiz", recurrence: "annual", onlyMonth: 8 },
  ],
  variable: [
    { vendors: ["Jaya Grocer", "Lotus's", "99 Speedmart"], bucket: "cb-food", times: 7, each: 148, spread: 0.28, by: ["c-nadia", "c-faiz"], source: "receipt" },
    { vendors: ["GrabFood", "ZUS Coffee", "Kopitiam"], bucket: "cb-food", times: 8, each: 42, spread: 0.35, by: ["c-faiz", "c-nadia"] },
    { vendors: ["Petron", "Shell"], bucket: "cb-transport", times: 4, each: 168, spread: 0.18, by: ["c-faiz"] },
    { vendors: ["Touch 'n Go (Tol)"], bucket: "cb-transport", times: 3, each: 58, spread: 0.2, by: ["c-nadia"] },
    { vendors: ["Sephora", "Watsons", "Shopee"], bucket: "cb-nadia", times: 4, each: 148, spread: 0.35, by: ["c-nadia"] },
    { vendors: ["Steam", "Decathlon", "Shopee"], bucket: "cb-faiz", times: 4, each: 142, spread: 0.35, by: ["c-faiz"] },
  ],
  raya: { bucket: "cb-food", total: 1200, vendors: ["Baju Raya", "Duit Raya", "Balik Kampung"] },
};

// ─────────────────────────────────────────────────────────────────────────────
// INDIVIDUAL — Strong. One person, one salary, no dependants. Must-paid is
// comfortably inside 60% of net, the savings habit is real, and the buffer is
// over two months and climbing. Strong rather than Thriving because the buffer
// is the thing still missing — which is what the recap card should say.
// ─────────────────────────────────────────────────────────────────────────────
const INDIVIDUAL: Plan = {
  gross: 6500,
  net: 5700,
  liquidSavings: 7600,
  contributors: [contributor("i-suria", "Suria")],
  buckets: [
    { id: "ib-home", label: "Rent & Home", tier: 1 },
    { id: "ib-util", label: "Utilities & Bills", tier: 1 },
    { id: "ib-transport", label: "Transport", tier: 1 },
    { id: "ib-debt", label: "Loan Repayments", tier: 1 },
    { id: "ib-ins", label: "Insurance & Takaful", tier: 1 },
    { id: "ib-family", label: "Sokongan Ibu Bapa", tier: 1 },
    { id: "ib-save", label: "Savings & Investments", tier: 2 },
    { id: "ib-food", label: "Groceries & Eating Out", tier: 3 },
    { id: "ib-personal", label: "Personal & Lifestyle", tier: 3, private: true, cap: 700, ownerId: "i-suria" },
  ],
  recurring: [
    { vendor: "Sewa Studio (Bangsar)", bucket: "ib-home", amount: 2100, day: 1, by: "i-suria" },
    { vendor: "TNB (Elektrik)", bucket: "ib-util", amount: 118, day: 6, by: "i-suria" },
    { vendor: "Air Selangor", bucket: "ib-util", amount: 24, day: 6, by: "i-suria" },
    { vendor: "Unifi (Fibre)", bucket: "ib-util", amount: 129, day: 7, by: "i-suria" },
    { vendor: "CelcomDigi", bucket: "ib-util", amount: 68, day: 7, by: "i-suria" },
    { vendor: "PTPTN", bucket: "ib-debt", amount: 320, day: 5, by: "i-suria" },
    { vendor: "Pinjaman Peribadi", bucket: "ib-debt", amount: 980, day: 8, by: "i-suria" },
    { vendor: "Prudential (Medical)", bucket: "ib-ins", amount: 320, day: 10, by: "i-suria" },
    { vendor: "Duit Belanja Ibu Bapa", bucket: "ib-family", amount: 500, day: 2, by: "i-suria" },
    { vendor: "StashAway", bucket: "ib-save", amount: 450, day: 2, by: "i-suria" },
    { vendor: "ASNB", bucket: "ib-save", amount: 250, day: 2, by: "i-suria" },
    { vendor: "Insurans + Cukai Jalan", bucket: "ib-transport", amount: 1180, day: 12, by: "i-suria", recurrence: "annual", onlyMonth: 3 },
  ],
  variable: [
    { vendors: ["Jaya Grocer", "99 Speedmart", "Lotus's"], bucket: "ib-food", times: 5, each: 96, spread: 0.3, by: ["i-suria"], source: "receipt" },
    { vendors: ["GrabFood", "ZUS Coffee", "Mamak"], bucket: "ib-food", times: 9, each: 26, spread: 0.4, by: ["i-suria"] },
    { vendors: ["Grab", "Rapid KL", "Touch 'n Go"], bucket: "ib-transport", times: 8, each: 22, spread: 0.35, by: ["i-suria"] },
    { vendors: ["Shopee", "Watsons", "Kinokuniya", "Celebrity Fitness"], bucket: "ib-personal", times: 5, each: 118, spread: 0.35, by: ["i-suria"] },
  ],
  raya: { bucket: "ib-food", total: 780, vendors: ["Duit Raya", "Balik Kampung", "Baju Raya"] },
};

// ─────────────────────────────────────────────────────────────────────────────
// THRIVING — the top band, present so it isn't a rumour. Two senior salaries,
// a mortgage that is a smaller share of a bigger income, and a buffer past four
// months. Deliberately not a fantasy: they still carry a car loan and a
// mortgage, they just carry them against more income.
// ─────────────────────────────────────────────────────────────────────────────
const THRIVING: Plan = {
  gross: 12000,
  net: 10300,
  liquidSavings: 23400,
  contributors: [contributor("t-hafiz", "Hafiz"), contributor("t-lina", "Lina")],
  buckets: [
    { id: "tb-home", label: "Home Loan", tier: 1 },
    { id: "tb-util", label: "Utilities & Bills", tier: 1 },
    { id: "tb-transport", label: "Car & Transport", tier: 1 },
    { id: "tb-debt", label: "Loan Repayments", tier: 1 },
    { id: "tb-ins", label: "Insurance & Takaful", tier: 1 },
    { id: "tb-save", label: "Savings & Investments", tier: 2 },
    { id: "tb-food", label: "Groceries & Eating Out", tier: 3 },
    { id: "tb-hafiz", label: "Personal — Hafiz", tier: 3, private: true, cap: 900, ownerId: "t-hafiz" },
    { id: "tb-lina", label: "Personal — Lina", tier: 3, private: true, cap: 900, ownerId: "t-lina" },
  ],
  recurring: [
    { vendor: "Pinjaman Rumah (Mont Kiara)", bucket: "tb-home", amount: 2450, day: 1, by: "t-hafiz" },
    { vendor: "TNB (Elektrik)", bucket: "tb-util", amount: 240, day: 6, by: "t-lina" },
    { vendor: "Air Selangor", bucket: "tb-util", amount: 42, day: 6, by: "t-lina" },
    { vendor: "Unifi (Fibre)", bucket: "tb-util", amount: 209, day: 7, by: "t-hafiz" },
    { vendor: "CelcomDigi", bucket: "tb-util", amount: 148, day: 7, by: "t-hafiz" },
    { vendor: "Astro + Netflix", bucket: "tb-util", amount: 165, day: 9, by: "t-lina" },
    { vendor: "Honda City (Loan)", bucket: "tb-debt", amount: 1290, day: 5, by: "t-hafiz" },
    { vendor: "Kad Kredit (ansuran)", bucket: "tb-debt", amount: 1280, day: 8, by: "t-lina" },
    { vendor: "Great Eastern (Medical)", bucket: "tb-ins", amount: 320, day: 10, by: "t-lina" },
    { vendor: "Takaful Keluarga", bucket: "tb-ins", amount: 240, day: 10, by: "t-hafiz" },
    { vendor: "StashAway", bucket: "tb-save", amount: 1200, day: 2, by: "t-hafiz" },
    { vendor: "ASNB", bucket: "tb-save", amount: 700, day: 2, by: "t-lina" },
    { vendor: "Cukai Jalan + Insurans", bucket: "tb-transport", amount: 2350, day: 15, by: "t-hafiz", recurrence: "annual", onlyMonth: 6 },
  ],
  variable: [
    { vendors: ["Village Grocer", "Jaya Grocer", "Lotus's"], bucket: "tb-food", times: 8, each: 168, spread: 0.25, by: ["t-lina", "t-hafiz"], source: "receipt" },
    { vendors: ["GrabFood", "ZUS Coffee", "Restoran"], bucket: "tb-food", times: 9, each: 62, spread: 0.35, by: ["t-hafiz", "t-lina"] },
    { vendors: ["Petron", "Shell"], bucket: "tb-transport", times: 5, each: 165, spread: 0.18, by: ["t-hafiz"] },
    { vendors: ["Touch 'n Go (Tol)"], bucket: "tb-transport", times: 4, each: 72, spread: 0.2, by: ["t-lina"] },
    { vendors: ["Decathlon", "Shopee", "Apple"], bucket: "tb-hafiz", times: 4, each: 195, spread: 0.35, by: ["t-hafiz"] },
    { vendors: ["Sephora", "Zara", "Watsons"], bucket: "tb-lina", times: 4, each: 190, spread: 0.35, by: ["t-lina"] },
  ],
  raya: { bucket: "tb-food", total: 2400, vendors: ["Baju Raya", "Duit Raya", "Balik Kampung", "Open House"] },
};

// ── generation ──────────────────────────────────────────────────────────────

function generateLedger(key: PersonaKey, plan: Plan, asOf: Date): DemoTxn[] {
  const rnd = mulberry32(hashSeed(key));
  const out: DemoTxn[] = [];
  let n = 0;
  const push = (t: Omit<DemoTxn, "id">) => {
    out.push({ ...t, id: `${key}-${String(n++).padStart(4, "0")}` });
  };

  for (const { y, m } of monthWindow(asOf)) {
    for (const r of plan.recurring) {
      if (r.onlyMonth !== undefined && m !== r.onlyMonth) continue;
      const date = iso(y, m, r.day, 9);
      if (new Date(date) > asOf) continue;
      push({
        date,
        // Fixed obligations don't wobble; metered ones do.
        amount: r.recurrence === "annual" ? r.amount : jitter(rnd, r.amount, r.vendor.includes("TNB") || r.vendor.includes("Air") ? 0.12 : 0),
        vendor: r.vendor,
        bucketId: r.bucket,
        contributorId: r.by ?? null,
        recurrence: r.recurrence ?? "monthly",
        source: "statement",
      });
    }

    for (const v of plan.variable) {
      for (let i = 0; i < v.times; i++) {
        const day = 2 + Math.floor((i / v.times) * 26) + Math.floor(rnd() * 3);
        const date = iso(y, m, day, 11 + (i % 9));
        if (new Date(date) > asOf) continue;
        push({
          date,
          amount: jitter(rnd, v.each, v.spread),
          vendor: v.vendors[(i + m) % v.vendors.length],
          bucketId: v.bucket,
          contributorId: v.by ? v.by[i % v.by.length] : null,
          recurrence: null,
          source: v.source ?? SOURCES[(i + m) % SOURCES.length],
        });
      }
    }

    // Raya lands in one month and is visibly heavier than the eleven around it.
    if (plan.raya && m === RAYA_MONTH) {
      const each = plan.raya.total / plan.raya.vendors.length;
      plan.raya.vendors.forEach((vendor, i) => {
        const date = iso(y, m, 12 + i * 3, 14);
        if (new Date(date) > asOf) return;
        push({
          date,
          amount: jitter(rnd, each, 0.15),
          vendor,
          bucketId: plan.raya!.bucket,
          contributorId: plan.contributors[i % plan.contributors.length].id,
          recurrence: null,
          source: "text",
        });
      });
    }
  }

  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// ── reading the score back off the ledger ───────────────────────────────────
// Deliberately derived rather than declared: if the fixture and the ring could
// disagree, sooner or later they would, and a demo whose number doesn't match
// its own rows is worse than no demo.
//
// Averaged over the last three COMPLETE calendar months rather than a raw
// trailing-90-days sum. Both are three months, but the calendar version doesn't
// wobble as the current month fills up — on the 2nd, a raw window is two thirds
// empty and the buffer ratio (a stock over a flow) would spike accordingly.

export function completeMonths(asOf: Date, n = 3): { y: number; m: number }[] {
  const out: { y: number; m: number }[] = [];
  for (let back = n; back >= 1; back--) {
    const d = new Date(asOf.getFullYear(), asOf.getMonth() - back, 1);
    out.push({ y: d.getFullYear(), m: d.getMonth() });
  }
  return out;
}

const inMonth = (t: DemoTxn, y: number, m: number) => {
  const d = new Date(t.date);
  return d.getFullYear() === y && d.getMonth() === m;
};

/** Monthly-equivalent spend into a set of buckets, annual items amortised. */
function monthlyInto(ledger: DemoTxn[], months: { y: number; m: number }[], bucketIds: Set<string>): number {
  let total = 0;
  for (const { y, m } of months) {
    for (const t of ledger) {
      if (!bucketIds.has(t.bucketId) || !inMonth(t, y, m)) continue;
      total += t.recurrence === "annual" ? t.amount / 12 : t.amount;
    }
  }
  return total / months.length;
}

export interface DemoScoreView {
  hscore: HScore;
  inputs: ScoreInputs;
  /** Per-month privacy spend, most recent last — what the privacy bar reads. */
  privacyTrailing3: number[];
}

export function scoreFor(persona: DemoPersona, asOf: Date = new Date()): DemoScoreView {
  const months = completeMonths(asOf, 3);
  const byTier = (tier: number) => new Set(persona.buckets.filter((b) => b.tier === tier).map((b) => b.id));
  const debtBuckets = new Set(
    persona.buckets.filter((b) => /loan repayment/i.test(b.label)).map((b) => b.id),
  );
  const privateBuckets = persona.buckets.filter((b) => b.private);
  const privateIds = new Set(privateBuckets.map((b) => b.id));
  const privacyCapMonthly = privateBuckets.reduce((s, b) => s + (b.cap ?? 0), 0);

  const privacyTrailing3 = months.map(({ y, m }) =>
    Math.round(
      persona.ledger
        .filter((t) => privateIds.has(t.bucketId) && inMonth(t, y, m))
        .reduce((s, t) => s + t.amount, 0) * 100,
    ) / 100,
  );

  const inputs: ScoreInputs = {
    netIncomeMonthly: persona.netMonthly,
    grossIncomeMonthly: persona.grossMonthly,
    savingsMonthly: monthlyInto(persona.ledger, months, byTier(2)),
    // Must-paid excludes the loan repayments, which are scored separately as
    // DSR — counting a car loan in both would punish it twice.
    mustPaidMonthly: monthlyInto(
      persona.ledger,
      months,
      new Set([...byTier(1)].filter((id) => !debtBuckets.has(id))),
    ),
    debtRepaymentsMonthly: monthlyInto(persona.ledger, months, debtBuckets),
    liquidSavings: persona.liquidSavings,
    privacyCapMonthly,
    privacyTrailing3,
  };

  const txns30d = persona.ledger.filter(
    (t) => new Date(t.date).getTime() >= asOf.getTime() - 30 * 86_400_000,
  ).length;

  const confidence = assessConfidence({
    incomeDeclared: true,
    txns30d,
    bucketsWithEntries: new Set(persona.ledger.map((t) => t.bucketId)).size,
    bucketsTotal: persona.buckets.length,
  });

  const hscore = computeHScore(inputs, confidence);
  // The demo shows settled bands, so hysteresis is resolved rather than pending:
  // a visitor is looking at a household that has been where it is for months.
  hscore.band = applyHysteresis(hscore.rawBand, { band: hscore.rawBand }, asOf).band;
  return { hscore, inputs, privacyTrailing3 };
}

// ── the four households ─────────────────────────────────────────────────────

const PLANS: Record<PersonaKey, { plan: Plan; emoji: string; targetBand: Band }> = {
  individual: { plan: INDIVIDUAL, emoji: "🧑", targetBand: "strong" },
  couple: { plan: COUPLE, emoji: "👫", targetBand: "steady" },
  family: { plan: FAMILY, emoji: "👪", targetBand: "building" },
  thriving: { plan: THRIVING, emoji: "🌟", targetBand: "thriving" },
};

/** Display order: the arc, then the aspirational one. */
export const PERSONA_ORDER: PersonaKey[] = ["individual", "couple", "family", "thriving"];

export function buildPersona(key: PersonaKey, asOf: Date = new Date()): DemoPersona {
  const { plan, emoji, targetBand } = PLANS[key];
  return {
    key,
    nameKey: `demo.persona.${key}.name`,
    blurbKey: `demo.persona.${key}.blurb`,
    emoji,
    contributors: plan.contributors,
    buckets: plan.buckets,
    grossMonthly: plan.gross,
    netMonthly: plan.net,
    liquidSavings: plan.liquidSavings,
    ledger: generateLedger(key, plan, asOf),
    targetBand,
  };
}

export function buildAllPersonas(asOf: Date = new Date()): Record<PersonaKey, DemoPersona> {
  return {
    individual: buildPersona("individual", asOf),
    couple: buildPersona("couple", asOf),
    family: buildPersona("family", asOf),
    thriving: buildPersona("thriving", asOf),
  };
}

export { bandFor, MIN_TXNS_30D };
