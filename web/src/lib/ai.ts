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

export interface GenOpts {
  system?: string;
  json?: boolean;
  fn?: string;
  provider?: AiProvider;
  meta?: { tenantId?: string; source?: string };
}

// Generate text with the chosen (or configured) provider.
export async function aiGenerate(prompt: string, opts: GenOpts = {}): Promise<string> {
  const provider = opts.provider ?? activeAiProvider();
  const fn = opts.fn ?? "aiGenerate";
  if (provider === "groq") return groqGen(prompt, opts, fn);
  if (provider === "ollama") return ollamaGen(prompt, opts, fn);
  return geminiGen(prompt, opts, fn);
}

async function geminiGen(prompt: string, opts: GenOpts, fn: string): Promise<string> {
  if (!config.geminiApiKey) throw new Error("Gemini not configured (set GEMINI_API_KEY).");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;
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
    config.geminiModel,
    { prompt: um.promptTokenCount || 0, output: um.candidatesTokenCount || 0, total: um.totalTokenCount || 0 },
    opts.meta,
  );
  return text;
}

async function groqGen(prompt: string, opts: GenOpts, fn: string): Promise<string> {
  if (!config.groqApiKey) throw new Error("Groq not configured (set GROQ_API_KEY).");
  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: prompt });
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.groqApiKey}` },
    body: JSON.stringify({
      model: config.groqModel,
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
    config.groqModel,
    { prompt: u.prompt_tokens || 0, output: u.completion_tokens || 0, total: u.total_tokens || 0 },
    opts.meta,
  );
  return text;
}

async function ollamaGen(prompt: string, opts: GenOpts, fn: string): Promise<string> {
  if (!config.ollamaUrl) throw new Error("Ollama not configured (set OLLAMA_URL).");
  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: prompt });
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.ollamaModel,
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
  await logUsage(fn, "ollama", config.ollamaModel, { prompt: pin, output: pout, total: pin + pout }, opts.meta);
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
  const provider = opts.provider ?? activeAiProvider();
  const fn = opts.fn ?? "aiVision";
  if (provider === "groq") return groqVision(prompt, imageBase64, opts, fn);
  if (provider === "ollama") return ollamaVision(prompt, imageBase64, opts, fn);
  return geminiVision(prompt, imageBase64, opts, fn);
}

async function geminiVision(prompt: string, image: string, opts: VisionOpts, fn: string): Promise<string> {
  if (!config.geminiApiKey) throw new Error("Gemini not configured (set GEMINI_API_KEY).");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;
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
  if (!config.groqApiKey) throw new Error("Groq not configured (set GROQ_API_KEY).");
  // Groq speaks the OpenAI vision shape: an image_url whose url is a data: URI.
  const content = [
    { type: "text", text: opts.system ? `${opts.system}\n\n${prompt}` : prompt },
    { type: "image_url", image_url: { url: `data:${opts.mimeType};base64,${image}` } },
  ];
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.groqApiKey}` },
    body: JSON.stringify({
      model: config.groqVisionModel,
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
    config.groqVisionModel,
    { prompt: u.prompt_tokens || 0, output: u.completion_tokens || 0, total: u.total_tokens || 0 },
    opts.meta,
  );
  return text;
}

async function ollamaVision(prompt: string, image: string, opts: VisionOpts, fn: string): Promise<string> {
  if (!config.ollamaUrl) throw new Error("Ollama not configured (set OLLAMA_URL).");
  const messages: unknown[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: prompt, images: [image] });

  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.ollamaVisionModel,
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
  await logUsage(fn, "ollama", config.ollamaVisionModel, { prompt: pin, output: pout, total: pin + pout }, opts.meta);
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

function modelOf(p: AiProvider): string {
  if (p === "groq") return config.groqModel;
  if (p === "ollama") return config.ollamaModel;
  return config.geminiModel;
}

// Agentic check: ask each configured provider to reply "OK" and report status.
export async function aiHealth(): Promise<ProviderHealth[]> {
  const providers: AiProvider[] = ["gemini", "groq", "ollama"];
  const out: ProviderHealth[] = [];
  for (const p of providers) {
    const configured = isProviderConfigured(p);
    if (!configured) {
      out.push({ provider: p, configured: false, ok: false, model: modelOf(p), latencyMs: 0 });
      continue;
    }
    const t0 = Date.now();
    try {
      const reply = await aiGenerate("Reply with exactly: OK", {
        provider: p,
        fn: "agentic_check",
        system: "You are a health probe. Reply with exactly the requested token, nothing else.",
      });
      out.push({
        provider: p,
        configured: true,
        ok: /ok/i.test(reply),
        model: modelOf(p),
        latencyMs: Date.now() - t0,
        reply: reply.slice(0, 40),
      });
    } catch (e) {
      out.push({
        provider: p,
        configured: true,
        ok: false,
        model: modelOf(p),
        latencyMs: Date.now() - t0,
        error: e instanceof Error ? e.message : "error",
      });
    }
  }
  return out;
}
