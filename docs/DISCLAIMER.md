# DISCLAIMER & PRIVACY

_The in-app version lives at `/guide`. This file is the canonical text; keep the two in sync._

## Disclaimer

- **Not financial advice.** HoneyMoney is an informational budgeting & insight tool, **not** a licensed financial adviser, and nothing in it constitutes personal financial, tax, or investment advice. For personal advice, consult a licensed financial planner or, in Malaysia, **AKPK** (Agensi Kaunseling dan Pengurusan Kredit — free credit counselling, <https://www.akpk.org.my>).
- **Not a bank / not a fund manager.** HoneyMoney does **not** hold, move, or invest your money. It helps you *see and plan* it. Any savings/investment products referenced belong to their respective **licensed providers** and are subject to their terms.
- **Estimates, not guarantees.** Projections extrapolate from the data you enter (spend velocity, allocations). They are planning aids only — always verify against your bank/e-wallet statements.
- **Demo data is synthetic.** The Rahman family, Nadia & Faiz, and Aisha are illustrative fixtures; any resemblance to real people is coincidental.
- **Statutory compliance is the user's responsibility.** For business use (income tax, EPF/SOCSO/EIS, SST, LHDN e-Invoicing), HoneyMoney is a **cashflow lens**, not an accounting or e-invoicing system of record. File statutory returns through a qualified accountant or LHDN-approved software.
- **No warranty.** The software is provided "as is", without warranty of any kind, to the extent permitted by law.

## Privacy (PDPA-aware)

- **Local-first by default.** The reference deployment runs a local database (PocketBase) on the operator's machine; household data does not need to leave it. The Next.js server is the only thing that talks to the database — the browser never does.
- **Data minimization.** Forwarded/scanned receipts are parsed into structured fields (vendor, amount, date); the **raw image is not stored**.
- **On-device capture.** Voice entry and receipt scanning run in the browser (Web Speech API + tesseract.js). That audio/image **never leaves the device** and uses **no AI tokens**.
- **Private wallets.** Spending in the **Spendings** bucket (Bucket 3) is **not itemized** — autonomy over surveillance.
- **User control.** Members/roster can be added or removed at any time; removing a person **keeps their past transactions but un-attributes them** (nothing is lost, nothing stays tied to them).
- **Minimal AI exposure.** If the optional AI insight (Gemini) is enabled, it receives a **short budget-status summary** — not raw transactions, not identities. Note that any cloud AI call sends that summary outside Malaysia; the local-first path avoids this entirely.
- **No ads, no data sale.** HoneyMoney does not sell or share personal data.
- **Consent & retention.** For any real (non-demo) deployment handling employees' or family members' financial data, obtain clear consent, honour data-access/deletion requests, and follow the retention posture in `PLAN.md §14`. Under Malaysia's PDPA (as amended 2024), a real deployment should appoint a Data Protection Officer and maintain a breach-notification process.

## AI use

See `docs/AI_DISCLOSURE.md` for how AI is used in building and running HoneyMoney (Gemini for optional OCR/insight; on-device open-source models for the no-token path).
