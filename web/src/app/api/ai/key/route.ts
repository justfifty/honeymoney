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

/**
 * Turn a provider's rejection into something a person can act on.
 *
 * lib/ai.ts throws `Groq 401: {"error":{"message":"Invalid API Key","type":…}}`,
 * which is the right thing for a log and the wrong thing for a settings panel:
 * the person pasting a key was shown raw provider JSON and had to infer that
 * they had mistyped it. The status code carries the whole diagnosis, so use it,
 * and keep the original text appended for anyone debugging.
 */
function explainProviderFailure(provider: AiProvider, raw: string): string {
  const name = provider === "gemini" ? "Gemini" : provider === "groq" ? "Groq" : "Ollama";
  const code = /\b(4\d\d|5\d\d)\b/.exec(raw)?.[1];
  const detail = raw.slice(0, 200);

  if (code === "401" || code === "403") {
    return provider === "ollama"
      ? `${name} refused the connection. Check the URL and that Ollama is running. (${detail})`
      : `${name} rejected that key. Copy it again from the provider's console — keys are long and a truncated paste looks identical to a wrong one. (${detail})`;
  }
  if (code === "404") {
    // A retired model and a mistyped one both come back 404 and need opposite
    // advice. Worse, "leave it empty" is actively wrong when the DEFAULT is what
    // was retired — which is what happened when Google shut gemini-2.0-flash
    // down on 2026-08-25: the panel told people to clear the field, and clearing
    // it selected the dead model again. Providers say so in words, so read them.
    if (/no longer (available|supported)|has been (retired|deprecated)|is deprecated/i.test(raw))
      return `${name} has retired that model. Clear the model field to use the current default, or paste the replacement id from the message below. (${detail})`;
    return `${name} does not recognise that model name. Leave the model field empty to use the default. (${detail})`;
  }
  if (code === "429") {
    return `${name} is rate-limiting this key right now. The key is probably fine — try again in a minute. (${detail})`;
  }
  if (code && code.startsWith("5")) {
    return `${name} had a server error, so the key could not be checked. Try again shortly. (${detail})`;
  }
  if (/fetch|ENOTFOUND|ECONNREFUSED|timeout|network/i.test(raw)) {
    return provider === "ollama"
      ? `Could not reach Ollama at that URL. It must be reachable from the server, not just from your own machine. (${detail})`
      : `Could not reach ${name}. Check the server's internet access and try again. (${detail})`;
  }
  return `${name} rejected the request. (${detail})`;
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
        dataClass: 0,
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
      return NextResponse.json(
        { error: explainProviderFailure(provider, scrub(raw, apiKey)) },
        { status: 400 },
      );
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
