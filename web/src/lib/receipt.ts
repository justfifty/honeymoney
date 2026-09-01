// Agentic receipt analytics.
//
// A single "read the image" call is OCR, not analysis — it tells you a number
// and a shop name, and leaves the user to do the thinking. This runs a small
// agent loop instead, where each step is grounded in the household's actual
// graph rather than in the model's imagination:
//
//   1. PERCEIVE  — a vision model reads the receipt / e-wallet screenshot.
//   2. GROUND    — we fetch the household's real buckets, vendors, recent
//                  spending, and which bucket they file each vendor under. No
//                  step below is allowed to invent an id.
//   3. DECIDE    — the household's own filing history picks the bucket where it
//                  has one, and arithmetic (not the model) decides duplicates.
//                  A text model, given only real options, fills the rest: spots
//                  a subscription and calls out anything anomalous versus this
//                  household's history.
//   4. EXPLAIN   — one plain-English line the user can act on.
//
// Nothing is written. The agent proposes; the human confirms; and if the human
// corrects it, that correction is what gets stored — and the correction itself
// is recorded in the audit ledger.

import { aiGenerate, aiVision } from "./ai";
import { activeAiProvider, isProviderConfigured, type AiProvider } from "./config";
import { findDuplicate, type DuplicateMatch, type ExistingTxn } from "./dedupe";
import { itemsLookIncomplete, verify, type MathVerdict, type SuspectField } from "./receiptMath";
import { pbList, pbStr } from "./pocketbase";

/**
 * One printed line on the receipt.
 *
 * `amount` is the LINE TOTAL as printed — what that row contributed to the
 * subtotal. `qty` and `unitPrice` are carried separately when the receipt shows
 * them ("2 x 3.50"), because a household correcting a misread needs the number
 * that was actually wrong: a bad quantity and a bad unit price produce the same
 * bad line total, and only one of them is the mistake.
 *
 * `discount` is a negative-going line ("Member disc -2.00") kept as a row of its
 * own rather than folded into the item above it, so the arithmetic on screen is
 * the arithmetic on the paper.
 */
export interface ReceiptLineItem {
  label: string;
  amount: number; // the line total as printed
  qty?: number; // when the receipt prints a quantity
  unitPrice?: number; // when the receipt prints a per-unit price
  discount?: boolean; // true when this row SUBTRACTS (a discount / voucher / rebate)
}

export interface ReceiptExtraction {
  vendor: string;
  amount: number; // the final total paid — the canonical figure the app records
  currency: string;
  occurredAt: string; // ISO 8601, or "" if the receipt didn't say
  paymentMethod: string; // "Touch 'n Go", "MAE", "card", "cash"…
  // The Malaysian receipt breakdown, when printed. Each is 0 if the receipt
  // doesn't show it. `total` is the printed grand total and equals `amount`.
  subtotal: number; // goods/services before service charge & tax
  serviceCharge: number; // e.g. 10% (restaurants), 0 if none
  tax: number; // SST / service tax (or older GST), 0 if none
  rounding: number; // Malaysian 5-sen rounding adjustment; may be negative
  total: number; // final total after service charge & tax
  lineItems: ReceiptLineItem[];
  /**
   * True when the receipt had MORE rows than we kept.
   *
   * A till roll longer than MAX_LINE_ITEMS is cut, and a silent cut is the one
   * outcome this file exists to prevent: a household that chose "record every
   * item" would post a set of records that is quietly short, and nothing on
   * screen would say so. The flag is what lets the editor tell them.
   */
  itemsTruncated: boolean;
  confidence: number; // 0..1, the model's own honesty about the read
  /**
   * What the receipt's OWN ARITHMETIC says about the read.
   *
   * The confidence above is the model grading its own homework, which is the
   * one number a model that cannot see is worst at producing — the 2026-09-01
   * fabrication came back at a confidence high enough to prefill a form. This is
   * evidence from somewhere else entirely: items against subtotal, subtotal plus
   * charges against total. It cannot be faked by a model being sure of itself.
   *
   * Null for a document with nothing to check, such as a bare e-wallet
   * confirmation showing one figure. That is an absence of evidence and is
   * reported as such rather than as a failure.
   */
  checks: {
    confirmed: string[];
    conflicts: { relation: string; expected: number; found: number; suspect: SuspectField }[];
    /** Blanks filled in from the other figures, never a stated value overwritten. */
    repairs: { field: string; value: number; because: string }[];
    /** The field to point the user at when something disagrees. */
    suspect: SuspectField | null;
  } | null;
}

export interface ReceiptAnalysis {
  bucket: { nodeId: string; label: string; reason: string } | null;
  duplicateOf:
    | { id: string; vendor: string; amount: number; occurredAt: string; why: string; certainty: "exact" | "likely" }
    | null;
  subscription: { likely: boolean; cadence: string; note: string } | null;
  anomaly: { flagged: boolean; note: string } | null;
  insight: string;
}

export interface ReceiptResult {
  extraction: ReceiptExtraction;
  analysis: ReceiptAnalysis | null;
  provider: AiProvider;
  degraded?: string; // set when a step failed and we returned less than we'd like
}

// ⚠️ NO NAMED MERCHANTS, NO SPECIMEN DATES, AND THAT IS THE WHOLE POINT.
//
// This prompt used to open by listing real merchants — "mamak, kedai runcit,
// 99 Speedmart, Tesco/Lotus's, AEON, Mydin, Tealive, ZUS Coffee,
// Shell/Petronas" — and to illustrate the date rule with the literal string
// "03/07/2026". Reported 2026-09-01 with a photograph of a SWISS restaurant
// bill (Berghotel Grosse Scheidegg, CHF 54.50, 30.07.2007). What came back:
//
//     vendor    "Mamak"        <- first item of the merchant list above
//     currency  "MYR"          <- the default this file asked for, twice
//     date      2026-03-07     <- the specimen date, read back wrong way round
//     amount    8.90           <- invented to match
//
// Not one field came off the receipt. The model could not read the image and
// answered from its own instructions, at a confidence high enough to prefill
// the form — so the user was shown a complete, plausible, entirely fictional
// transaction, in the app whose promise is that the parser proposes and the
// human commits. A blank is a request for help. A fabrication is a lie the
// household may well confirm without looking.
//
// So: describe the KINDS of document, never name one. Describe the date rule,
// never write a specimen date. Anything concrete in here is something the model
// can hand back when it cannot see, and it will.
const EXTRACT_SYSTEM = `You read payment receipts and e-wallet screenshots. Most
are Malaysian — e-wallet and bank app confirmations, and printed receipts from
food stalls, grocers, convenience chains, supermarkets, cafés and petrol
stations — but you will also be given receipts from other countries, in other
languages and other currencies, and you must read those as they are rather than
as though they were Malaysian.

Rules you must follow:
- READ, DO NOT RECOGNISE. Every value you return must be visibly present in this
  image. You are never to supply a merchant, a currency, a date or an amount
  because it is typical, expected, or mentioned anywhere in these instructions.
  If you cannot actually see a field in the picture, that field is empty.
- If the image is unreadable, not a receipt, or too blurred to be sure, return
  empty strings and zeros with confidence 0. That is a correct and useful
  answer. Returning a plausible receipt you did not read is the single worst
  thing you can do here, because the person will believe you.
- The MERCHANT is who was paid. It is never the wallet app itself: "Touch 'n Go",
  "TNG eWallet", "DuitNow", "Maybank", "MAE", "GrabPay" are payment rails, not
  merchants. If the screenshot shows a transfer to a person, the merchant is that
  person's name.
- The AMOUNT is what left the user's pocket. Ignore the wallet's remaining
  balance, any reload amount, cashback, and points. If several totals appear,
  take the one labelled Total / Jumlah / Amount Paid / Bayaran.
- Many Malaysian receipts print a BREAKDOWN before the total: a Subtotal, then a
  Service Charge (often 10%, common in restaurants), then SST / Service Tax (or
  older receipts GST), sometimes a Rounding Adjustment, then the final Total.
  Capture subtotal, serviceCharge, tax, rounding and total separately when they
  are printed; put 0 for any that the receipt does not show. "amount" and "total"
  are the SAME final figure paid, after service charge and tax.
- ITEMISE EVERY LINE. This is not optional and it is not a summary. If the
  receipt lists what was bought, return ONE entry in "lineItems" for EVERY
  purchased line printed on it, in the order they appear, including the ones
  that look boring, repeat an earlier line, or cost a few sen. A person is going
  to read your list against the paper in their hand, so a list that stops early
  or merges two rows into one is worse than no list at all.
  - "label" is the item description as printed. Keep the shop's own wording,
    including its abbreviations; do not expand, translate or tidy them.
  - "amount" is that LINE'S TOTAL — what the row contributes to the subtotal.
    For "2 x 3.50  7.00" the amount is 7.00, not 3.50.
  - "qty" and "unitPrice" are for when the row prints them ("2 x 3.50" ⇒ qty 2,
    unitPrice 3.50). Omit both when the row shows only one figure. Never
    calculate a quantity the receipt does not state.
  - A DISCOUNT, voucher, rebate or member saving is its own row with
    "discount": true and a POSITIVE amount. It subtracts; the flag says so.
  - Do NOT put the subtotal, the service charge, the tax, the rounding, the
    total, the amount tendered, the change, loyalty points or the closing
    balance in "lineItems". Those are the breakdown fields above, and repeating
    them as items would double-count the receipt.
  - If the receipt shows only a total and no itemisation at all, return an empty
    list. An empty list is a fact about the receipt; an invented list is not.
- DATES ARE DAY-FIRST unless the receipt itself proves otherwise. Malaysian,
  European and most other receipts print day before month; a day number above 12
  settles it. Where the order is genuinely ambiguous and nothing on the receipt
  resolves it, prefer day-first, and lower your confidence to say so. Return the
  date PRINTED ON THE RECEIPT — an old receipt has an old date, and today's date
  is never the answer unless the receipt shows today.
- CURRENCY IS WHATEVER THE RECEIPT SHOWS. Read the symbol or code actually
  printed — RM, CHF, SGD, EUR, USD, IDR, THB and so on — and return that. Do not
  assume Malaysian ringgit because most receipts here are; a foreign receipt
  recorded in the wrong currency is a wrong number in somebody's ledger. If no
  currency is visible anywhere, return an empty string rather than a guess.
- If the image genuinely does not show a field, leave it empty and lower your
  confidence. Do not guess. A wrong number a user trusts is worse than a blank
  one they fill in.`;

const EXTRACT_PROMPT = `Extract the payment from this image. Return ONLY strict JSON:
{
  "vendor": string,          // the merchant paid; "" if truly unreadable
  "amount": number,          // final total paid, as a number; 0 if unreadable
  "currency": string,        // ISO code AS PRINTED on the receipt; "" if none is shown
  "occurredAt": string,      // ISO 8601 datetime, or "" if absent
  "paymentMethod": string,   // wallet/app/card/cash used, or ""
  "subtotal": number,        // before service charge & tax; 0 if not shown
  "serviceCharge": number,   // service charge (e.g. 10%); 0 if not shown
  "tax": number,             // SST / service tax / GST; 0 if not shown
  "rounding": number,        // rounding adjustment; 0 if not shown, may be negative
  "total": number,           // final total after service charge & tax; = amount
  // EVERY purchased line on the receipt, in printed order. [] only if the
  // receipt shows no itemisation at all. qty/unitPrice only when printed.
  "lineItems": [
    { "label": string, "amount": number, "qty": number, "unitPrice": number, "discount": boolean }
  ],
  "confidence": number       // 0..1 — your honest confidence in the amount+vendor
}`;

function parseJson<T>(raw: string): T {
  // Models sometimes wrap JSON in prose or a fenced block despite being asked not to.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The model did not return JSON.");
  return JSON.parse(body.slice(start, end + 1)) as T;
}

// A long supermarket till roll really does run to a hundred lines, and the old
// cap of 30 cut most of them off without saying so — which is invisible when the
// list is decoration and a wrong ledger once the user can choose to record every
// item. 150 covers a full weekly shop; past that `itemsTruncated` says so out
// loud rather than the list quietly ending.
const MAX_LINE_ITEMS = 150;

// Exported for scripts/check-receipt.mts. This function is where the two
// guards that matter actually live — the confidence floor and the absence of a
// currency default — so it is the thing worth testing directly, without an API
// key or a network round trip.
export function coerceExtraction(raw: Partial<ReceiptExtraction>): ReceiptExtraction {
  // Non-negative money coercion, rounded to sen; 0 when absent/invalid.
  const money = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? Math.round(x * 100) / 100 : 0;
  };
  // ── THE FLOOR, ENFORCED IN CODE RATHER THAN ASKED FOR IN A PROMPT ────────
  //
  // The prompt now forbids answering from its own examples, and that is worth
  // doing, but a prompt is a request and this is a guarantee. A model that
  // cannot read an image and invents a whole receipt does not announce it — the
  // 2026-09-01 report came back with a merchant, a currency, a date and an
  // amount, none of which were on the paper, and nothing downstream could tell.
  //
  // A model that is honest about its own uncertainty is the one case we CAN
  // catch cheaply, so a confidence below this floor is treated as "not read"
  // rather than as a weak reading: the fields are dropped and the caller shows
  // the photo with an empty form instead of a filled one. Typing four
  // characters is a small cost. Confirming a fabricated merchant and amount
  // into a household ledger is not.
  //
  // 0.35 rather than 0.6: this only has to catch the model saying it is
  // guessing. AddTransaction already warns between here and 0.6, which is the
  // band where a reading is worth showing but worth checking.
  const MIN_TRUSTED_CONFIDENCE = 0.35;
  const confidence = Number.isFinite(Number(raw.confidence)) ? Number(raw.confidence) : 0;
  if (confidence > 0 && confidence < MIN_TRUSTED_CONFIDENCE) {
    return {
      vendor: "",
      amount: 0,
      currency: "",
      occurredAt: "",
      paymentMethod: "",
      subtotal: 0,
      serviceCharge: 0,
      tax: 0,
      rounding: 0,
      total: 0,
      lineItems: [],
      itemsTruncated: false,
      checks: null,
      confidence,
    };
  }

  const total = money(raw.total);
  // The canonical amount is the final total; if the model only filled one of the
  // two, borrow from the other so the recorded figure is never lost.
  const amount = money(raw.amount) || total;

  // ── THE ITEMS ────────────────────────────────────────────────────────────
  //
  // Kept in PRINTED ORDER and not deduplicated. A till roll that lists the same
  // 1.50 bun three times bought three buns, and a "tidy" list that collapses
  // them is a different receipt from the one in the user's hand — which is the
  // only thing they can check this against.
  const rawItems = Array.isArray(raw.lineItems) ? raw.lineItems : [];
  const itemCount = rawItems.length;
  const items: ReceiptLineItem[] = rawItems
    .filter((li) => li && typeof li.label === "string" && Number.isFinite(Number(li.amount)))
    .slice(0, MAX_LINE_ITEMS)
    .map((li) => {
      const qty = Number(li.qty);
      const unit = Number(li.unitPrice);
      return {
        label: String(li.label).trim().slice(0, 80),
        // Line totals are stored POSITIVE; `discount` carries the sign, the same
        // way the statement importer keeps `amount` positive and lets `type`
        // say which way the money went. One convention across both readers.
        amount: Math.abs(Math.round(Number(li.amount) * 100) / 100),
        ...(Number.isFinite(qty) && qty > 0 ? { qty: Math.round(qty * 1000) / 1000 } : {}),
        ...(Number.isFinite(unit) && unit > 0 ? { unitPrice: Math.round(unit * 100) / 100 } : {}),
        // A row the model returned as negative IS a discount whether or not it
        // remembered to set the flag — the minus sign on the paper is the
        // statement of intent, and honouring it costs nothing.
        ...(li.discount === true || Number(li.amount) < 0 ? { discount: true } : {}),
      };
    })
    // A zero-value row is till furniture ("SUBTOTAL", a section header the model
    // mistook for an item), not something anybody bought.
    .filter((li) => li.amount > 0 && li.label.length > 0);
  const draft: ReceiptExtraction = {
    vendor: typeof raw.vendor === "string" ? raw.vendor.trim().slice(0, 80) : "",
    amount,
    // ⚠️ NOT `|| "MYR"`. This was the second place the ringgit was forced — the
    // prompt asked for it as a default and then this line applied it again to
    // anything falsy, so a Swiss receipt reading CHF 54.50 could not have come
    // back as CHF even if the model had read it correctly. An unknown currency
    // is empty here and resolved by the caller against the household's own
    // currency, which is a decision with a reason behind it rather than a
    // constant standing in for one.
    currency: (typeof raw.currency === "string" && raw.currency.trim().toUpperCase()) || "",
    occurredAt: typeof raw.occurredAt === "string" ? raw.occurredAt : "",
    paymentMethod: typeof raw.paymentMethod === "string" ? raw.paymentMethod.slice(0, 40) : "",
    subtotal: money(raw.subtotal),
    serviceCharge: money(raw.serviceCharge),
    tax: money(raw.tax),
    // Rounding is the one figure on a Malaysian receipt that is legitimately
    // NEGATIVE — the 5-sen adjustment usually takes money off — so it does not
    // go through `money`, which floors at zero and would silently drop it.
    rounding: Number.isFinite(Number(raw.rounding)) ? Math.round(Number(raw.rounding) * 100) / 100 : 0,
    total: total || amount,
    lineItems: items,
    itemsTruncated: itemCount > MAX_LINE_ITEMS,
    checks: null,
    confidence: Number.isFinite(Number(raw.confidence))
      ? Math.min(1, Math.max(0, Number(raw.confidence)))
      : 0.5,
  };

  return applyChecks(draft);
}

/**
 * Run the receipt's own arithmetic over a coerced reading, and let it move the
 * confidence.
 *
 * Split out of `coerceExtraction` so the second extraction pass can re-run it
 * over merged items without repeating the coercion, and so the check script can
 * exercise the two independently.
 *
 * The confidence is REPLACED by the adjusted one rather than reported alongside
 * it, because every consumer already reads `confidence` — the low-confidence
 * warning, the "open the editor and focus the amount" rule in AddTransaction,
 * and the 0.35 floor. A corroborated read should relax those and a contradicted
 * one should trip them, and that only happens if the number they all read is the
 * number the evidence produced.
 */
export function applyChecks(draft: ReceiptExtraction): ReceiptExtraction {
  // Nothing was read: the floor already blanked it, and multiplying zero
  // evidence by zero figures would only manufacture a number.
  if (!draft.amount && !draft.lineItems.length) return draft;

  const v: MathVerdict = verify({
    amount: draft.amount,
    subtotal: draft.subtotal,
    serviceCharge: draft.serviceCharge,
    tax: draft.tax,
    rounding: draft.rounding,
    total: draft.total,
    lineItems: draft.lineItems,
  });

  return {
    ...draft,
    // Repairs only ever fill blanks (see receiptMath.verify), so taking the
    // repaired figures cannot overwrite something the model actually read.
    subtotal: v.repaired.subtotal,
    total: v.repaired.total,
    amount: v.repaired.amount,
    confidence: Math.min(1, Math.max(0, Math.round(draft.confidence * v.factor * 100) / 100)),
    checks: {
      confirmed: v.confirmed,
      conflicts: v.conflicts,
      repairs: v.repairs.map((r) => ({ field: String(r.field), value: r.value, because: r.because })),
      suspect: v.conflicts[0]?.suspect ?? null,
    },
  };
}

// ── The second pass ─────────────────────────────────────────────────────────
//
// Asked for ONLY when the receipt's own subtotal proves rows are missing, and
// asked ONLY about the rows.
//
// A vision model reading a long till roll does not fail loudly. It returns eight
// tidy, correct rows out of twenty and stops, and the result looks exactly like a
// complete list of a short receipt: there is no ragged edge, no ellipsis, nothing
// on screen to distinguish "this is everything" from "this is what I got round
// to". The user cannot tell either, because the whole reason they scanned it is
// that they were not going to type twenty lines by hand.
//
// The subtotal can tell. Items summing to 61.40 under a printed subtotal of
// 148.20 is not a judgement call, it is a fact about the document, and it is what
// gates this call — so the extra token is spent on the receipts that need it and
// on no others.
//
// Narrow on purpose. The total, the merchant, the date and the currency were
// read acceptably by the first pass; re-asking for everything would put those at
// risk to fix something else, and a second opinion that quietly changes the
// merchant is a worse outcome than a short item list.
const ITEMS_SYSTEM = `You transcribe the purchased lines from a receipt image, and
nothing else. A previous read of this same image missed some of them, so the list
you produce must be COMPLETE.

Rules:
- Return EVERY purchased line printed on the receipt, in printed order, including
  rows that repeat an earlier one, cost only a few sen, or look unimportant.
- READ, DO NOT RECOGNISE. Every line must be visibly present in the image. Never
  supply an item because it is typical of this kind of shop. If you cannot read
  the itemised section at all, return an empty list — that is a correct answer,
  and inventing plausible groceries is the worst thing you can do here.
- "amount" is the line's own total, not the unit price. For "2 x 3.50  7.00" the
  amount is 7.00, with qty 2 and unitPrice 3.50.
- A discount, voucher or member saving is its own row, with "discount": true and
  a positive amount.
- Do NOT include the subtotal, service charge, tax, rounding, total, amount
  tendered, change, points or balance. Those are not purchases.`;

function itemsPrompt(target: number, gotSoFar: number, currency: string): string {
  const unit = currency ? `${currency} ` : "";
  return `List every purchased line on this receipt.

For reference, the receipt's own printed subtotal is ${unit}${target.toFixed(2)}, and a
previous read found only ${unit}${gotSoFar.toFixed(2)} of it — so lines are missing.
Use that as a check on your own completeness, NOT as a target to pad towards: if
the lines you can actually read do not reach it, return the ones you can read and
stop. A short honest list beats a padded one.

Return ONLY strict JSON:
{ "lineItems": [ { "label": string, "amount": number, "qty": number, "unitPrice": number, "discount": boolean } ] }`;
}

// ── Step 1: perceive ────────────────────────────────────────────────────────
export async function extractReceipt(
  imageBase64: string,
  mimeType: string,
  meta?: { tenantId?: string; provider?: AiProvider; userId?: string | null },
): Promise<ReceiptExtraction> {
  const raw = await aiVision(EXTRACT_PROMPT, imageBase64, {
    subjectId: meta?.userId ?? null,
    mimeType,
    system: EXTRACT_SYSTEM,
    json: true,
    fn: "extractReceipt",
    provider: meta?.provider,
    meta: { tenantId: meta?.tenantId, source: "receipt" },
  });
  const first = coerceExtraction(parseJson<Partial<ReceiptExtraction>>(raw));

  if (!itemsLookIncomplete(first)) return first;

  try {
    const more = await aiVision(
      itemsPrompt(first.subtotal, itemsTotal(first.lineItems), first.currency),
      imageBase64,
      {
        subjectId: meta?.userId ?? null,
        mimeType,
        system: ITEMS_SYSTEM,
        json: true,
        fn: "extractReceiptItems",
        provider: meta?.provider,
        meta: { tenantId: meta?.tenantId, source: "receipt" },
      },
    );
    const parsed = parseJson<{ lineItems?: Partial<ReceiptLineItem>[] }>(more);
    // Reuse the whole coercion path rather than trusting the second answer more
    // than the first: same caps, same positive-amount rule, same discount
    // handling. Confidence is carried over so the floor does not blank a list
    // that this pass was never asked to have an opinion about.
    // `coerceExtraction` takes a Partial and is where a half-formed row is
    // filtered out, so the cast is describing what the parameter already
    // tolerates rather than asserting anything about the model's answer.
    const second = coerceExtraction({
      ...first,
      lineItems: parsed.lineItems as ReceiptLineItem[] | undefined,
      confidence: first.confidence,
    });
    return applyChecks(betterItemsOf(first, second));
  } catch {
    // The first read stands. A failed second opinion is not a failed scan — the
    // user still gets the total, the merchant and whatever rows were found, with
    // the reconciliation banner telling them the list is short.
    return first;
  }
}

function itemsTotal(items: ReceiptLineItem[]): number {
  return Math.round(items.reduce((n, i) => n + (i.discount ? -i.amount : i.amount), 0) * 100) / 100;
}

/**
 * Keep whichever item list the SUBTOTAL says is better — not whichever came
 * second.
 *
 * A retry is not automatically an improvement. A model asked to try harder at a
 * list it could not read can come back with fewer rows, or with a padded one; in
 * either case the printed subtotal is the referee, and it is a referee neither
 * read can influence. Ties go to the first read, which is the one whose figures
 * everything else in the extraction was checked against.
 */
function betterItemsOf(first: ReceiptExtraction, second: ReceiptExtraction): ReceiptExtraction {
  if (!second.lineItems.length) return first;
  const target = first.subtotal;
  if (!target) return second.lineItems.length > first.lineItems.length ? { ...first, lineItems: second.lineItems, itemsTruncated: second.itemsTruncated } : first;

  const firstGap = Math.abs(target - itemsTotal(first.lineItems));
  const secondGap = Math.abs(target - itemsTotal(second.lineItems));
  return secondGap < firstGap
    ? { ...first, lineItems: second.lineItems, itemsTruncated: second.itemsTruncated }
    : first;
}

// ── Step 2: ground ──────────────────────────────────────────────────────────

export interface VendorMemory {
  vendor: string;
  count: number;
  total: number;
  amounts: number[];
  /** The bucket this household actually files this vendor under, and how often. */
  usualBucket: { id: string; label: string; timesOutOf: string } | null;
}

interface Grounding {
  buckets: { id: string; label: string; tier: number }[];
  recent: { id: string; vendor: string; amount: number; occurredAt: string }[];
  vendorHistory: VendorMemory[];
  /** Every live transaction in the window — the input to deterministic dedupe. */
  existing: ExistingTxn[];
}

// A year, not 120 days: the whole point of vendor memory is to remember the
// annual insurance renewal and the once-a-quarter dentist, which a 4-month
// window forgets. It costs one query either way.
const GROUND_DAYS = 400;

export async function ground(tenantId: string): Promise<Grounding> {
  const since = new Date();
  since.setDate(since.getDate() - GROUND_DAYS);

  const [buckets, txns] = await Promise.all([
    pbList<{ id: string; label: string; props: { bucket?: number } | null }>("nodes", {
      filter: `tenant = ${pbStr(tenantId)} && kind = 'bucket'`,
      sort: "created",
    }),
    pbList<{
      id: string;
      amount: number;
      occurred_at: string;
      voided: boolean;
      wallet_node: string;
      expand?: { vendor_node?: { label: string }; wallet_node?: { id: string; label: string } };
    }>("transactions", {
      filter: `tenant = ${pbStr(tenantId)} && occurred_at >= ${pbStr(
        since.toISOString().replace("T", " "),
      )}`,
      sort: "-occurred_at",
      expand: "vendor_node,wallet_node",
      perPage: 2000,
    }),
  ]);

  const live = txns.filter((t) => !t.voided);

  // Where this household files each vendor. Until now a user's correction was
  // thrown away — they could re-file Tesco under Groceries every single week and
  // the model would keep guessing afresh. The bucket they actually chose, last
  // time and the times before, is the strongest signal available about where the
  // next receipt from that shop belongs, and it costs nothing to remember.
  interface Agg {
    count: number;
    total: number;
    amounts: number[];
    buckets: Map<string, { label: string; n: number }>;
  }
  const byVendor = new Map<string, Agg>();

  for (const t of live) {
    const v = t.expand?.vendor_node?.label ?? "Unknown";
    const e: Agg = byVendor.get(v) ?? { count: 0, total: 0, amounts: [], buckets: new Map() };
    e.count += 1;
    e.total += Number(t.amount);
    e.amounts.push(Number(t.amount));

    const w = t.expand?.wallet_node;
    if (w?.id) {
      const b = e.buckets.get(w.id) ?? { label: w.label, n: 0 };
      b.n += 1;
      e.buckets.set(w.id, b);
    }
    byVendor.set(v, e);
  }

  const vendorHistory: VendorMemory[] = [...byVendor.entries()]
    .map(([vendor, e]) => {
      const top = [...e.buckets.entries()].sort((a, b) => b[1].n - a[1].n)[0];
      return {
        vendor,
        count: e.count,
        total: Math.round(e.total * 100) / 100,
        amounts: e.amounts.slice(0, 12),
        usualBucket: top
          ? { id: top[0], label: top[1].label, timesOutOf: `${top[1].n} of ${e.count}` }
          : null,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);

  return {
    buckets: buckets.map((b) => ({
      id: b.id,
      label: b.label,
      tier: Number(b.props?.bucket ?? 3),
    })),
    recent: live.slice(0, 40).map((t) => ({
      id: t.id,
      vendor: t.expand?.vendor_node?.label ?? "Unknown",
      amount: Number(t.amount),
      occurredAt: t.occurred_at,
    })),
    vendorHistory,
    existing: live.map((t) => ({
      id: t.id,
      vendor: t.expand?.vendor_node?.label ?? "",
      amount: Number(t.amount),
      occurredAt: t.occurred_at,
    })),
  };
}

// The bucket this household has most often used for a vendor, if any. Exported
// because the statement importer files hundreds of rows and should not need an
// AI call for a vendor the household has already made its choice about.
export function rememberedBucket(
  vendor: string,
  history: VendorMemory[],
): { id: string; label: string; reason: string } | null {
  const norm = (s: string) => s.trim().toLowerCase();
  const hit = history.find((h) => norm(h.vendor) === norm(vendor));
  if (!hit?.usualBucket) return null;
  return {
    id: hit.usualBucket.id,
    label: hit.usualBucket.label,
    reason: `You've filed ${hit.vendor} under ${hit.usualBucket.label} ${hit.usualBucket.timesOutOf} times.`,
  };
}

// ── Step 3 + 4: decide, then explain ────────────────────────────────────────
const ANALYZE_SYSTEM = `You are Honey, a careful household finance assistant for a
Malaysian family. You are given a freshly scanned receipt and the household's REAL
graph: its buckets, its recent spending, and its history with each vendor.

HoneyMoney's 3-bucket model:
  tier 1 = Must-paid (rent, bills, loans — money already promised)
  tier 2 = Savings (savings, emergency fund, goals)
  tier 3 = Spendings (groceries, food, everything discretionary)

Hard rules:
- You may ONLY choose a bucket from the list you are given, using its exact id.
  Never invent an id or a label.
- If the vendor history shows a "usualBucket" for this vendor, choose that
  bucket. The household has already made this decision — respect it. Override it
  only when the receipt itself clearly contradicts it, and say why in the reason.
- Duplicate detection is done arithmetically before you see this, so do not
  hunt for duplicates. Leave "duplicateOf" as null.
- Only flag an anomaly against THIS household's own history with THIS vendor. A
  RM 60 grocery run is not an anomaly. RM 60 at a vendor they've only ever spent
  RM 8 at is.
- Be marital-safe: this is read by both partners. Never blame, never moralise,
  never use words like "overspending", "wasteful" or "you should". State what
  changed and what it means. Neutral, kind, factual.
- This is education, not licensed financial advice. Never tell them to buy,
  sell, or invest in anything.
- If you have nothing useful to say, say so briefly. A bland insight is worse
  than none.`;

function analyzePrompt(extraction: ReceiptExtraction, g: Grounding): string {
  return `SCANNED RECEIPT
${JSON.stringify(extraction, null, 2)}

HOUSEHOLD BUCKETS (choose one id, or null)
${JSON.stringify(g.buckets, null, 2)}

RECENT SPENDING (newest first)
${JSON.stringify(g.recent, null, 2)}

THIS HOUSEHOLD'S HISTORY BY VENDOR
(usualBucket = the bucket they actually file this vendor under. Prefer it.)
${JSON.stringify(g.vendorHistory, null, 2)}

Return ONLY strict JSON:
{
  "bucket": { "nodeId": string, "label": string, "reason": string } | null,
  "subscription": { "likely": boolean, "cadence": string, "note": string } | null,
  "anomaly": { "flagged": boolean, "note": string } | null,
  "insight": string
}`;
}

interface RawAnalysis {
  bucket?: { nodeId?: string; label?: string; reason?: string } | null;
  subscription?: { likely?: boolean; cadence?: string; note?: string } | null;
  anomaly?: { flagged?: boolean; note?: string } | null;
  insight?: string;
}

export async function analyzeReceipt(
  tenantId: string,
  extraction: ReceiptExtraction,
  provider?: AiProvider,
  grounding?: Grounding,
  userId?: string | null,
): Promise<ReceiptAnalysis> {
  const g = grounding ?? (await ground(tenantId));

  // Arithmetic, not opinion. Runs before the model and independently of it, so a
  // duplicate is caught even when the analysis step fails outright.
  const duplicateOf = duplicateFor(extraction, g);

  const raw = await aiGenerate(analyzePrompt(extraction, g), {
    subjectId: userId ?? null,
    system: ANALYZE_SYSTEM,
    json: true,
    fn: "analyzeReceipt",
    // The prompt carries this household's bucket list, recent spending and full
    // vendor history as JSON. Nothing about it is de-identified.
    dataClass: 2,
    provider,
    meta: { tenantId, source: "receipt" },
  });
  const a = parseJson<RawAnalysis>(raw);

  // Re-validate the bucket id against the real graph. A model that hallucinates
  // one would otherwise send a spend into a bucket that doesn't exist.
  const proposed = g.buckets.find((b) => b.id === a.bucket?.nodeId);
  const remembered = rememberedBucket(extraction.vendor, g.vendorHistory);

  // The household's own filing history outranks the model. If they have put this
  // vendor in a bucket before, that IS the answer; the model only gets to decide
  // for vendors they've never seen.
  const bucket = remembered
    ? { nodeId: remembered.id, label: remembered.label, reason: remembered.reason }
    : proposed
      ? { nodeId: proposed.id, label: proposed.label, reason: String(a.bucket?.reason ?? "").slice(0, 200) }
      : null;

  return {
    bucket,
    duplicateOf,
    subscription: a.subscription?.likely
      ? {
          likely: true,
          cadence: String(a.subscription.cadence ?? "monthly").slice(0, 30),
          note: String(a.subscription.note ?? "").slice(0, 200),
        }
      : null,
    anomaly: a.anomaly?.flagged
      ? { flagged: true, note: String(a.anomaly.note ?? "").slice(0, 200) }
      : null,
    insight: String(a.insight ?? "").slice(0, 400),
  };
}

function duplicateFor(e: ReceiptExtraction, g: Grounding): DuplicateMatch | null {
  if (!e.vendor || !(e.amount > 0)) return null;
  // A receipt with no readable date is treated as "today" for the purpose of
  // asking "did I already log this?", which is what the user means when they
  // scan the same slip twice in a row.
  const when = e.occurredAt || new Date().toISOString();
  return findDuplicate({ vendor: e.vendor, amount: e.amount, occurredAt: when }, g.existing);
}

// The whole pipeline. Extraction is the part the user actually needs; if the
// analysis step fails we still hand back the extraction rather than failing the
// scan outright.
export async function readReceipt(
  tenantId: string,
  imageBase64: string,
  mimeType: string,
  userId?: string | null,
): Promise<ReceiptResult> {
  const provider = activeAiProvider();
  if (!isProviderConfigured(provider)) {
    throw new Error(
      `AI is not configured (AI_PROVIDER=${provider}). The app still scans on-device — see docs/AI_SETUP.md.`,
    );
  }

  const extraction = await extractReceipt(imageBase64, mimeType, { tenantId, provider, userId });
  const g = await ground(tenantId);

  try {
    const analysis = await analyzeReceipt(tenantId, extraction, provider, g, userId);
    return { extraction, analysis, provider };
  } catch (err) {
    // The reasoning step is the part that can fail; the two things that actually
    // protect the ledger cannot. The duplicate check is arithmetic and the bucket
    // comes from the household's own filing history — so when the model is down
    // or rate-limited we still hand back both, rather than nothing.
    const remembered = rememberedBucket(extraction.vendor, g.vendorHistory);
    return {
      extraction,
      analysis: {
        bucket: remembered
          ? { nodeId: remembered.id, label: remembered.label, reason: remembered.reason }
          : null,
        duplicateOf: duplicateFor(extraction, g),
        subscription: null,
        anomaly: null,
        insight: "",
      },
      provider,
      degraded: err instanceof Error ? err.message : "Analysis step failed",
    };
  }
}
