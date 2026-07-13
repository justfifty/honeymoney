import { NextResponse } from "next/server";
import { getBucketProjection, getHoneyInsight } from "@/lib/projection";
import { isDatabaseConfigured } from "@/lib/config";
import { resolveViewTenant } from "@/lib/household";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/insight -> projection + Honey insight for the caller's household.
//
// The tenant is resolved from the session, not from a query parameter. It used
// to accept ?tenantId=… from anyone, which let an unauthenticated caller read
// any household's full financial projection just by knowing its id.
// Signed out, you get the public demo household — the showcase, deliberately.
export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database (PocketBase) not configured" }, { status: 503 });
  }

  try {
    const { tenantId, isDemo } = await resolveViewTenant();
    if (!tenantId) {
      return NextResponse.json({ error: "No household to show." }, { status: 404 });
    }

    const projection = await getBucketProjection(tenantId);
    const insight = await getHoneyInsight(projection);
    return NextResponse.json({ tenantId, isDemo, projection, insight });
  } catch (err) {
    return apiError(err);
  }
}
