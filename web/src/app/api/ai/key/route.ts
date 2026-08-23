import { NextResponse } from "next/server";
import { aiGenerate } from "@/lib/ai";
import {
  SecretsKeyMissing,
  clearTenantAiKey,
  getTenantAiKeyInfo,
  isSecretsKeyConfigured,
  serverHasEngine,
  setTenantAiKey,
} from "@/lib/aiKeys";
import { isDatabaseConfigured, type AiProvider } from "@/lib/config";
import { apiError } from "@/lib/apiError";
import { AuthError, requireContext, requirePermission } from "@/lib/household";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A household's own AI engine, so Ask Honey works without the server owner.
//
//   GET    — what is stored (masked). Any signed-in member.
//   POST   — validate a key against the live provider, then store it encrypted.
//   DELETE — remove it; the household falls back to the server's engine.
//
// POST and DELETE are gated on `manage_members`, which is owner-only. That is
// the right gate rather than a convenient one: the key is billable to whoever
// issued it, and a household member spending a partner's Gemini quota is a
// support problem nobody wants to have.

const PROVIDERS: AiProvider[] = ["gemini", "groq", "ollama"];

// A key must never come back out in an error string. Provider errors carry
// response bodies, and Gemini in particular takes the key as a query parameter,
// so one upstream change is all it takes for a URL to appear in a message that
// this route then hands to a browser and a log.
function scrub(message: string, secret: string): string {
  if (!secret || secret.length < 8) return message;
  return message.split(secret).join("***");
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requireContext();
    const info = await getTenantAiKeyInfo(ctx.tenant.id);
    return NextResponse.json({
      ok: true,
      key: info,                                   // null when the household has none
      canManage: ctx.accessRole === "owner",
      secretsKeyReady: isSecretsKeyConfigured(),   // false => POST will refuse, say so up front
      serverHasEngine: serverHasEngine(),          // false => a key here is the only way to get AI
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  let body: { provider?: string; apiKey?: string; url?: string; model?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const provider = (body.provider ?? "").toLowerCase() as AiProvider;
  const apiKey = (body.apiKey ?? "").trim();
  const url = (body.url ?? "").trim();
  const model = (body.model ?? "").trim();

  try {
    const ctx = await requirePermission("manage_members");
    if (!PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: "Unknown engine." }, { status: 400 });
    }

    // Refuse before touching the network. Storing is impossible without the
    // master key, and finding that out after a successful provider round-trip
    // would read as "my key works but the app is broken".
    if (provider !== "ollama" && !isSecretsKeyConfigured()) {
      return NextResponse.json({ error: new SecretsKeyMissing().message }, { status: 503 });
    }

    // Validate on SAVE, not on first use. A key that is wrong should fail here,
    // where a person is looking at the form and can fix it, rather than later
    // inside an unrelated question about their savings.
    try {
      const reply = await aiGenerate("Reply with exactly: OK", {
        provider,
        creds: { provider, apiKey, url, model: model || undefined },
        fn: "key_validate",
        system: "You are a health probe. Reply with exactly the requested token, nothing else.",
        meta: { tenantId: ctx.tenant.id, source: "setup" },
      });
      if (!/ok/i.test(reply)) {
        return NextResponse.json(
          { error: "The engine answered, but not as expected. Check the model name." },
          { status: 400 },
        );
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : "The engine rejected the request.";
      return NextResponse.json({ error: scrub(raw, apiKey).slice(0, 300) }, { status: 400 });
    }

    const info = await setTenantAiKey(ctx.tenant.id, { provider, apiKey, url, model });
    return NextResponse.json({ ok: true, key: info });
  } catch (err) {
    if (err instanceof SecretsKeyMissing) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    // AuthError carries its own status and must reach apiError intact. Wrapping
    // it in a plain Error to scrub the message turned every signed-out POST into
    // a 500 — the scrubbing was right and the wrapping threw the status away.
    if (err instanceof AuthError) return apiError(err);
    const wrapped = err instanceof Error ? new Error(scrub(err.message, apiKey)) : err;
    return apiError(wrapped);
  }
}

export async function DELETE() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requirePermission("manage_members");
    const removed = await clearTenantAiKey(ctx.tenant.id);
    return NextResponse.json({ ok: true, removed });
  } catch (err) {
    return apiError(err);
  }
}
