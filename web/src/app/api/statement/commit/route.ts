import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { requirePermission } from "@/lib/household";
import { addManualTransaction, listBuckets } from "@/lib/graph";
import { findDuplicate, loadExisting, type ExistingTxn } from "@/lib/dedupe";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";

const MAX_ROWS = 500;

interface CommitRow {
  vendor?: string;
  description?: string;
  amount?: number;
  occurredAt?: string;
  walletNodeId?: string;
  memberId?: string;
  foreign?: { amount: number; currency: string } | null;
  /** The user saw the duplicate warning and said import it anyway. */
  force?: boolean;
}

interface Saved {
  index: number;
  transactionId: string;
  vendor: string;
  amount: number;
  bucket: string;
}

interface Skipped {
  index: number;
  vendor: string;
  amount: number;
  reason: string;
}

// POST /api/statement/commit — save the rows the user ticked.
// { rows: CommitRow[], statement?: { issuer, cardLast4, statementDate } }
export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const ctx = await requirePermission("add_record");

    let body: { rows?: CommitRow[]; statement?: { issuer?: string; cardLast4?: string; statementDate?: string } };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const rows = body.rows ?? [];
    if (!rows.length) return NextResponse.json({ error: "No rows to import." }, { status: 400 });
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `That's ${rows.length} rows — import at most ${MAX_ROWS} at a time.` },
        { status: 413 },
      );
    }

    const buckets = await listBuckets(ctx.tenant.id);
    const bucketIds = new Set(buckets.map((b) => b.id));

    // Re-check duplicates here, server-side. The browser was shown a proposal a
    // few minutes ago; in the meantime the same rows may have been imported in
    // another tab, or by a partner on their phone. The client's opinion about
    // what is already in the books is not one we can safely trust.
    const existing: ExistingTxn[] = await loadExisting(ctx.tenant.id);

    const saved: Saved[] = [];
    const skipped: Skipped[] = [];

    // Sequential, not parallel. Every write appends to a hash chain whose seq
    // must be contiguous (lib/ledger.ts); firing 90 of them at once would have
    // them collide on (tenant, seq) and burn their retries fighting each other.
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const vendor = (r.vendor || r.description || "").trim().slice(0, 80);
      const amount = Number(r.amount);
      const when = r.occurredAt ? new Date(r.occurredAt) : null;

      if (!vendor || !Number.isFinite(amount) || amount <= 0 || !when || Number.isNaN(when.getTime())) {
        skipped.push({ index: i, vendor, amount, reason: "Incomplete row." });
        continue;
      }
      if (!r.walletNodeId || !bucketIds.has(r.walletNodeId)) {
        skipped.push({ index: i, vendor, amount, reason: "No bucket chosen." });
        continue;
      }

      const candidate = { vendor, amount, occurredAt: when.toISOString() };
      const dupe = findDuplicate(candidate, existing);
      if (dupe?.certainty === "exact" && !r.force) {
        skipped.push({ index: i, vendor, amount, reason: dupe.why });
        continue;
      }

      const stored = await addManualTransaction(
        ctx.tenant.id,
        {
          vendorLabel: vendor,
          amount,
          walletNodeId: r.walletNodeId,
          occurredAt: when.toISOString(),
          memberId: r.memberId || undefined,
          source: "statement",
          note: buildNote(r, body.statement),
          // The bank told us the exact figure. There is nothing to be unsure of
          // — unlike a photo of a crumpled receipt, this is the number of record.
          confidence: 1,
          // A row billed abroad: keep what the card was actually charged in, and
          // the rate the issuer used. Months later "RM 42.10" alone is
          // unauditable; "S$ 12.00 at the issuer's rate" is not.
          ...(r.foreign && r.foreign.currency && r.foreign.currency !== "MYR" && r.foreign.amount > 0
            ? {
                entered: {
                  amount: r.foreign.amount,
                  currency: r.foreign.currency,
                  perMYR: Math.round((r.foreign.amount / amount) * 10000) / 10000,
                  rateSource: "card issuer (statement)",
                },
              }
            : {}),
        },
        { id: ctx.user.id, email: ctx.user.email },
      );

      saved.push({
        index: i,
        transactionId: stored.transactionId,
        vendor,
        amount,
        bucket: stored.walletLabel,
      });

      // Keep the in-memory view current so two identical rows in one batch can't
      // both slip through.
      existing.push({ id: stored.transactionId, ...candidate });
    }

    return NextResponse.json({
      ok: true,
      saved: saved.length,
      skipped: skipped.length,
      total: Math.round(saved.reduce((n, s) => n + s.amount, 0) * 100) / 100,
      rows: saved,
      skippedRows: skipped,
    });
  } catch (err) {
    return apiError(err);
  }
}

// The raw descriptor is the evidence. "GRABFOOD*ORDER 4Y2K KUALA LUMPUR MY" is
// what the bank actually printed; "GrabFood" is our reading of it. Keeping both
// means a figure queried in a year's time can still be traced to its source.
function buildNote(
  r: CommitRow,
  statement?: { issuer?: string; cardLast4?: string; statementDate?: string },
): string {
  const bits: string[] = [];
  if (r.description && r.description !== r.vendor) bits.push(r.description);
  const card = [statement?.issuer, statement?.cardLast4 && `••${statement.cardLast4}`]
    .filter(Boolean)
    .join(" ");
  if (card) bits.push(card);
  return bits.join(" · ").slice(0, 300);
}
