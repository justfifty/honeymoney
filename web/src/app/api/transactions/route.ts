import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { addManualTransaction } from "@/lib/graph";
import { AuthError, requirePermission } from "@/lib/household";
import { apiError } from "@/lib/apiError";

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

    let body: {
      walletNodeId?: string;
      vendorLabel?: string;
      amount?: number;
      occurredAt?: string;
      memberId?: string;
      note?: string;
      confidence?: number;
      entered?: { amount: number; currency: string; perMYR: number; rateSource: string };
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const amount = Number(body.amount);
    if (!body.walletNodeId || !body.vendorLabel?.trim()) {
      return NextResponse.json(
        { error: "walletNodeId and vendorLabel are required" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }

    const stored = await addManualTransaction(
      ctx.tenant.id,
      {
        vendorLabel: body.vendorLabel.trim(),
        amount,
        walletNodeId: body.walletNodeId,
        occurredAt: body.occurredAt,
        // A child logs only their own spending — they can't attribute a spend
        // to someone else in the household.
        memberId: ctx.accessRole === "child" ? ctx.memberId : body.memberId,
        note: body.note,
        confidence: body.confidence,
        entered: body.entered,
      },
      { id: ctx.user.id, email: ctx.user.email },
    );
    return NextResponse.json({ ok: true, stored });
  } catch (err) {
    if (err instanceof AuthError) return apiError(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
