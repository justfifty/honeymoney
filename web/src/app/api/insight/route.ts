import { NextResponse } from "next/server";
import { getBucketProjection, getHoneyInsight } from "@/lib/projection";
import { isDatabaseConfigured, config } from "@/lib/config";

export const runtime = "nodejs";

// GET /api/insight?tenantId=... -> projection + Honey insight.
// Falls back to DEMO_TENANT_ID when tenantId is omitted.
export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database (PocketBase) not configured" }, { status: 503 });
  }

  const tenantId =
    new URL(request.url).searchParams.get("tenantId") || config.demoTenantId;
  if (!tenantId) {
    return NextResponse.json(
      { error: "tenantId is required (or set DEMO_TENANT_ID)" },
      { status: 400 },
    );
  }

  try {
    const projection = await getBucketProjection(tenantId);
    const insight = await getHoneyInsight(projection);
    return NextResponse.json({ tenantId, projection, insight });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
