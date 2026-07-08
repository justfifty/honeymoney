// Minimal Telegram Bot API helpers (REST).

import { config } from "./config";

const API = "https://api.telegram.org";

export async function sendMessage(chatId: number | string, text: string): Promise<void> {
  await fetch(`${API}/bot${config.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

// Resolve a Telegram file_id to base64 bytes (for Gemini vision).
export async function getFileBase64(
  fileId: string,
): Promise<{ base64: string; mimeType: string }> {
  const metaRes = await fetch(
    `${API}/bot${config.telegramBotToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const meta = await metaRes.json();
  const filePath: string | undefined = meta?.result?.file_path;
  if (!filePath) throw new Error("Telegram getFile: no file_path");

  const fileRes = await fetch(
    `${API}/file/bot${config.telegramBotToken}/${filePath}`,
  );
  if (!fileRes.ok) throw new Error(`Telegram file download failed: ${fileRes.status}`);
  const buf = Buffer.from(await fileRes.arrayBuffer());

  const mimeType = filePath.endsWith(".png")
    ? "image/png"
    : filePath.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

  return { base64: buf.toString("base64"), mimeType };
}

// Telegram photos arrive as an array of sizes; pick the largest.
export function largestPhotoId(
  photos: Array<{ file_id: string; file_size?: number }>,
): string | null {
  if (!photos?.length) return null;
  return photos.reduce((a, b) => ((b.file_size ?? 0) > (a.file_size ?? 0) ? b : a))
    .file_id;
}
