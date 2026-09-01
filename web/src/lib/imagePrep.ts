// Getting the pixels right before anyone tries to read them.
//
// ── THE MISTAKE THIS FILE UNDOES ───────────────────────────────────────────
//
// Capture used to prepare ONE image and use it for two jobs: the bytes stored as
// the attachment, and the bytes handed to the reader. Sharing them was a
// deliberate fix at the time — preparing only inside the AI branch was why the
// on-device path stored nothing — but it silently made the STORAGE limit the
// RESOLUTION LIMIT FOR READING.
//
// A phone photographs a receipt at about 4000px on the long edge. The storage
// rendition is 1600px at JPEG q0.85, because a household ledger should not fill
// up with 4MB photographs. So the reader — vision model and Tesseract alike —
// was being shown a 2.5x downscale, re-compressed, of a document whose defining
// feature is small, low-contrast, thermally-printed text. The line items are the
// first thing to go: a total is large and survives anything, while "Kicap manis
// 500ml   6.90" is 12px tall after that reduction and turns to mush.
//
// The two jobs have nothing to do with each other. Storage is bounded by what a
// household should keep forever; reading is bounded by what the endpoint accepts
// for a few seconds. So they get their own renditions now, from the same decode:
//
//   prepareForStorage  1600px q0.85  ~250KB   kept forever, must fit MAX_BYTES
//   prepareForReading  2600px q0.92  ~1.2MB   discarded after the call
//   prepareForOcr      grayscale PNG, contrast-stretched, upscaled if small
//
// ── AND WHY OCR GETS ITS OWN, DIFFERENT ONE ────────────────────────────────
//
// Tesseract is not a vision model and does not want the same picture. It wants
// dark text on a light ground at roughly 300dpi, and it is actively hurt by JPEG
// ringing around glyph edges. A phone photo of a thermal receipt is none of
// that: it is grey text on off-white paper, unevenly lit, often smaller than
// Tesseract's comfortable range. Handing it the raw File — which is what the
// capture flow did — leaves all of that on the table.
//
// Nothing here is speculative image science. Grayscale, a percentile contrast
// stretch and an upscale to a sane working size are the three things every OCR
// preprocessing guide opens with, and they are cheap enough to run on a phone.

import { MAX_EDGE, JPEG_QUALITY, MAX_BYTES } from "./attachments";

/** Long edge for the copy sent to a reader. */
export const READ_EDGE = 2600;

/** JPEG quality for that copy. Higher than storage: nothing here is kept. */
export const READ_QUALITY = 0.92;

/**
 * Byte ceiling for the reading copy.
 *
 * /api/receipt refuses base64 longer than 8,000,000 characters, which is 6MB of
 * image. This is comfortably under it, because the step-down loop below must
 * converge before the request is built rather than after it is refused — a
 * rejection at that point costs the user the whole scan and reads as "the app
 * could not handle my photo".
 */
export const READ_MAX_BYTES = 4_000_000;

/**
 * Tesseract's comfortable range starts around here. Below it, glyph strokes are
 * thinner than the classifier expects and accuracy falls off a cliff; a
 * screenshot of an e-wallet confirmation is routinely 1080px and lands there.
 * Upscaling before recognition genuinely helps, which is counter-intuitive until
 * you remember the engine was built for scanned pages at 300dpi.
 */
const OCR_MIN_EDGE = 1800;

/**
 * And an upper bound, because Tesseract's cost is superlinear in pixels and this
 * runs on a mid-range phone. Past this the accuracy gain is gone and only the
 * seconds remain.
 */
const OCR_MAX_EDGE = 3000;

export interface Prepared {
  base64: string;
  mimeType: string;
  /** Pixels of the rendition actually produced, for logging and status copy. */
  width: number;
  height: number;
  /** True when the original bytes were passed through undecoded. See decode(). */
  passthrough: boolean;
}

/**
 * Decode once. Every rendition below is drawn from this one bitmap, so a photo
 * is never decoded three times — which on a phone is the difference between a
 * scan that feels instant and one that visibly stalls.
 *
 * Returns null for anything the browser cannot decode: HEIC on a browser without
 * a decoder for it, a blocked canvas, an exotic codec. The callers all fall back
 * to the original bytes, which the server may well cope with.
 */
async function decode(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file);
  } catch {
    return null;
  }
}

function canvasOf(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  // `willReadFrequently` matters for the OCR path, which pulls the whole buffer
  // back out twice. Without it some browsers keep the surface on the GPU and
  // every getImageData is a stall.
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return ctx ? { canvas, ctx } : null;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((r) => canvas.toBlob(r, type, quality));
}

export function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;base64,/, ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

/** Draw `bitmap` scaled so its long edge is `edge` (never upscaling). */
function scaled(bitmap: ImageBitmap, edge: number) {
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, edge / longest);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const made = canvasOf(w, h);
  if (!made) return null;
  made.ctx.drawImage(bitmap, 0, 0, w, h);
  return { ...made, w, h };
}

/**
 * A JPEG under `maxBytes`, stepping down until it fits.
 *
 * The loop is the point. A fixed quality is a guess about a photograph nobody
 * has seen: a busy supermarket receipt under fluorescent light is far less
 * compressible than a flat e-wallet screenshot, and the same settings produce
 * wildly different file sizes. Guessing high means an occasional rejection at
 * the API; guessing low means throwing away detail on every well-behaved image
 * to protect against a rare bad one. Measuring costs one or two extra encodes
 * and is right every time.
 */
async function encodeUnder(
  bitmap: ImageBitmap,
  edge: number,
  quality: number,
  maxBytes: number,
): Promise<{ blob: Blob; width: number; height: number } | null> {
  let currentEdge = edge;
  let currentQuality = quality;

  for (let attempt = 0; attempt < 5; attempt++) {
    const drawn = scaled(bitmap, currentEdge);
    if (!drawn) return null;
    const blob = await toBlob(drawn.canvas, "image/jpeg", currentQuality);
    if (!blob) return null;
    if (blob.size <= maxBytes) return { blob, width: drawn.w, height: drawn.h };

    // Quality first, then size. Dropping quality costs fine detail evenly across
    // the image; dropping resolution costs the small text first, and the small
    // text is the line items — the thing this whole exercise is for.
    if (currentQuality > 0.72) currentQuality -= 0.08;
    else currentEdge = Math.round(currentEdge * 0.8);
  }
  return null;
}

async function passthroughOf(file: File): Promise<Prepared> {
  return {
    base64: await toBase64(file),
    mimeType: file.type,
    width: 0,
    height: 0,
    passthrough: true,
  };
}

/**
 * The copy that is KEPT. Bounded by what a household should store forever, and
 * by the PocketBase field's own maxSize — see lib/attachments.ts, where all
 * three numbers live together precisely so they cannot disagree.
 */
export async function prepareForStorage(file: File, bitmap?: ImageBitmap | null): Promise<Prepared> {
  const bmp = bitmap ?? (await decode(file));
  if (!bmp) return passthroughOf(file);

  const out = await encodeUnder(bmp, MAX_EDGE, JPEG_QUALITY, MAX_BYTES);
  if (!out) return passthroughOf(file);
  return {
    base64: await toBase64(out.blob),
    mimeType: "image/jpeg",
    width: out.width,
    height: out.height,
    passthrough: false,
  };
}

/**
 * The copy that is READ and then thrown away.
 *
 * Deliberately larger and less compressed than the stored one. If the original
 * is already smaller than READ_EDGE this returns it at native resolution rather
 * than upscaling: a vision model gains nothing from interpolated pixels, and the
 * bytes would be spent on invented detail.
 */
export async function prepareForReading(file: File, bitmap?: ImageBitmap | null): Promise<Prepared> {
  const bmp = bitmap ?? (await decode(file));
  if (!bmp) return passthroughOf(file);

  // A small original that is already within budget is best sent untouched —
  // re-encoding a JPEG always loses something and can only lose more.
  const longest = Math.max(bmp.width, bmp.height);
  if (longest <= READ_EDGE && file.size <= READ_MAX_BYTES && file.type === "image/jpeg") {
    return {
      base64: await toBase64(file),
      mimeType: file.type,
      width: bmp.width,
      height: bmp.height,
      passthrough: true,
    };
  }

  const out = await encodeUnder(bmp, READ_EDGE, READ_QUALITY, READ_MAX_BYTES);
  if (!out) return passthroughOf(file);
  return {
    base64: await toBase64(out.blob),
    mimeType: "image/jpeg",
    width: out.width,
    height: out.height,
    passthrough: false,
  };
}

/**
 * The copy TESSERACT reads: grayscale, contrast-stretched, sized into the
 * engine's comfortable range, and PNG rather than JPEG.
 *
 * Each of those is doing a specific job on a specific failure:
 *
 *   GRAYSCALE by luma, not by averaging the channels. Thermal paper goes yellow
 *   with age and receipts are photographed under every colour temperature a
 *   kitchen light can produce; a flat channel average turns a warm-lit receipt
 *   into low-contrast mud, while luma weighting tracks how dark the ink
 *   actually is.
 *
 *   CONTRAST STRETCH between the 2nd and 98th percentile of the histogram, not
 *   between the absolute min and max. One dark speck and one blown highlight —
 *   which every phone photo has — pin the true min and max to 0 and 255 and the
 *   stretch does nothing at all. Percentiles ignore the specks and map the
 *   actual paper-to-ink range onto the full scale, which is what turns grey
 *   thermal print into something with edges.
 *
 *   UPSCALE when small. Counter-intuitive, and real: Tesseract's classifier was
 *   trained on 300dpi scans, and an e-wallet screenshot at 1080px presents
 *   strokes thinner than it expects.
 *
 *   PNG because JPEG ringing puts halos on exactly the high-contrast glyph edges
 *   the recogniser keys on. The file is bigger; it never leaves the device.
 *
 * Returns null when the image cannot be decoded, and the caller then hands
 * Tesseract the original File — which is what it always used to get.
 */
export async function prepareForOcr(file: File, bitmap?: ImageBitmap | null): Promise<Blob | null> {
  const bmp = bitmap ?? (await decode(file));
  if (!bmp) return null;

  const longest = Math.max(bmp.width, bmp.height);
  const edge = Math.min(OCR_MAX_EDGE, Math.max(OCR_MIN_EDGE, longest));
  const scale = edge / longest;
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));

  const made = canvasOf(w, h);
  if (!made) return null;
  const { canvas, ctx } = made;
  // Browsers default to a decent smoothing filter; say so explicitly, because a
  // nearest-neighbour upscale would add exactly the stair-stepped edges the
  // recogniser then reads as noise.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);

  let image: ImageData;
  try {
    image = ctx.getImageData(0, 0, w, h);
  } catch {
    // A tainted canvas. Nothing here is cross-origin in practice, but a failure
    // to read pixels must degrade to "OCR the original" rather than to no scan.
    return null;
  }

  const px = image.data;
  const histogram = new Uint32Array(256);

  // Pass 1: to luma, and count.
  for (let i = 0; i < px.length; i += 4) {
    const y = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    const v = y < 0 ? 0 : y > 255 ? 255 : Math.round(y);
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
    histogram[v]++;
  }

  // The 2nd and 98th percentiles: ink and paper, ignoring specks and glare.
  const total = w * h;
  const lowTarget = total * 0.02;
  const highTarget = total * 0.98;
  let low = 0;
  let high = 255;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += histogram[v];
    if (seen >= lowTarget) {
      low = v;
      break;
    }
  }
  seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += histogram[v];
    if (seen >= highTarget) {
      high = v;
      break;
    }
  }

  // Pass 2: stretch, but only when there is a range worth stretching. A span
  // this narrow is a blank or blown-out photograph, and expanding it would
  // amplify sensor noise into convincing-looking glyphs — the one outcome worse
  // than failing to read, because the parser downstream cannot tell invented
  // characters from real ones.
  const span = high - low;
  if (span >= 24) {
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      const scaledV = ((v - low) * 255) / span;
      lut[v] = scaledV < 0 ? 0 : scaledV > 255 ? 255 : Math.round(scaledV);
    }
    for (let i = 0; i < px.length; i += 4) {
      const v = lut[px[i]];
      px[i] = v;
      px[i + 1] = v;
      px[i + 2] = v;
    }
  }

  ctx.putImageData(image, 0, 0);
  return toBlob(canvas, "image/png");
}

/**
 * Everything capture needs from one photograph, from a single decode.
 *
 * Bundled because the three renditions are always wanted together and each one
 * separately would decode the file again — three times the slowest step in the
 * flow, on the device least able to afford it.
 */
export async function prepareAll(file: File): Promise<{
  store: Prepared;
  read: Prepared;
  ocr: Blob | null;
}> {
  const bitmap = await decode(file);

  // Undecodable — HEIC without a decoder, an exotic codec. Answered here rather
  // than by letting each helper find out for itself: they each take an optional
  // bitmap and fall back to decoding when they are not given one, so passing a
  // null through would make three more doomed decode attempts on a file the
  // browser has already refused once.
  if (!bitmap) {
    const raw = await passthroughOf(file);
    return { store: raw, read: raw, ocr: null };
  }

  try {
    const [store, read, ocr] = await Promise.all([
      prepareForStorage(file, bitmap),
      prepareForReading(file, bitmap),
      prepareForOcr(file, bitmap),
    ]);
    return { store, read, ocr };
  } finally {
    bitmap?.close();
  }
}
