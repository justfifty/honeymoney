// Multi-provider AI layer — one text-generation entrypoint over three free-tier
// engines, plus an "agentic check" that probes each provider live.
//   • gemini : Google Gemini Flash (REST)          — cloud, generous free tier
//   • groq   : Groq (OpenAI-compatible chat API)    — cloud, fast free tier
//   • ollama : local Ollama (llama3.2 etc.)         — on-device, zero cost
// Every call's token usage is logged to the ai_usage ledger.

import {
  config,
  isProviderConfigured,
  isPocketBaseConfigured,
  type AiProvider,
} from "./config";
import {
  assertAiConsent,
  assertClassAllowed,
  isLocalProvider,
  providerForClass,
  type DataClass,
} from "./aiGuard";
import { pbCreate } from "./pocketbase";

interface Usage {
  prompt: number;
  output: number;
  total: number;
}

/**
 * What was logged about a call, beyond how many tokens it burned.
 *
 * The token counts answer "what did this cost". They cannot answer "what
 * personal data left this household, and when" — which is the question an
 * access request and a breach assessment both open with. Minimisation is a
 * mitigating factor only where it can be evidenced, so the ledger records the
 * class of the payload, whether it stayed on local hardware, and how big it
 * was. Not the payload itself: a log of what you were careful not to send is a
 * second copy of the thing you were careful not to send.
 */
export interface CallMeta {
  tenantId?: string;
  source?: string;
  dataClass?: DataClass;
  local?: boolean;
  bytes?: number;
}

const egressBytes = (prompt: string, system?: string, image?: string): number =>
  prompt.length + (system?.length ?? 0) + (image?.length ?? 0);

// Ceilings on how long a provider may keep a user waiting. There were none:
// a hung Gemini or Groq connection held the request open until the platform
// killed it, and the caller — a dashboard render, an "Ask Honey" box, a receipt
// being parsed — waited the whole time with nothing on screen. A provider that
// has not answered by now is not going to; the callers all have a rule-based
// fallback and reaching it in seconds beats reaching it in minutes.
//
// Vision gets longer because an image genuinely takes longer to process.
const GEN_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 12_000);
const VISION_TIMEOUT_MS = Number(process.env.AI_VISION_TIMEOUT_MS ?? 30_000);

async function aiFetch(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      throw new Error(`AI provider did not respond within ${Math.round(ms / 1000)}s.`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// NOT awaited by its callers. This is telemetry: writing a usage row to
// PocketBase is bookkeeping, and it was sitting between the model's answer and
// the user seeing it — one whole round trip of latency added to every AI reply
// so a ledger row could land first. It still lands; it just no longer holds the
// answer hostage. Failures were already swallowed, so nothing is lost by not
// waiting for one.
async function logUsage(
  fn: string,
  provider: string,
  model: string,
  u: Usage,
  meta?: CallMeta,
): Promise<void> {
  if (!isPocketBaseConfigured()) return;
  try {
    await pbCreate("ai_usage", {
      fn,
      model: `${provider}:${model}`,
      prompt_tokens: u.prompt,
      output_tokens: u.output,
      total_tokens: u.total,
      tenant: meta?.tenantId ?? "",
      source: meta?.source ?? "",
      ok: true,
      data_class: meta?.dataClass ?? 2,
      local: meta?.local ?? false,
      egress_bytes: meta?.local ? 0 : (meta?.bytes ?? 0),
    });
  } catch {
    /* telemetry must never break a request */
  }
}

// A household's own engine, resolved from tenant_ai_keys by lib/aiKeys.ts and
// passed in by the caller that knows which household is asking. Absent means
// "use the server's environment", which is what a self-hosted owner wants.
export interface AiCreds {
  provider: AiProvider;
  apiKey?: string;
  url?: string;
  model?: string;
}

export interface GenOpts {
  system?: string;
  json?: boolean;
  fn?: string;
  provider?: AiProvider;
  creds?: AiCreds;
  meta?: CallMeta;
  /**
   * What is in this payload. REQUIRED, and required for the same reason the
   * `resolve()` comment below gives about credentials: an optional safety field
   * is how the tenth call site gets added that omits it. TypeScript refusing to
   * compile a call that has not declared its class is the enforcement; a
   * convention that call sites "should" set it is not.
   */
  dataClass: DataClass;
  /**
   * WHOSE data this is — the user whose consent governs the call.
   *
   * Required for exactly the reason `dataClass` is, and added because the
   * argument had already been proven right the hard way. Consent was checked at
   * individual call sites: the receipt route had it, the statement route had it,
   * and getHoneyInsight did not — so every dashboard render described a
   * household's money to Google while the disclosure said AI was off until
   * asked. Nothing was wrong with the check. The wrongness was that adding a
   * new AI call site required *remembering* to write one.
   *
   * So consent is enforced HERE, at the chokepoint every provider call already
   * funnels through, next to assertClassAllowed which has always worked this
   * way. A new call site cannot omit it, because the type does not compile
   * without it.
   *
   * `null` means "no data subject" — a health probe, or the public demo where
   * the personas are fictional. It is a value you have to type, not a field you
   * can forget, which is the whole point.
   */
  subjectId: string | null;
}

// The household's credentials override the server's environment, field by
// field. This exists as one resolver rather than `opts.creds?.apiKey ??
// config.x` repeated at nine call sites, because the repeated form is exactly
// how a tenth call site gets added that silently ignores the override and bills
// the server owner for a household that supplied its own key.
//
// `vision` deliberately ignores a household's MODEL choice: a household picks a
// text model, and sending a receipt image to a text-only model fails in a way
// that reads like a broken key. Its API KEY is still used - own key, server's
// idea of which multimodal model to call.
function resolve(opts: GenOpts, p: AiProvider, vision = false) {
  const c = opts.creds?.provider === p ? opts.creds : undefined;
  if (p === "groq") {
    return {
      key: c?.apiKey || config.groqApiKey,
      model: vision ? config.groqVisionModel : c?.model || config.groqModel,
      url: "",
    };
  }
  if (p === "ollama") {
    return {
      key: "",
      model: vision ? config.ollamaVisionModel : c?.model || config.ollamaModel,
      url: (c?.url || config.ollamaUrl).replace(/\/$/, ""),
    };
  }
  return { key: c?.apiKey || config.geminiApiKey, model: c?.model || config.geminiModel, url: "" };
}

const NO_KEY = (engine: string, envVar: string) =>
  `No ${engine} key. Set ${envVar} on the server, or add your household's own key under Setup.`;

/**
 * Decide who carries this payload, refuse the routing if it may not leave, and
 * stamp the ledger fields onto `meta` so every logUsage() call below records
 * them without each provider function having to remember to.
 */
function route(opts: GenOpts, bytes: number): { provider: AiProvider; opts: GenOpts } {
  const provider = providerForClass(opts.dataClass, opts.provider ?? opts.creds?.provider);
  assertClassAllowed(opts.dataClass, provider);
  const local = isLocalProvider(provider);
  return {
    provider,
    opts: {
      ...opts,
      // A household's own cloud credentials must not smuggle a class-2 payload
      // past a routing decision that sent it to the local engine.
      creds: opts.creds?.provider === provider ? opts.creds : undefined,
      meta: { ...opts.meta, dataClass: opts.dataClass, local, bytes },
    },
  };
}

// Generate text with the provider this payload's data class permits.
export async function aiGenerate(prompt: string, o: GenOpts): Promise<string> {
  const { provider, opts } = route(o, egressBytes(prompt, o.system));
  // After routing, because the answer depends on WHICH provider ends up
  // carrying it: providerForClass may divert a class-2 payload to a local
  // engine, and a payload that never leaves needs no third-party consent.
  await assertAiConsent(o.dataClass, provider, o.subjectId);
  const fn = opts.fn ?? "aiGenerate";
  if (provider === "groq") return groqGen(prompt, opts, fn);
  if (provider === "ollama") return ollamaGen(prompt, opts, fn);
  return geminiGen(prompt, opts, fn);
}

async function geminiGen(prompt: string, opts: GenOpts, fn: string): Promise<string> {
  const { key, model } = resolve(opts, "gemini");
  if (!key) throw new Error(NO_KEY("Gemini", "GEMINI_API_KEY"));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const parts: { text: string }[] = [];
  if (opts.system) parts.push({ text: opts.system });
  parts.push({ text: prompt });
  const res = await aiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: opts.json
        ? { temperature: 0.1, responseMimeType: "application/json" }
        : { temperature: 0.7 },
    }),
  }, GEN_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  const um = data?.usageMetadata ?? {};
  void logUsage(
    fn,
    "gemini",
    model,
    { prompt: um.promptTokenCount || 0, output: um.candidatesTokenCount || 0, total: um.totalTokenCount || 0 },
    opts.meta,
  );
  return text;
}

async function groqGen(prompt: string, opts: GenOpts, fn: string): Promise<string> {
  const { key, model } = resolve(opts, "groq");
  if (!key) throw new Error(NO_KEY("Groq", "GROQ_API_KEY"));
  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: prompt });
  const res = await aiFetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.json ? 0.1 : 0.7,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  }, GEN_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text: string = (data?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("Groq returned an empty response.");
  const u = data?.usage ?? {};
  void logUsage(
    fn,
    "groq",
    model,
    { prompt: u.prompt_tokens || 0, output: u.completion_tokens || 0, total: u.total_tokens || 0 },
    opts.meta,
  );
  return text;
}

async function ollamaGen(prompt: string, opts: GenOpts, fn: string): Promise<string> {
  const { model, url: base } = resolve(opts, "ollama");
  if (!base) throw new Error(NO_KEY("Ollama", "OLLAMA_URL"));
  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: prompt });
  const res = await aiFetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      ...(opts.json ? { format: "json" } : {}),
    }),
  }, GEN_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text: string = (data?.message?.content ?? "").trim();
  if (!text) throw new Error("Ollama returned an empty response.");
  const pin = data.prompt_eval_count || 0;
  const pout = data.eval_count || 0;
  void logUsage(fn, "ollama", model, { prompt: pin, output: pout, total: pin + pout }, opts.meta);
  return text;
}

// ── Vision ──────────────────────────────────────────────────────────────────
// Reading a receipt or a Touch 'n Go screenshot needs a multimodal model. All
// three providers can do it, but each wants the image in a different envelope
// and under a different model id — hence one entrypoint over three shapes.

/**
 * Vision carries no `dataClass` because there is only one honest answer: a
 * photograph of a receipt is household data, and no framing of the request
 * makes it otherwise. Omitting the field rather than asking callers to write
 * `dataClass: 2` removes the possibility of one of them writing something else.
 */
export interface VisionOpts extends Omit<GenOpts, "dataClass"> {
  mimeType: string;
}

/** VisionOpts after route() has stamped the class it was always going to have. */
type VisionOptsResolved = VisionOpts & { dataClass: DataClass };

export function visionModelOf(p: AiProvider): string {
  if (p === "groq") return config.groqVisionModel;
  if (p === "ollama") return config.ollamaVisionModel;
  return config.geminiModel;
}

// `imageBase64` is raw base64 — no data: prefix.
export async function aiVision(
  prompt: string,
  imageBase64: string,
  o: VisionOpts,
): Promise<string> {
  // A document image is household data by construction — there is no
  // de-identified way to send a photograph of a receipt — so vision is pinned
  // to class 2 whatever the caller passed. This is the path most likely to
  // carry sensitive personal data: a receipt from a clinic or a pharmacy is
  // health data about an identified person, which is a stricter regime than the
  // financial data everyone assumes is the sensitive part here.
  const routed = route({ ...o, dataClass: 2 }, egressBytes(prompt, o.system, imageBase64));
  await assertAiConsent(2, routed.provider, o.subjectId);
  const opts = routed.opts as VisionOptsResolved;
  const fn = opts.fn ?? "aiVision";
  if (routed.provider === "groq") return groqVision(prompt, imageBase64, opts, fn);
  if (routed.provider === "ollama") return ollamaVision(prompt, imageBase64, opts, fn);
  return geminiVision(prompt, imageBase64, opts, fn);
}

async function geminiVision(prompt: string, image: string, opts: VisionOptsResolved, fn: string): Promise<string> {
  const { key, model } = resolve(opts, "gemini", true);
  if (!key) throw new Error(NO_KEY("Gemini", "GEMINI_API_KEY"));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const parts: unknown[] = [];
  if (opts.system) parts.push({ text: opts.system });
  parts.push({ text: prompt });
  parts.push({ inlineData: { mimeType: opts.mimeType, data: image } });

  const res = await aiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: opts.json
        ? { temperature: 0.1, responseMimeType: "application/json" }
        : { temperature: 0.4 },
    }),
  }, VISION_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Gemini vision ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  const um = data?.usageMetadata ?? {};
  // `model`, not config.geminiModel: this call may have run on a household's own
  // key and model, and logging the server's id filed those tokens under a model
  // that never saw them. The ledger is what /admin costs the month from.
  void logUsage(
    fn,
    "gemini",
    model,
    { prompt: um.promptTokenCount || 0, output: um.candidatesTokenCount || 0, total: um.totalTokenCount || 0 },
    opts.meta,
  );
  return text;
}

async function groqVision(prompt: string, image: string, opts: VisionOptsResolved, fn: string): Promise<string> {
  const { key, model } = resolve(opts, "groq", true);
  if (!key) throw new Error(NO_KEY("Groq", "GROQ_API_KEY"));
  // Groq speaks the OpenAI vision shape: an image_url whose url is a data: URI.
  const content = [
    { type: "text", text: opts.system ? `${opts.system}\n\n${prompt}` : prompt },
    { type: "image_url", image_url: { url: `data:${opts.mimeType};base64,${image}` } },
  ];
  const res = await aiFetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      temperature: opts.json ? 0.1 : 0.4,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  }, VISION_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Groq vision ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text: string = (data?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("Groq returned an empty response.");
  const u = data?.usage ?? {};
  void logUsage(
    fn,
    "groq",
    model,
    { prompt: u.prompt_tokens || 0, output: u.completion_tokens || 0, total: u.total_tokens || 0 },
    opts.meta,
  );
  return text;
}

async function ollamaVision(prompt: string, image: string, opts: VisionOptsResolved, fn: string): Promise<string> {
  const { model, url: base } = resolve(opts, "ollama", true);
  if (!base) throw new Error(NO_KEY("Ollama", "OLLAMA_URL"));
  const messages: unknown[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: prompt, images: [image] });

  const res = await aiFetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      ...(opts.json ? { format: "json" } : {}),
    }),
  }, VISION_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Ollama vision ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text: string = (data?.message?.content ?? "").trim();
  if (!text) throw new Error("Ollama returned an empty response.");
  const pin = data.prompt_eval_count || 0;
  const pout = data.eval_count || 0;
  void logUsage(fn, "ollama", model, { prompt: pin, output: pout, total: pin + pout }, opts.meta);
  return text;
}

export interface ProviderHealth {
  provider: AiProvider;
  configured: boolean;
  ok: boolean;
  model: string;
  latencyMs: number;
  reply?: string;
  error?: string;
}

function modelOf(p: AiProvider, creds?: AiCreds): string {
  const c = creds?.provider === p ? creds : undefined;
  if (p === "groq") return c?.model || config.groqModel;
  if (p === "ollama") return c?.model || config.ollamaModel;
  return c?.model || config.geminiModel;
}

// Agentic check: ask each configured provider to reply "OK" and report status.
//
// `creds` lets the probe answer the question a household actually has - "does
// MY key work?" - rather than only "does the server's?". Without it, someone who
// had just saved their own key would still see the server's status and conclude
// their key was the thing that failed.
export async function aiHealth(creds?: AiCreds): Promise<ProviderHealth[]> {
  const providers: AiProvider[] = ["gemini", "groq", "ollama"];
  const out: ProviderHealth[] = [];
  for (const p of providers) {
    const configured = creds?.provider === p ? true : isProviderConfigured(p);
    if (!configured) {
      out.push({ provider: p, configured: false, ok: false, model: modelOf(p, creds), latencyMs: 0 });
      continue;
    }
    const t0 = Date.now();
    try {
      const reply = await aiGenerate("Reply with exactly: OK", {
        provider: p,
        creds,
        fn: "agentic_check",
        dataClass: 0,
        subjectId: null, // a liveness probe carries nobody's data
        system: "You are a health probe. Reply with exactly the requested token, nothing else.",
      });
      out.push({
        provider: p,
        configured: true,
        ok: /ok/i.test(reply),
        model: modelOf(p, creds),
        latencyMs: Date.now() - t0,
        reply: reply.slice(0, 40),
      });
    } catch (e) {
      out.push({
        provider: p,
        configured: true,
        ok: false,
        model: modelOf(p, creds),
        latencyMs: Date.now() - t0,
        error: e instanceof Error ? e.message : "error",
      });
    }
  }
  return out;
}
