// Multi-provider AI layer — one text-generation entrypoint over three free-tier
// engines, plus an "agentic check" that probes each provider live.
//   • gemini : Google Gemini Flash (REST)          — cloud, generous free tier
//   • groq   : Groq (OpenAI-compatible chat API)    — cloud, fast free tier
//   • ollama : local Ollama (llama3.2 etc.)         — on-device, zero cost
// Every call's token usage is logged to the ai_usage ledger.

import {
  config,
  activeAiProvider,
  isProviderConfigured,
  isPocketBaseConfigured,
  type AiProvider,
} from "./config";
import { pbCreate } from "./pocketbase";

interface Usage {
  prompt: number;
  output: number;
  total: number;
}

async function logUsage(
  fn: string,
  provider: string,
  model: string,
  u: Usage,
  meta?: { tenantId?: string; source?: string },
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
  meta?: { tenantId?: string; source?: string };
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

// Generate text with the chosen (or configured) provider.
export async function aiGenerate(prompt: string, opts: GenOpts = {}): Promise<string> {
  const provider = opts.provider ?? opts.creds?.provider ?? activeAiProvider();
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
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: opts.json
        ? { temperature: 0.1, responseMimeType: "application/json" }
        : { temperature: 0.7 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  const um = data?.usageMetadata ?? {};
  await logUsage(
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
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.json ? 0.1 : 0.7,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text: string = (data?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("Groq returned an empty response.");
  const u = data?.usage ?? {};
  await logUsage(
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
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      ...(opts.json ? { format: "json" } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text: string = (data?.message?.content ?? "").trim();
  if (!text) throw new Error("Ollama returned an empty response.");
  const pin = data.prompt_eval_count || 0;
  const pout = data.eval_count || 0;
  await logUsage(fn, "ollama", model, { prompt: pin, output: pout, total: pin + pout }, opts.meta);
  return text;
}

// ── Vision ──────────────────────────────────────────────────────────────────
// Reading a receipt or a Touch 'n Go screenshot needs a multimodal model. All
// three providers can do it, but each wants the image in a different envelope
// and under a different model id — hence one entrypoint over three shapes.

export interface VisionOpts extends GenOpts {
  mimeType: string;
}

export function visionModelOf(p: AiProvider): string {
  if (p === "groq") return config.groqVisionModel;
  if (p === "ollama") return config.ollamaVisionModel;
  return config.geminiModel;
}

// `imageBase64` is raw base64 — no data: prefix.
export async function aiVision(
  prompt: string,
  imageBase64: string,
  opts: VisionOpts,
): Promise<string> {
  const provider = opts.provider ?? opts.creds?.provider ?? activeAiProvider();
  const fn = opts.fn ?? "aiVision";
  if (provider === "groq") return groqVision(prompt, imageBase64, opts, fn);
  if (provider === "ollama") return ollamaVision(prompt, imageBase64, opts, fn);
  return geminiVision(prompt, imageBase64, opts, fn);
}

async function geminiVision(prompt: string, image: string, opts: VisionOpts, fn: string): Promise<string> {
  const { key, model } = resolve(opts, "gemini", true);
  if (!key) throw new Error(NO_KEY("Gemini", "GEMINI_API_KEY"));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const parts: unknown[] = [];
  if (opts.system) parts.push({ text: opts.system });
  parts.push({ text: prompt });
  parts.push({ inlineData: { mimeType: opts.mimeType, data: image } });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: opts.json
        ? { temperature: 0.1, responseMimeType: "application/json" }
        : { temperature: 0.4 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini vision ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  const um = data?.usageMetadata ?? {};
  await logUsage(
    fn,
    "gemini",
    config.geminiModel,
    { prompt: um.promptTokenCount || 0, output: um.candidatesTokenCount || 0, total: um.totalTokenCount || 0 },
    opts.meta,
  );
  return text;
}

async function groqVision(prompt: string, image: string, opts: VisionOpts, fn: string): Promise<string> {
  const { key, model } = resolve(opts, "groq", true);
  if (!key) throw new Error(NO_KEY("Groq", "GROQ_API_KEY"));
  // Groq speaks the OpenAI vision shape: an image_url whose url is a data: URI.
  const content = [
    { type: "text", text: opts.system ? `${opts.system}\n\n${prompt}` : prompt },
    { type: "image_url", image_url: { url: `data:${opts.mimeType};base64,${image}` } },
  ];
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      temperature: opts.json ? 0.1 : 0.4,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Groq vision ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text: string = (data?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("Groq returned an empty response.");
  const u = data?.usage ?? {};
  await logUsage(
    fn,
    "groq",
    model,
    { prompt: u.prompt_tokens || 0, output: u.completion_tokens || 0, total: u.total_tokens || 0 },
    opts.meta,
  );
  return text;
}

async function ollamaVision(prompt: string, image: string, opts: VisionOpts, fn: string): Promise<string> {
  const { model, url: base } = resolve(opts, "ollama", true);
  if (!base) throw new Error(NO_KEY("Ollama", "OLLAMA_URL"));
  const messages: unknown[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: prompt, images: [image] });

  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      ...(opts.json ? { format: "json" } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Ollama vision ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text: string = (data?.message?.content ?? "").trim();
  if (!text) throw new Error("Ollama returned an empty response.");
  const pin = data.prompt_eval_count || 0;
  const pout = data.eval_count || 0;
  await logUsage(fn, "ollama", model, { prompt: pin, output: pout, total: pin + pout }, opts.meta);
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
