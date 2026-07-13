import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { getTransaction, setTransactionVoided, updateTransaction, type TxnPatch } from "@/lib/graph";
import { AuthError, can, requireContext } from "@/lib/household";
import { historyFor } from "@/lib/ledger";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";

// Correcting or removing a spend. Both go through the ledger — an edit keeps
// the old values, a delete is a reversible void. Nothing is ever destroyed.

// A child may only touch their own records; adults and owners may touch any.
async function authorize(id: string, action: "edit" | "void") {
  const ctx = await requireContext();
  const txn = await getTransaction(ctx.tenant.id, id);
  if (!txn) throw new AuthError("No such record in this household.", 404);

  const isOwn = txn.member === ctx.memberId;
  const allowed =
    action === "void"
      ? can(ctx.accessRole, "void_record")
      : can(ctx.accessRole, "edit_any_record") || (isOwn && can(ctx.accessRole, "edit_own_record"));

  if (!allowed) {
    throw new AuthError(
      isOwn
        ? `Your role (${ctx.accessRole}) cannot do that.`
        : "You can only change records you added yourself.",
      403,
    );
  }
  return { ctx, txn };
}

// GET /api/transactions/:id — the record plus its full change history.
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const { id } = await context.params;
    const ctx = await requireContext();
    const txn = await getTransaction(ctx.tenant.id, id);
    if (!txn) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!can(ctx.accessRole, "view_all") && txn.member !== ctx.memberId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ txn, history: await historyFor(ctx.tenant.id, id) });
  } catch (err) {
    return apiError(err);
  }
}

// PATCH /api/transactions/:id — correct a mis-parsed capture.
// { vendorLabel?, amount?, walletNodeId?, occurredAt?, memberId?, note?, entered? }
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const { id } = await context.params;
    const { ctx } = await authorize(id, "edit");

    let body: TxnPatch;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const patch: TxnPatch = {};
    if (body.vendorLabel !== undefined) patch.vendorLabel = String(body.vendorLabel).trim();
    if (body.amount !== undefined) patch.amount = Number(body.amount);
    if (body.walletNodeId !== undefined) patch.walletNodeId = body.walletNodeId;
    if (body.occurredAt !== undefined) patch.occurredAt = body.occurredAt;
    if (body.memberId !== undefined) patch.memberId = body.memberId || null;
    if (body.note !== undefined) patch.note = String(body.note);
    if (body.entered !== undefined) patch.entered = body.entered;

    const txn = await updateTransaction(ctx.tenant.id, id, patch, {
      id: ctx.user.id,
      email: ctx.user.email,
    });
    return NextResponse.json({ ok: true, txn });
  } catch (err) {
    return apiError(err);
  }
}

// DELETE /api/transactions/:id       — void it (reversible, fully audited).
// DELETE /api/transactions/:id?undo=1 — restore a voided record.
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const { id } = await context.params;
    const { ctx } = await authorize(id, "void");
    const url = new URL(request.url);
    const undo = url.searchParams.get("undo") === "1";
    const reason = url.searchParams.get("reason") ?? undefined;

    const txn = await setTransactionVoided(
      ctx.tenant.id,
      id,
      !undo,
      { id: ctx.user.id, email: ctx.user.email },
      reason,
    );
    return NextResponse.json({ ok: true, txn, voided: txn.voided });
  } catch (err) {
    return apiError(err);
  }
}
