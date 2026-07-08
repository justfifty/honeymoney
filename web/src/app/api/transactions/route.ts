import { NextResponse } from "next/server";
import { isDatabaseConfigured, config } from "@/lib/config";
import { addManualTransaction } from "@/lib/graph";

export const runtime = "nodejs";

// POST /api/transactions — manual entry from the dashboard form.
// { tenantId?, walletNodeId, vendorLabel, amount, occurredAt? }
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  let body: {
    tenantId?: string;
    walletNodeId?: string;
    vendorLabel?: string;
    amount?: number;
    occurredAt?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tenantId = body.tenantId || config.demoTenantId;
  const amount = Number(body.amount);
  if (!tenantId || !body.walletNodeId || !body.vendorLabel?.trim()) {
    return NextResponse.json(
      { error: "walletNodeId and vendorLabel are required" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  try {
    const stored = await addManualTransaction(tenantId, {
      vendorLabel: body.vendorLabel.trim(),
      amount,
      walletNodeId: body.walletNodeId,
      occurredAt: body.occurredAt,
    });
    return NextResponse.json({ ok: true, stored });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
