import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { addManualTransaction } from "@/lib/graph";
import { record as recordEvent, recordFirstExpense } from "@/lib/productEvents";
import { AuthError, requirePermission } from "@/lib/household";
import { isLocalOnly } from "@/lib/storageModeStore";
import { apiError } from "@/lib/apiError";
import { decodeAttachments, type IncomingAttachment } from "@/lib/attachments";
import type { Category } from "@/lib/recordKind";
import type { Visibility } from "@/lib/attribution";

export const runtime = "nodejs";

// POST /api/transactions — manual entry from the dashboard form.
// { walletNodeId, vendorLabel, amount, occurredAt?, memberId?, note?, entered? }
//
// The tenant comes from the *session*, never from the request body. Previously
// this route took `tenantId` from the caller and had no session check at all,
// which let anyone write into anyone's household.
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const ctx = await requirePermission("add_record");

    // The storage mode is a GUARANTEE, and a guarantee has to be enforced where
    // the write happens rather than where the button is. A household that chose
    // local-only was told we would not store their records; a UI that merely
    // declines to call this route would make that a promise about our
    // front-end, which is not what they agreed to. Anything reaching here --
    // an old tab, a queued offline capture replaying, a hand-made request --
    // is refused.
    //
    // 409 rather than 403: the caller is entitled to write, the household has
    // simply chosen somewhere else for it to go, and the response says where.
    if (await isLocalOnly(ctx.tenant.id)) {
      return NextResponse.json(
        {
          error:
            "This household keeps its records on its own devices. Nothing is stored on our server, including this.",
          storageMode: "local_only",
          storeLocallyAt: "/vault",
        },
        { status: 409 },
      );
    }

    let body: {
      walletNodeId?: string;
      vendorLabel?: string;
      amount?: number;
      direction?: "out" | "in";
      occurredAt?: string;
      memberId?: string;
      note?: string;
      confidence?: number;
      entered?: { amount: number; currency: string; perMYR: number; rateSource: string };
      attachments?: IncomingAttachment[];
      // ⚠️ THESE WERE SENT BY THE FORM AND SILENTLY DISCARDED. The dashboard has
      // posted category, paidBy, visibility and attributionAsserted since Task 1
      // and Task 6, and this route neither typed nor forwarded them — so `kind`
      // was inferred from `direction` alone, `category` was never stored (every
      // existing row reads "(none)"), and the attribution and privacy the user
      // chose were dropped on the floor. The one that matters most: a `+ Savings`
      // deposit needs its category to be recorded as a TRANSFER instead of an
      // inflow, which is the whole point of lib/recordKind.ts.
      category?: Category;
      paidBy?: string;
      visibility?: Visibility;
      excludeFromTotals?: boolean;
      attributionAsserted?: boolean;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const amount = Number(body.amount);
    // A bucket is required for money LEAVING a bucket, and not for money coming
    // in: income arrives from outside the household and the ALLOCATES edges
    // decide where it lands. Requiring it unconditionally is why the capture
    // form had to send something and defaulted to Must-paid, filing every salary
    // against the rent bucket. `savings` still carries one — it is a transfer
    // into a tier-2 bucket, and it arrives here as direction "in", so the test
    // is on the CATEGORY, not the direction.
    const isInflowWithoutBucket =
      body.direction === "in" && body.category !== "savings";
    if (!body.vendorLabel?.trim()) {
      return NextResponse.json({ error: "vendorLabel is required" }, { status: 400 });
    }
    if (!body.walletNodeId && !isInflowWithoutBucket) {
      return NextResponse.json(
        { error: "walletNodeId is required for money leaving a bucket" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }

    // A 400 rather than a 500: an oversized photo is the user's to fix, and this
    // message is shown to them verbatim.
    let attachments;
    try {
      attachments = decodeAttachments(body.attachments);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid attachment" },
        { status: 400 },
      );
    }

    const stored = await addManualTransaction(
      ctx.tenant.id,
      {
        attachments,
        vendorLabel: body.vendorLabel.trim(),
        amount,
        direction: body.direction === "in" ? "in" : "out",
        walletNodeId: body.walletNodeId,
        occurredAt: body.occurredAt,
        // A child logs only their own spending — they can't attribute a spend
        // to someone else in the household.
        memberId: ctx.accessRole === "child" ? ctx.memberId : body.memberId,
        note: body.note,
        confidence: body.confidence,
        entered: body.entered,
        category: body.category,
        paidBy: body.paidBy,
        visibility: body.visibility,
        excludeFromTotals: body.excludeFromTotals === true,
        attributionAsserted: body.attributionAsserted,
      },
      { id: ctx.user.id, email: ctx.user.email },
    );
    // Frequency, and — the first time only — activation. `firstExpense` is
    // idempotent by unique index rather than by a lookup, so this costs one
    // write that usually fails harmlessly instead of a read on every save.
    recordEvent("expense_logged", ctx.user.id, ctx.tenant.id);
    recordFirstExpense(ctx.user.id, ctx.tenant.id);

    return NextResponse.json({ ok: true, stored });
  } catch (err) {
    if (err instanceof AuthError) return apiError(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
