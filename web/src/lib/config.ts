// Centralized env access + capability flags. Server-only values must never be
// read in a "use client" module.

export const config = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",

  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",

  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",

  demoTenantId: process.env.DEMO_TENANT_ID ?? "",
};

export const isSupabaseConfigured = (): boolean =>
  Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);

export const isGeminiConfigured = (): boolean => Boolean(config.geminiApiKey);

export const isTelegramConfigured = (): boolean =>
  Boolean(config.telegramBotToken && config.telegramWebhookSecret);
