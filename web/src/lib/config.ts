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

  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",

  demoTenantId: process.env.DEMO_TENANT_ID ?? "",
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

export const isTelegramConfigured = (): boolean =>
  Boolean(config.telegramBotToken && config.telegramWebhookSecret);
