import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { createGoal, adjustGoalManual, updateGoal, deleteGoal } from "@/lib/goals";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";

// POST /api/goals — create a savings goal (own target).
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  let body: {
    name?: string;
    target?: number;
    category?: string;
    targetDate?: string;
    owner?: string | null;
    visibility?: "shared" | "private";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    await createGoal({
      name: body.name ?? "",
      target: Number(body.target),
      category: body.category,
      targetDate: body.targetDate,
      owner: body.owner ?? null,
      visibility: body.visibility,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

// PATCH /api/goals — edit a goal, or adjust its MANUAL half.
//
// The two are separate operations on purpose. Editing a target must not touch
// progress, and adding a manual adjustment must not look like tracked progress;
// one endpoint that took "the new numbers" would make both mistakes easy.
export async function PATCH(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  let body: {
    goalId?: string;
    /** Adjust the manual half by this much. May be negative to correct it. */
    manualDelta?: number;
    name?: string;
    target?: number;
    targetDate?: string | null;
    owner?: string | null;
    visibility?: "shared" | "private";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.goalId) return NextResponse.json({ error: "goalId is required" }, { status: 400 });
  try {
    if (body.manualDelta !== undefined) {
      const result = await adjustGoalManual(body.goalId, Number(body.manualDelta));
      return NextResponse.json({ ok: true, ...result });
    }
    await updateGoal(body.goalId, {
      name: body.name,
      target: body.target,
      targetDate: body.targetDate,
      owner: body.owner,
      visibility: body.visibility,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

// DELETE /api/goals — remove a goal. Its records are UNLINKED, never deleted.
export async function DELETE(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  let body: { goalId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.goalId) return NextResponse.json({ error: "goalId is required" }, { status: 400 });
  try {
    const result = await deleteGoal(body.goalId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return apiError(err);
  }
}
