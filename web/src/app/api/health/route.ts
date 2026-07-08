import { NextResponse } from "next/server";
import {
  isSupabaseConfigured,
  isGeminiConfigured,
  isTelegramConfigured,
  config,
} from "@/lib/config";

export const runtime = "nodejs";

// Lightweight readiness probe — shows which integrations are wired up.
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "honeymoney",
    integrations: {
      supabase: isSupabaseConfigured(),
      gemini: isGeminiConfigured(),
      telegram: isTelegramConfigured(),
      demoTenant: Boolean(config.demoTenantId),
    },
  });
}
