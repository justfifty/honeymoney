import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { requirePermission } from "@/lib/household";
import { pbList, pbStr, pbUpdate } from "@/lib/pocketbase";
import { addManualTransaction } from "@/lib/graph";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";

// The import commit and its rollback.
//
// PARSING IS NOT HERE, and that is the point. lib/csv.ts runs in the BROWSER, so
// a bank statement — the most sensitive file a household owns, carrying full
// merchant history, balances and account identifiers — never leaves the user's
// machine. What reaches this route is only the rows the user reviewed and
// approved: date, description, amount, direction, bucket. Not the file, not the
// columns they rejected, not the balance column.
//
// Nothing here goes to any model either, per Task 10. Categorisation suggestions
// are pattern-matched client-side; a merchant name is still merchant history.

const MAX_ROWS = 2000;

interface IncomingRow {
  occurredAt: string;
  vendorLabel: string;
  amount: number;
  direction: "in" | "out";
  walletNodeId: string;
  memberId?: string;
  note?: string;
  importKey: string;
}

// POST /api/import — commit a reviewed batch.
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const ctx = await requirePermission("add_record");

    let body: { rows?: IncomingRow[]; source?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return NextResponse.json({ error: "Nothing to import" }, { status: 400 });
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `That's ${rows.length} rows; the limit is ${MAX_ROWS} per import.` },
        { status: 400 },
      );
    }

    // One id for the whole batch, so the entire import can be selected — and
    // undone — as a single thing.
    const batch = `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    // Re-check for duplicates SERVER-SIDE against what is already stored. The
    // client flagged them too, but the client's view is a snapshot: a second
    // device, or a second tab, may have committed the same statement in between.
    // The cost of being wrong here is a doubled ledger.
    const keys = rows.map((r) => r.importKey).filter(Boolean);
    const existingKeys = new Set<string>();
    if (keys.length) {
      const existing = await pbList<{ import_key?: string }>("transactions", {
        filter: `tenant = ${pbStr(ctx.tenant.id)} && import_key != ''`,
        perPage: 2000,
      });
      for (const e of existing) if (e.import_key) existingKeys.add(e.import_key);
    }

    const created: string[] = [];
    const skipped: string[] = [];
    const failed: { row: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.importKey && existingKeys.has(r.importKey)) {
        skipped.push(r.importKey);
        continue;
      }
      try {
        const stored = await addManualTransaction(
          ctx.tenant.id,
          {
            vendorLabel: String(r.vendorLabel || "").trim() || "Unknown",
            amount: Number(r.amount),
            direction: r.direction === "in" ? "in" : "out",
            walletNodeId: String(r.walletNodeId),
            occurredAt: r.occurredAt,
            memberId: ctx.accessRole === "child" ? ctx.memberId : r.memberId,
            note: r.note,
            source: "import",
          },
          { id: ctx.user.id, email: ctx.user.email },
        );
        // Stamped after creation: addManualTransaction owns the ledger append,
        // and threading two more fields through it for one caller would put
        // import concerns into the shared write path.
        await pbUpdate("transactions", stored.transactionId, {
          import_batch: batch,
          import_key: r.importKey ?? "",
        });
        created.push(stored.transactionId);
        if (r.importKey) existingKeys.add(r.importKey); // guards against dupes WITHIN the batch
      } catch (err) {
        // One bad row must not abandon the other 399 — and it must not vanish
        // either. Reported by index so the preview can point at it.
        failed.push({ row: i, error: err instanceof Error ? err.message : "Could not save" });
      }
    }

    return NextResponse.json({
      ok: true,
      batch,
      created: created.length,
      skipped: skipped.length,
      failed,
    });
  } catch (err) {
    return apiError(err);
  }
}

// DELETE /api/import — roll a whole batch back, in one action.
//
// VOIDS rather than deletes. "Records can be changed, but every change is
// recorded" is the ledger's premise, and a batch that vanished without trace
// would be the one operation in the app able to remove money from history
// silently. A voided row is excluded from every figure and still visible under
// "show removed".
export async function DELETE(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const ctx = await requirePermission("void_record");

    let body: { batch?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body.batch) return NextResponse.json({ error: "batch is required" }, { status: 400 });

    const rows = await pbList<{ id: string }>("transactions", {
      filter: `tenant = ${pbStr(ctx.tenant.id)} && import_batch = ${pbStr(body.batch)} && voided != true`,
      perPage: 2000,
    });

    let voided = 0;
    for (const t of rows) {
      await pbUpdate("transactions", t.id, { voided: true });
      voided++;
    }

    return NextResponse.json({ ok: true, voided });
  } catch (err) {
    return apiError(err);
  }
}
