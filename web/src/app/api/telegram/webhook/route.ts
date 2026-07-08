import { NextResponse } from "next/server";
import { config, isTelegramConfigured, isSupabaseConfigured } from "@/lib/config";
import { getServiceClient } from "@/lib/supabaseServer";
import { parseReceipt } from "@/lib/gemini";
import { ingestReceipt, resolveTenantByChannel } from "@/lib/graph";
import { sendMessage, getFileBase64, largestPhotoId } from "@/lib/telegram";

export const runtime = "nodejs";

// Auto-link a Telegram chat to the demo tenant on /start (MVP onboarding).
async function linkChat(chatId: number): Promise<string | null> {
  if (!config.demoTenantId) return null;
  const supabase = getServiceClient();
  await supabase
    .from("channel_links")
    .upsert(
      {
        tenant_id: config.demoTenantId,
        channel: "telegram",
        external_id: String(chatId),
      },
      { onConflict: "channel,external_id" },
    );
  return config.demoTenantId;
}

export async function POST(request: Request) {
  if (!isTelegramConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ ok: true }); // ack silently if not wired up
  }

  // Verify the webhook secret Telegram echoes back.
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== config.telegramWebhookSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let update: {
    message?: {
      chat?: { id?: number };
      text?: string;
      photo?: Array<{ file_id: string; file_size?: number }>;
    };
  };
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const chatId = update.message?.chat?.id;
  if (!chatId) return NextResponse.json({ ok: true });

  try {
    // /start -> onboard + link
    if (update.message?.text?.startsWith("/start")) {
      const tenant = await linkChat(chatId);
      await sendMessage(
        chatId,
        tenant
          ? "🍯 Welcome to HoneyMoney! You're linked. Forward me a receipt or e-wallet screenshot and I'll track it — no typing needed."
          : "🍯 Welcome to HoneyMoney! Your account isn't linked yet. Ask your admin to connect this chat.",
      );
      return NextResponse.json({ ok: true });
    }

    // Photo -> OCR -> graph
    const photoId = largestPhotoId(update.message?.photo ?? []);
    if (photoId) {
      const tenantId =
        (await resolveTenantByChannel("telegram", String(chatId))) ??
        (await linkChat(chatId));
      if (!tenantId) {
        await sendMessage(chatId, "Send /start first to link your household.");
        return NextResponse.json({ ok: true });
      }

      const { base64, mimeType } = await getFileBase64(photoId);
      const parsed = await parseReceipt(base64, mimeType);
      const stored = await ingestReceipt(tenantId, parsed, "telegram");

      await sendMessage(
        chatId,
        `✅ Logged ${parsed.currency} ${parsed.amount.toFixed(2)} at ${parsed.vendor} ` +
          `→ ${stored.walletLabel} (confidence ${(parsed.confidence * 100).toFixed(0)}%).\n` +
          `Reply "no" if that's wrong.`,
      );
      return NextResponse.json({ ok: true });
    }

    await sendMessage(
      chatId,
      "Forward me a receipt or e-wallet screenshot 📸 and I'll do the rest.",
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    await sendMessage(chatId, "Hmm, I couldn't read that one — try a clearer screenshot.");
    return NextResponse.json({ ok: true, error: message });
  }
}
