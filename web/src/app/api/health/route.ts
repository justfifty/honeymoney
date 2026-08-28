import { NextResponse } from "next/server";
import {
  isPocketBaseConfigured,
  isSupabaseConfigured,
  isGeminiConfigured,
  config,
} from "@/lib/config";

export const runtime = "nodejs";

// Lightweight readiness probe — shows which integrations are wired up.
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "honeymoney",
    integrations: {
      pocketbase: isPocketBaseConfigured(),
      supabase: isSupabaseConfigured(),
      gemini: isGeminiConfigured(),
      demoTenant: Boolean(config.demoTenantId),
    },
  });
}
