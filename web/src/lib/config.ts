// Centralized env access + capability flags. Server-only values must never be
// read in a "use client" module.

export const config = {
  // PocketBase (default local-first database)
  pocketbaseUrl: process.env.POCKETBASE_URL ?? "http://127.0.0.1:8090",
  pocketbaseAdminEmail: process.env.POCKETBASE_ADMIN_EMAIL ?? "",
  pocketbaseAdminPassword: process.env.POCKETBASE_ADMIN_PASSWORD ?? "",

  // Supabase (optional cloud-scale path — see PLAN.md §6)
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",

  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  // A FLOATING ALIAS on purpose. This default used to be a dated id, and on
  // 2026-08-25 Google shut `gemini-2.0-flash` down: every AI path in the app
  // started returning 404, and the /setup panel's own advice for a 404 —
  // "leave the model field empty to use the default" — pointed at the very
  // model that had been retired. A pinned id turns someone else's deprecation
  // schedule into an outage here.
  // `gemini-flash-latest` hot-swaps with each Flash release and Google gives two
  // weeks' notice by email before a breaking change behind it. Pin a dated id in
  // GEMINI_MODEL if a specific version is ever needed; the cost figures in
  // lib/analytics.ts are labelled estimates precisely because this can move.
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-flash-latest",

  // Multi-provider AI: which text engine to use — "gemini" | "groq" | "ollama".
  aiProvider: (process.env.AI_PROVIDER ?? "gemini").toLowerCase(),
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  groqModel: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  ollamaUrl: (process.env.OLLAMA_URL ?? "").replace(/\/$/, ""),
  ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.2",

  // Vision models — reading a receipt/e-wallet screenshot needs a multimodal
  // model, which is a different model id from the text one on every provider.
  // Gemini Flash is multimodal as-is; Groq needs a Llama-4 vision model; Ollama
  // needs a vision-capable local model (llava, llama3.2-vision).
  groqVisionModel: process.env.GROQ_VISION_MODEL ?? "meta-llama/llama-4-scout-17b-16e-instruct",
  ollamaVisionModel: process.env.OLLAMA_VISION_MODEL ?? "llama3.2-vision",

  // Public @handle (no leading @) so the /setup page can render a t.me deep
  // link straight to the bot. Optional — the page degrades to generic steps.

  demoTenantId: process.env.DEMO_TENANT_ID ?? "",
  // The ONLY tenants an anonymous visitor may view/switch between — the seed
  // demo personas. Real households (every consumer who signs up creates one) are
  // private and must never appear in the public persona switcher. Override with
  // DEMO_PERSONA_IDS (comma-separated) if the seed ids differ.
  //
  // Order matters: this is the order the switcher renders, and it tells the
  // story — one product at three sizes, individual → couple → family.
  demoPersonaIds: (process.env.DEMO_PERSONA_IDS ?? "psaisha33333333,cprahman2222222,hhrahman1111111")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Shared secret that guards the scheduled account-purge endpoint
  // (/api/account/purge-expired), so only your cron/task can trigger erasure.
  accountPurgeSecret: process.env.ACCOUNT_PURGE_SECRET ?? "",
};

export const isPocketBaseConfigured = (): boolean =>
  Boolean(
    config.pocketbaseUrl && config.pocketbaseAdminEmail && config.pocketbaseAdminPassword,
  );

export const isSupabaseConfigured = (): boolean =>
  Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);

// The active database layer (PocketBase is the default local-first store).
export const isDatabaseConfigured = isPocketBaseConfigured;

export const isGeminiConfigured = (): boolean => Boolean(config.geminiApiKey);
export const isGroqConfigured = (): boolean => Boolean(config.groqApiKey);
export const isOllamaConfigured = (): boolean => Boolean(config.ollamaUrl);

export type AiProvider = "gemini" | "groq" | "ollama";

export function activeAiProvider(): AiProvider {
  const p = config.aiProvider;
  return p === "groq" || p === "ollama" ? p : "gemini";
}

export function isProviderConfigured(p: AiProvider): boolean {
  if (p === "groq") return isGroqConfigured();
  if (p === "ollama") return isOllamaConfigured();
  return isGeminiConfigured();
}

