// Minimal Telegram Bot API helpers (REST).

import { config } from "./config";

const API = "https://api.telegram.org";

export interface InlineButton {
  text: string;
  callback_data: string;
}

// Telegram hard-caps callback_data at 64 bytes and silently rejects the whole
// keyboard if any button exceeds it — which shows up as buttons that simply do
// nothing. Catch it here, where the cause is obvious, rather than in the wild.
function checkButtons(rows: InlineButton[][]): void {
  for (const row of rows) {
    for (const b of row) {
      if (Buffer.byteLength(b.callback_data, "utf8") > 64) {
        throw new Error(`callback_data too long (${b.callback_data.length}): ${b.callback_data}`);
      }
    }
  }
}

async function call(method: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${API}/bot${config.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  buttons?: InlineButton[][],
): Promise<void> {
  if (buttons) checkButtons(buttons);
  await call("sendMessage", {
    chat_id: chatId,
    text,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

// Rewrite the message the user is looking at. This is what turns "✅ Logged…"
// into "↩️ Undone" in place, so the chat reads as a record of what is true now
// rather than a stack of contradicting claims.
export async function editMessage(
  chatId: number | string,
  messageId: number,
  text: string,
  buttons?: InlineButton[][],
): Promise<void> {
  if (buttons) checkButtons(buttons);
  await call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: { inline_keyboard: buttons ?? [] },
  });
}

// Every callback_query must be answered or the user's button spins forever.
export async function answerCallback(callbackId: string, text?: string): Promise<void> {
  await call("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text } : {}) });
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

// Resolve a Telegram file_id to base64 bytes.
export async function getFileBase64(
  fileId: string,
): Promise<{ base64: string; mimeType: string; fileName: string }> {
  const metaRes = await fetch(
    `${API}/bot${config.telegramBotToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const meta = await metaRes.json();
  const filePath: string | undefined = meta?.result?.file_path;
  if (!filePath) throw new Error("Telegram getFile: no file_path");

  const fileRes = await fetch(`${API}/file/bot${config.telegramBotToken}/${filePath}`);
  if (!fileRes.ok) throw new Error(`Telegram file download failed: ${fileRes.status}`);
  const buf = Buffer.from(await fileRes.arrayBuffer());

  // The old code guessed the type from the extension and defaulted everything it
  // didn't recognise to image/jpeg — so a forwarded PDF statement was handed to
  // the vision model labelled as a photo, and failed in a way nobody could read.
  const ext = (filePath.split(".").pop() ?? "").toLowerCase();
  const mimeType = MIME_BY_EXT[ext] ?? "application/octet-stream";

  return { base64: buf.toString("base64"), mimeType, fileName: filePath.split("/").pop() ?? "file" };
}

// Telegram photos arrive as an array of sizes; pick the largest.
export function largestPhotoId(
  photos: Array<{ file_id: string; file_size?: number }>,
): string | null {
  if (!photos?.length) return null;
  return photos.reduce((a, b) => ((b.file_size ?? 0) > (a.file_size ?? 0) ? b : a)).file_id;
}
