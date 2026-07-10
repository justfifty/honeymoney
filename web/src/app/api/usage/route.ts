import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { pbList } from "@/lib/pocketbase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UsageRow {
  id: string;
  fn: string;
  model: string;
  prompt_tokens: number;
  output_tokens: number;
  total_tokens: number;
  tenant: string;
  source: string;
  ok: boolean;
  created: string;
}

// GET /api/usage — the AI token ledger + a rolled-up summary, for the MAIC AI
// disclosure record and cost tracking. Superuser read via the server only.
export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const rows = await pbList<UsageRow>("ai_usage", { sort: "-created", perPage: 500 });
    const byFn: Record<string, { calls: number; total_tokens: number }> = {};
    let calls = 0;
    let prompt = 0;
    let output = 0;
    let total = 0;
    for (const r of rows) {
      calls += 1;
      prompt += Number(r.prompt_tokens) || 0;
      output += Number(r.output_tokens) || 0;
      total += Number(r.total_tokens) || 0;
      const f = byFn[r.fn] ?? { calls: 0, total_tokens: 0 };
      f.calls += 1;
      f.total_tokens += Number(r.total_tokens) || 0;
      byFn[r.fn] = f;
    }
    return NextResponse.json({
      summary: {
        calls,
        prompt_tokens: prompt,
        output_tokens: output,
        total_tokens: total,
        by_fn: byFn,
      },
      rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
