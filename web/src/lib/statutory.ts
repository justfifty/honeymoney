// Malaysian statutory facts + a rough take-home estimate, so Honey can answer
// "what's my EPF?" / "what's my take-home on RM4,000?" grounded in VERIFIED
// figures instead of hallucinating rates. Numbers are 2025-effective and copied
// from the finance-content skill's primary-sourced fact file; SOCSO/EIS are
// table-based so anything computed here is explicitly an approximation and the
// copy tells the user to confirm on KWSP/PERKESO/LHDN. Educational, not advice.

const round = (v: number) => Math.round(v * 100) / 100;

// A compact, grounding fact block appended to the AI context for statutory Qs.
export const STATUTORY_FACTS = `Verified Malaysian statutory facts (2025-effective — re-verify at kwsp.gov.my / perkeso.gov.my / hasil.gov.my):
- EPF/KWSP (Malaysian/PR, under 60): Employee 11%; Employer 13% if monthly wage ≤ RM5,000, else 12%. For wages < RM20,000 the exact Third Schedule amount applies, not a raw %.
- SOCSO (First Category): Employee ~0.5%, Employer ~1.75% of wages — table-based; wage ceiling RM6,000 (since 1 Oct 2024).
- EIS: 0.2% employee + 0.2% employer (0.4% total); wage ceiling RM6,000 (~RM11.90/party at the ceiling).
- Minimum wage: RM1,700/month, nationwide from 1 Aug 2025.
- PCB (Potongan Cukai Bulanan / MTD): monthly tax withheld by the employer as an instalment toward annual tax — not a separate tax. Chargeable income = gross − EPF (capped) − reliefs.
- Free help: AKPK (a BNM subsidiary) offers free debt counselling — 03-2616 7766, akpk.org.my.
Always say figures are approximate/2025 and to confirm on the primary government source. This is educational, not financial advice.`;

// Does this question look like a Malaysian statutory / take-home question?
export function isStatutoryQuestion(q: string): boolean {
  return /\b(epf|kwsp|socso|perkeso|eis|pcb|mtd|caruman|potongan|statutory|deduction|take[-\s]?home|net (pay|salary)|gaji bersih|income tax|cukai|akpk|minimum wage|gaji minimum)\b/i.test(q);
}

export interface StatutoryEstimate {
  wage: number;
  epfEmployee: number;
  epfEmployer: number;
  socsoEmployee: number;
  eisEmployee: number;
  deductions: number;
  takeHome: number;
}

// Rough monthly statutory estimate for a Malaysian, under 60. EPF is exact %;
// SOCSO/EIS are approximated off the ceiling (they're really table-based).
export function estimateStatutory(wage: number): StatutoryEstimate {
  const epfEmployee = round(wage * 0.11);
  const epfEmployer = round(wage * (wage <= 5000 ? 0.13 : 0.12));
  const ceilingBase = Math.min(wage, 6000);
  const socsoEmployee = round(ceilingBase * 0.005);
  const eisEmployee = round(ceilingBase * 0.002);
  const deductions = round(epfEmployee + socsoEmployee + eisEmployee);
  return { wage: round(wage), epfEmployee, epfEmployer, socsoEmployee, eisEmployee, deductions, takeHome: round(wage - deductions) };
}

// Deterministic, grounded statutory answer (English) for the zero-token fallback.
export function statutoryAnswer(wage: number): string {
  const e = estimateStatutory(wage);
  return (
    `On about RM${e.wage}/month (Malaysian, under 60): EPF employee ~RM${e.epfEmployee} (11%), ` +
    `SOCSO ~RM${e.socsoEmployee}, EIS ~RM${e.eisEmployee} — roughly RM${e.deductions} in statutory deductions, ` +
    `leaving about RM${e.takeHome} before any income tax (PCB). Your employer also adds EPF ~RM${e.epfEmployer}. ` +
    `These are 2025 approximations — SOCSO/EIS are table-based, so confirm the exact amounts on KWSP/PERKESO. ` +
    `Educational, not financial advice.`
  );
}
