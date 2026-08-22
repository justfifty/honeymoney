// What a stored receipt image is allowed to be.
//
// One module so the client's downscaler, the API's validator and the PocketBase
// migration cannot drift into three different opinions about the limit — the
// failure mode being a photo the browser happily prepares and the server then
// rejects, which reads to the user as "the app lost my receipt".
//
// Isomorphic: constants and validation only, no browser or node built-ins, so
// both sides import the same file.

/** Long edge, in px, the client downscales to before upload. */
export const MAX_EDGE = 1600;

/** JPEG quality for that downscale. 0.85 keeps thermal-paper text legible. */
export const JPEG_QUALITY = 0.85;

/**
 * Per-file ceiling, matching `maxSize` on the PocketBase field. A 1600px q0.85
 * photo lands near 250KB, so this is roughly 8x headroom for an awkward scan
 * rather than a target.
 */
export const MAX_BYTES = 2 * 1024 * 1024;

/** Matching `maxSelect` on the field. A receipt occasionally runs to a second photo. */
export const MAX_FILES = 5;

export const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/** One image on its way to storage, as it crosses the wire. */
export interface IncomingAttachment {
  name: string;
  type: string;
  /** Base64, without the `data:` prefix. */
  dataBase64: string;
}

export interface DecodedAttachment {
  name: string;
  type: string;
  bytes: Uint8Array;
}

/**
 * Decode and check what a client sent. Throws with a message meant to be read by
 * a person, because it surfaces in the capture flow.
 *
 * Size is measured on the DECODED bytes, not the base64: base64 inflates by a
 * third, so validating the string length would reject files that are actually
 * within the limit and let through ones that are not, depending on which side of
 * the ratio you happened to test with.
 */
export function decodeAttachments(raw: unknown): DecodedAttachment[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error("attachments must be an array");
  if (raw.length > MAX_FILES) {
    throw new Error(`At most ${MAX_FILES} images per record.`);
  }

  return raw.map((item, i) => {
    const a = item as Partial<IncomingAttachment>;
    const type = String(a?.type ?? "");
    if (!(ALLOWED_TYPES as readonly string[]).includes(type)) {
      throw new Error(`Image ${i + 1} is not a supported type (${type || "unknown"}).`);
    }
    const b64 = String(a?.dataBase64 ?? "");
    if (!b64) throw new Error(`Image ${i + 1} is empty.`);

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(Buffer.from(b64, "base64"));
    } catch {
      throw new Error(`Image ${i + 1} could not be decoded.`);
    }
    if (!bytes.length) throw new Error(`Image ${i + 1} is empty.`);
    if (bytes.length > MAX_BYTES) {
      throw new Error(
        `Image ${i + 1} is ${(bytes.length / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_BYTES / 1024 / 1024} MB.`,
      );
    }

    return { name: safeName(a?.name, type), type, bytes };
  });
}

/**
 * A filename that cannot escape its directory or carry surprises. PocketBase
 * appends its own random suffix, so this only has to be sane, not unique — and
 * a name is worth keeping at all because it is what a user sees if they ever
 * export their data.
 */
export function safeName(name: unknown, type: string): string {
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const base = String(name ?? "receipt")
    .replace(/\.[^.]*$/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  return `${base || "receipt"}.${ext}`;
}

/** The URL a browser fetches a stored attachment from. Never a PocketBase URL. */
export function attachmentUrl(txId: string, filename: string, thumb?: "100x100" | "400x0"): string {
  const q = thumb ? `?thumb=${thumb}` : "";
  return `/api/attachment/${encodeURIComponent(txId)}/${encodeURIComponent(filename)}${q}`;
}
