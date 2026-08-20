import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { addManualTransaction, createGraphNode, createAllocationEdge } from "@/lib/graph";
import { AuthError, can, requirePermission } from "@/lib/household";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";

// POST /api/graph — one flexible endpoint for adding to the knowledge graph.
// { entity: "income" | "bucket" | "spend" | "allocation", ... }
// Keeps the graph editable across individual / couple / family without a schema
// change — a "subject matter" is just props.subject.
//
// The tenant comes from the session. It used to come from the request body,
// defaulting to the demo household, with no auth check at all — which meant an
// unauthenticated caller could write into any household by guessing its id.
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    // Adding a spend is the everyday action (a child may do it); reshaping the
    // graph — income streams, buckets, allocations — is not.
    const ctx = await requirePermission("add_record");

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const tenantId = ctx.tenant.id;
    const entity = body.entity as string;

    if (entity !== "spend" && !can(ctx.accessRole, "manage_graph")) {
      throw new AuthError(`Your role (${ctx.accessRole}) cannot change the household's plan.`, 403);
    }

    const num = (v: unknown) => Number(v);
    const subject = typeof body.subject === "string" && body.subject.trim() ? { subject: body.subject.trim() } : {};

    if (entity === "income") {
      const monthly = num(body.monthly);
      if (!Number.isFinite(monthly) || monthly < 0) return NextResponse.json({ error: "monthly must be ≥ 0" }, { status: 400 });
      const node = await createGraphNode(tenantId, {
        kind: "income_source",
        label: String(body.label ?? ""),
        props: { monthly_amount: monthly, cadence: "monthly", ...subject },
      });
      return NextResponse.json({ ok: true, node });
    }

    if (entity === "bucket") {
      const tier = num(body.tier) || 3;
      const node = await createGraphNode(tenantId, {
        kind: "bucket",
        label: String(body.label ?? ""),
        props: { bucket: tier, ...subject },
      });
      return NextResponse.json({ ok: true, node });
    }

    if (entity === "allocation") {
      const rel = body.percentage != null && body.amount == null ? "ALLOCATES_PCT" : "ALLOCATES_FIXED";
      const edge = await createAllocationEdge(tenantId, {
        srcNode: String(body.srcNode ?? ""),
        dstNode: String(body.dstNode ?? ""),
        rel,
        amount: num(body.amount),
        percentage: num(body.percentage),
      });
      return NextResponse.json({ ok: true, edge });
    }

    if (entity === "spend") {
      const amount = num(body.amount);
      if (!body.walletNodeId || !String(body.vendorLabel ?? "").trim()) {
        return NextResponse.json({ error: "walletNodeId and vendorLabel are required" }, { status: 400 });
      }
      if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });
      const stored = await addManualTransaction(
        tenantId,
        {
          vendorLabel: String(body.vendorLabel).trim(),
          amount,
          walletNodeId: String(body.walletNodeId),
          // A child logs only their own spending.
          memberId:
            ctx.accessRole === "child"
              ? ctx.memberId
              : body.memberId
                ? String(body.memberId)
                : undefined,
          occurredAt: body.occurredAt ? String(body.occurredAt) : undefined,
          source: body.source ? String(body.source) : "manual",
          note: body.note ? String(body.note) : undefined,
          confidence: body.confidence != null ? num(body.confidence) : undefined,
          entered: body.entered as
            | { amount: number; currency: string; perMYR: number; rateSource: string }
            | undefined,
        },
        { id: ctx.user.id, email: ctx.user.email },
      );
      return NextResponse.json({ ok: true, stored });
    }

    return NextResponse.json({ error: `Unknown entity "${entity}"` }, { status: 400 });
  } catch (err) {
    return apiError(err);
  }
}
