import { NextResponse } from "next/server";
import { config, isTelegramConfigured, isDatabaseConfigured } from "@/lib/config";
import {
  addManualTransaction,
  listBuckets,
  resolveTenantByChannel,
  resolveWalletNode,
  setTransactionVoided,
  linkChannel,
} from "@/lib/graph";
import { readReceipt, type ReceiptResult } from "@/lib/receipt";
import {
  answerCallback,
  editMessage,
  getFileBase64,
  largestPhotoId,
  sendMessage,
  type InlineButton,
} from "@/lib/telegram";
import { pbCreate, pbDelete, pbFirst, pbStr } from "@/lib/pocketbase";

export const runtime = "nodejs";

// The bot is a *fast* channel: forward a receipt, get on with your day. So the
// happy path still saves immediately — but everything it does is now reversible
// from the same message, and a payment the arithmetic says is already recorded
// is never saved without being asked. (Before this, the bot auto-saved whatever
// a single ungrounded OCR call returned and offered `Reply "no" if that's
// wrong` — which nothing handled.)

const MAX_FILE_B64 = 8_000_000;

// There is no logged-in user on this channel, but the ledger still wants to know
// who did it. The chat id is the truest answer available.
const actorFor = (chatId: number) => ({ id: "", email: `telegram:${chatId}` });

async function linkChat(chatId: number): Promise<string | null> {
  if (!config.demoTenantId) return null;
  await linkChannel(config.demoTenantId, "telegram", String(chatId));
  return config.demoTenantId;
}

async function tenantFor(chatId: number): Promise<string | null> {
  return (await resolveTenantByChannel("telegram", String(chatId))) ?? (await linkChat(chatId));
}

function money(amount: number, currency = "MYR"): string {
  return `${currency} ${amount.toFixed(2)}`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "an earlier date"
    : d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

// ── Saving ──────────────────────────────────────────────────────────────────

async function commit(
  tenantId: string,
  chatId: number,
  result: ReceiptResult,
): Promise<{ text: string; buttons: InlineButton[][] }> {
  const { extraction, analysis } = result;

  const bucket = analysis?.bucket
    ? { id: analysis.bucket.nodeId, label: analysis.bucket.label }
    : await resolveWalletNode(tenantId);

  const stored = await addManualTransaction(
    tenantId,
    {
      vendorLabel: extraction.vendor || "Unknown",
      amount: extraction.amount,
      walletNodeId: bucket.id,
      occurredAt: extraction.occurredAt || undefined,
      source: "telegram",
      confidence: extraction.confidence,
    },
    actorFor(chatId),
  );

  const lines = [
    `✅ Logged ${money(extraction.amount, extraction.currency)} at ${extraction.vendor || "Unknown"}`,
    `🪣 ${stored.walletLabel}${analysis?.bucket?.reason ? ` — ${analysis.bucket.reason}` : ""}`,
  ];
  if (extraction.confidence < 0.6) {
    lines.push(`⚠️ I'm only ${Math.round(extraction.confidence * 100)}% sure — worth a check.`);
  }
  if (analysis?.subscription) lines.push(`🔄 ${analysis.subscription.note}`);
  if (analysis?.anomaly) lines.push(`📈 ${analysis.anomaly.note}`);
  if (analysis?.insight) lines.push(`🍯 ${analysis.insight}`);

  return {
    text: lines.join("\n"),
    buttons: [
      [
        { text: "↩️ Undo", callback_data: `undo:${stored.transactionId}` },
        { text: "🪣 Change bucket", callback_data: `rebkt:${stored.transactionId}` },
      ],
    ],
  };
}

// ── Photo → receipt ─────────────────────────────────────────────────────────

async function handlePhoto(chatId: number, tenantId: string, fileId: string): Promise<void> {
  const { base64, mimeType } = await getFileBase64(fileId);
  if (base64.length > MAX_FILE_B64) {
    await sendMessage(chatId, "That image is too big for me — under 6 MB, please.");
    return;
  }

  const result = await readReceipt(tenantId, base64, mimeType);
  const { extraction, analysis } = result;

  if (!extraction.amount) {
    await sendMessage(
      chatId,
      "I couldn't find an amount on that one. A straighter, brighter shot of the total usually does it 📸",
    );
    return;
  }

  // Arithmetic says this exact payment is already in the books. Do not save it —
  // ask. This is the single most common way a household's numbers go wrong: the
  // same receipt forwarded twice, once by each partner.
  const dupe = analysis?.duplicateOf;
  if (dupe?.certainty === "exact") {
    const pending = await pbCreate<{ id: string }>("pending_captures", {
      tenant: tenantId,
      channel: "telegram",
      external_id: String(chatId),
      payload: result as unknown as Record<string, unknown>,
      reason: dupe.why,
    });

    await sendMessage(
      chatId,
      [
        `🔁 I think you've already logged this one.`,
        `${money(extraction.amount, extraction.currency)} at ${extraction.vendor} — already recorded on ${shortDate(dupe.occurredAt)}.`,
        `Saving it again would count it twice.`,
      ].join("\n"),
      [
        [
          { text: "🗑 Skip it", callback_data: `drop:${pending.id}` },
          { text: "✅ Save anyway", callback_data: `keep:${pending.id}` },
        ],
      ],
    );
    return;
  }

  const { text, buttons } = await commit(tenantId, chatId, result);
  const prefix = dupe ? `🔁 Similar to ${dupe.vendor} ${money(dupe.amount)} on ${shortDate(dupe.occurredAt)} — saved anyway.\n\n` : "";
  await sendMessage(chatId, prefix + text, buttons);
}

// ── Button taps ─────────────────────────────────────────────────────────────

async function handleCallback(
  chatId: number,
  messageId: number,
  callbackId: string,
  data: string,
): Promise<void> {
  const tenantId = await tenantFor(chatId);
  if (!tenantId) {
    await answerCallback(callbackId, "Send /start first.");
    return;
  }

  const [action, a, b] = data.split(":");

  if (action === "undo") {
    await setTransactionVoided(tenantId, a, true, actorFor(chatId), "Undone from Telegram");
    await answerCallback(callbackId, "Undone");
    await editMessage(chatId, messageId, "↩️ Undone. That spend is no longer counted.");
    return;
  }

  if (action === "rebkt") {
    const buckets = await listBuckets(tenantId);
    // Telegram renders one column per row nicely up to ~8 buckets; beyond that
    // the keyboard gets unusable, so cap it and let the web app handle the rest.
    const rows: InlineButton[][] = buckets
      .slice(0, 8)
      .map((bk) => [{ text: bk.label, callback_data: `setbkt:${a}:${bk.id}` }]);
    rows.push([{ text: "✕ Cancel", callback_data: `nvm:${a}` }]);
    await answerCallback(callbackId);
    await editMessage(chatId, messageId, "🪣 Which bucket should this go in?", rows);
    return;
  }

  if (action === "setbkt") {
    const { updateTransaction } = await import("@/lib/graph");
    const updated = await updateTransaction(tenantId, a, { walletNodeId: b }, actorFor(chatId));
    const buckets = await listBuckets(tenantId);
    const label = buckets.find((bk) => bk.id === b)?.label ?? "that bucket";
    await answerCallback(callbackId, `Moved to ${label}`);
    await editMessage(
      chatId,
      messageId,
      `🪣 Moved to ${label} — ${money(Number(updated.amount))}.\nI'll remember that for next time.`,
      [[{ text: "↩️ Undo", callback_data: `undo:${a}` }]],
    );
    return;
  }

  if (action === "keep") {
    const pending = await pbFirst<{ id: string; payload: ReceiptResult }>(
      "pending_captures",
      `id = ${pbStr(a)} && tenant = ${pbStr(tenantId)}`,
    );
    if (!pending) {
      await answerCallback(callbackId, "That one's already dealt with.");
      await editMessage(chatId, messageId, "🗑 Nothing left to save here.");
      return;
    }
    const { text, buttons } = await commit(tenantId, chatId, pending.payload);
    await pbDelete("pending_captures", pending.id);
    await answerCallback(callbackId, "Saved");
    await editMessage(chatId, messageId, text, buttons);
    return;
  }

  if (action === "drop") {
    await pbDelete("pending_captures", a).catch(() => {});
    await answerCallback(callbackId, "Skipped");
    await editMessage(chatId, messageId, "🗑 Skipped — nothing was saved.");
    return;
  }

  if (action === "nvm") {
    await answerCallback(callbackId);
    await editMessage(chatId, messageId, "Left as it was.", [
      [{ text: "↩️ Undo", callback_data: `undo:${a}` }],
    ]);
    return;
  }

  await answerCallback(callbackId);
}

// ── Webhook ─────────────────────────────────────────────────────────────────

interface Update {
  message?: {
    chat?: { id?: number };
    text?: string;
    photo?: Array<{ file_id: string; file_size?: number }>;
    document?: { file_id: string; mime_type?: string; file_name?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat?: { id?: number } };
  };
}

export async function POST(request: Request) {
  if (!isTelegramConfigured() || !isDatabaseConfigured()) {
    return NextResponse.json({ ok: true }); // ack silently if not wired up
  }

  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== config.telegramWebhookSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let update: Update;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  // A tapped button.
  const cb = update.callback_query;
  if (cb?.message?.chat?.id && cb.data) {
    try {
      await handleCallback(cb.message.chat.id, cb.message.message_id, cb.id, cb.data);
    } catch (err) {
      await answerCallback(cb.id, "That didn't work — try the web app.");
      return NextResponse.json({ ok: true, error: err instanceof Error ? err.message : "error" });
    }
    return NextResponse.json({ ok: true });
  }

  const chatId = update.message?.chat?.id;
  if (!chatId) return NextResponse.json({ ok: true });

  try {
    if (update.message?.text?.startsWith("/start")) {
      const tenant = await linkChat(chatId);
      await sendMessage(
        chatId,
        tenant
          ? "🍯 Welcome to HoneyMoney! You're linked.\n\nForward me a receipt or e-wallet screenshot and I'll log it — no typing needed. Every message I send has an Undo button, so nothing I get wrong is permanent."
          : "🍯 Welcome to HoneyMoney! Your account isn't linked yet. Ask your admin to connect this chat.",
      );
      return NextResponse.json({ ok: true });
    }

    const photoId = largestPhotoId(update.message?.photo ?? []);
    if (photoId) {
      const tenantId = await tenantFor(chatId);
      if (!tenantId) {
        await sendMessage(chatId, "Send /start first to link your household.");
        return NextResponse.json({ ok: true });
      }
      await handlePhoto(chatId, tenantId, photoId);
      return NextResponse.json({ ok: true });
    }

    // A forwarded file. An image sent as a document still works; a PDF statement
    // is a many-row job that belongs in the web importer, and saying so is much
    // better than the silent shrug this used to give.
    const doc = update.message?.document;
    if (doc) {
      const tenantId = await tenantFor(chatId);
      if (!tenantId) {
        await sendMessage(chatId, "Send /start first to link your household.");
        return NextResponse.json({ ok: true });
      }
      if (doc.mime_type === "application/pdf") {
        await sendMessage(
          chatId,
          "📄 That's a statement, not a receipt — it has many rows, and I'd rather you saw them all before anything is saved.\n\nOpen HoneyMoney → Import statement, and drop the PDF there. I'll pull out every transaction, flag the ones you've already logged, and let you tick what to keep.",
        );
        return NextResponse.json({ ok: true });
      }
      if (doc.mime_type?.startsWith("image/")) {
        await handlePhoto(chatId, tenantId, doc.file_id);
        return NextResponse.json({ ok: true });
      }
    }

    await sendMessage(chatId, "Forward me a receipt or e-wallet screenshot 📸 and I'll do the rest.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    await sendMessage(chatId, "Hmm, I couldn't read that one — try a clearer screenshot.");
    return NextResponse.json({ ok: true, error: message });
  }
}
