import { NextResponse } from "next/server";
import { aiHealth } from "@/lib/ai";
import { activeAiProvider } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ai/check — agentic health probe across Gemini / Groq / Ollama.
// Each configured provider is asked to reply "OK"; usage is logged to ai_usage.
export async function GET() {
  const providers = await aiHealth();
  return NextResponse.json({
    active: activeAiProvider(),
    anyConfigured: providers.some((p) => p.configured),
    providers,
  });
}
