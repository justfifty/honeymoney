// Deterministic duplicate detection.
//
// The receipt agent can *suspect* a duplicate, but a model's hunch is the wrong
// thing to bet a ledger on: it sees only a window of recent rows, and it will
// occasionally invent a match or miss an obvious one. This module decides the
// question arithmetically — same merchant, same money, same day — so the answer
// is the same every time and can be trusted enough to act on.
//
// It matters most for statement import, where re-uploading an overlapping
// statement is not an edge case but the normal way people use the feature: you
// import January, then in February you import a statement whose first week
// overlaps what you already have.
//
// The bias is deliberately toward false *negatives*. A missed duplicate costs
// the user one manual void. A false duplicate that we silently skip loses a
// real spend, and they may never notice.

import { pbList, pbStr } from "./pocketbase";

export interface TxnLike {
  vendor: string;
  amount: number;
  occurredAt: string; // ISO 8601
}

export interface ExistingTxn extends TxnLike {
  id: string;
}

export type Certainty = "exact" | "likely";

export interface DuplicateMatch extends ExistingTxn {
  certainty: Certainty;
  why: string;
}

// Merchant strings arrive spelled a dozen ways: OCR'd from a crumpled receipt
// ("99 SPEED MART"), typed by a human ("99 Speedmart"), or lifted from a card
// descriptor ("99 SPEEDMART 1234 KL"). Strip everything that varies and keep
// what identifies the shop.
const NOISE = /\b(sdn\s*bhd|sdn|bhd|berhad|enterprise|trading|holdings|group|store|outlet|branch)\b/g;

export function normalizeVendor(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // punctuation, *, -, & …
    .replace(NOISE, " ")
    .replace(/\s+/g, "");
}

function dayOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function hoursApart(a: string, b: string): number {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(ta - tb) / 3_600_000;
}

// A stable key for one payment. Two rows with the same fingerprint are the same
// payment as far as this app is concerned. Used to dedupe *within* a batch — a
// statement that lists the same charge on two pages, say — before we ever go
// near the database.
export function fingerprint(t: TxnLike): string {
  return `${normalizeVendor(t.vendor)}|${t.amount.toFixed(2)}|${dayOf(t.occurredAt)}`;
}

// Same shop, same money, same day → the same payment. Same shop and money but a
// day or two apart is only "likely": a daily RM 5.50 kopi at the same kedai is a
// real pattern, not a duplicate, so the window is deliberately short and the
// verdict deliberately soft.
export function findDuplicate(candidate: TxnLike, existing: ExistingTxn[]): DuplicateMatch | null {
  const vendor = normalizeVendor(candidate.vendor);
  if (!vendor || !(candidate.amount > 0)) return null;

  const day = dayOf(candidate.occurredAt);
  let best: DuplicateMatch | null = null;

  for (const e of existing) {
    if (normalizeVendor(e.vendor) !== vendor) continue;

    const gap = Math.abs(e.amount - candidate.amount);
    if (gap > 0.02) continue;

    if (day && dayOf(e.occurredAt) === day) {
      // Nothing beats this — stop looking.
      return {
        ...e,
        certainty: "exact",
        why: `Already recorded on ${day}: ${e.vendor} RM ${e.amount.toFixed(2)}.`,
      };
    }

    const hours = hoursApart(e.occurredAt, candidate.occurredAt);
    if (hours <= 48 && !best) {
      best = {
        ...e,
        certainty: "likely",
        why: `A ${e.vendor} payment of RM ${e.amount.toFixed(2)} is already recorded within ${Math.round(hours)}h.`,
      };
    }
  }

  return best;
}

// Dedupe a batch against itself *and* against what's already stored. Returns one
// verdict per input row, in order — the statement importer needs to show the
// user every row, including the ones it wants to skip.
export function findDuplicates(
  candidates: TxnLike[],
  existing: ExistingTxn[],
): (DuplicateMatch | null)[] {
  const seen = new Map<string, number>(); // fingerprint -> index of first occurrence
  return candidates.map((c, i) => {
    const inDb = findDuplicate(c, existing);
    if (inDb) return inDb;

    const fp = fingerprint(c);
    const first = seen.get(fp);
    if (first !== undefined) {
      return {
        id: "",
        vendor: c.vendor,
        amount: c.amount,
        occurredAt: c.occurredAt,
        certainty: "exact",
        why: `This statement lists the same payment twice (also on row ${first + 1}).`,
      };
    }
    seen.set(fp, i);
    return null;
  });
}

interface PBTxn {
  id: string;
  amount: number;
  occurred_at: string;
  voided: boolean;
  expand?: { vendor_node?: { label: string } };
}

// The rows a new capture could collide with. Voided rows are excluded: the user
// already deleted that spend, so re-entering it is a correction, not a mistake.
export async function loadExisting(tenantId: string, days = 400): Promise<ExistingTxn[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await pbList<PBTxn>("transactions", {
    filter: `tenant = ${pbStr(tenantId)} && occurred_at >= ${pbStr(since.toISOString().replace("T", " "))}`,
    sort: "-occurred_at",
    expand: "vendor_node",
    perPage: 2000,
  });

  return rows
    .filter((r) => !r.voided)
    .map((r) => ({
      id: r.id,
      vendor: r.expand?.vendor_node?.label ?? "",
      amount: Number(r.amount),
      occurredAt: r.occurred_at,
    }));
}
