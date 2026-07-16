import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { createGoal, contributeGoal } from "@/lib/goals";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";

// POST /api/goals — create a savings goal (own target).
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  let body: { name?: string; target?: number; category?: string; targetDate?: string };
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
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

// PATCH /api/goals — contribute toward a goal.
export async function PATCH(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  let body: { goalId?: string; amount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.goalId) return NextResponse.json({ error: "goalId is required" }, { status: 400 });
  try {
    const result = await contributeGoal(body.goalId, Number(body.amount));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return apiError(err);
  }
}
