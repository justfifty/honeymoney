import { NextResponse } from "next/server";
import { aiHealth } from "@/lib/ai";
import { resolveAiCreds } from "@/lib/aiKeys";
import { activeAiProvider } from "@/lib/config";
import { getContext } from "@/lib/household";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ai/check — agentic health probe across Gemini / Groq / Ollama.
// Each configured provider is asked to reply "OK"; usage is logged to ai_usage.
//
// When the caller is signed in and their household has stored its own key, the
// probe runs against THAT key. Otherwise a household that had just saved a key
// would still be shown the server's status, and would conclude their own key had
// failed — which is the opposite of what this endpoint is for.
export async function GET() {
  const ctx = await getContext().catch(() => null);
  const creds = ctx ? ((await resolveAiCreds(ctx.tenant.id).catch(() => null)) ?? undefined) : undefined;

  const providers = await aiHealth(creds);
  return NextResponse.json({
    active: creds?.provider ?? activeAiProvider(),
    usingHouseholdKey: Boolean(creds),
    anyConfigured: providers.some((p) => p.configured),
    providers,
  });
}
