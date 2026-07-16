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
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",

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

  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
  // Public @handle (no leading @) so the /setup page can render a t.me deep
  // link straight to the bot. Optional — the page degrades to generic steps.
  telegramBotUsername: (process.env.TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, ""),

  demoTenantId: process.env.DEMO_TENANT_ID ?? "",

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

export const isTelegramConfigured = (): boolean =>
  Boolean(config.telegramBotToken && config.telegramWebhookSecret);
