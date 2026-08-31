"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { t as translate, type Locale } from "@/lib/i18n";
import { parseReceiptText } from "@/lib/voiceParse";
import { MAX_EDGE, JPEG_QUALITY, safeName, type IncomingAttachment } from "@/lib/attachments";

// Capture a spend by SCANNING, PHOTOGRAPHING or PASTING.
//
// Two tiers, and the app is fully usable on either:
//   • On-device (default, zero tokens, zero cost): tesseract.js OCR, parsed by
//     lib/voiceParse.ts. Works offline, nothing leaves the machine — the PDPA /
//     data-residency story.
//   • AI-assisted (when a provider is configured): the image goes to
//     /api/receipt, which grounds it in the household's real graph and can also
//     suggest a bucket, flag a duplicate and spot an anomaly.
//
// The AI tier is strictly an enhancement. Every AI failure degrades to the
// on-device result rather than to an error.
//
// There was a fourth way in — SPEAKING, via the browser Speech Recognition API.
// It was removed on 2026-08-22: the API handles Manglish and BM/English
// code-switching poorly, and that is a limit of the API rather than something
// tuning could reach. If voice returns it will be recorded audio handed to the
// user's own AI key, not this API. See NEXT.md §6.6 Task 3.

// App locale → tesseract traineddata. The old code hardcoded "eng" for every
// language, so a Malay or Chinese receipt was OCR'd with an English model.
const OCR_LANG: Record<string, string> = {
  en: "eng",
  ms: "msa",
  zh: "chi_sim",
  "zh-Hant": "chi_tra",
  ta: "tam",
  hi: "hin",
};

// The engine and language models we serve ourselves — staged by
// web/scripts/stage-ocr-assets.mjs into public/ocr/ and precached by the
// service worker.
//
// WHY THIS EXISTS AT ALL: tesseract.js defaults to fetching its worker, its
// WASM core and its traineddata from a CDN at the moment you press scan. So the
// feature we describe as running on your device did not run without the
// internet — the catch below even said so, and then fell back to English, which
// also had to be downloaded. Pointing at our own origin makes the claim true:
// after one scan the files are in the service worker cache and the network is
// never needed again.
const OCR_PATHS = {
  workerPath: "/ocr/worker.min.js",
  corePath: "/ocr/",
  langPath: "/ocr",
  // The models are stored gzipped, which is how tessdata ships them.
  gzip: true,
} as const;

// Only these two are staged locally. The other four still work — online, from
// the CDN — and offline they fall through to English, which reads the digits.
// See the staging script on why 65 MB of models is the wrong trade.
const LOCAL_LANGS = new Set(["eng", "msa"]);

export interface Captured {
  vendor?: string;
  amount?: number;
  currency?: string;
  occurredAt?: string;
  bucketNodeId?: string;
  note?: string;
  /**
   * The itemised rows, when the receipt had any.
   *
   * lib/receipt.ts has parsed these from the AI path since Task 6 and no
   * component ever read them, so an itemised receipt looked identical to a bare
   * total. They now also come from the on-device parser, which means itemisation
   * works with no AI key configured -- the AI route 501s without one.
   */
  lineItems?: { label: string; amount: number }[];
  confidence?: number;
  /**
   * The image itself, downscaled and ready to store. Until 2026-08-22 this was
   * read for its numbers and then dropped on the floor — the app has never kept
   * a receipt, which is why Task 4's "attachments can't be opened" turned out to
   * be "there are no attachments". Carried on the SAME object as the parse so
   * the picture and the figures it produced cannot be separated by a caller that
   * forgets one of them.
   */
  attachment?: IncomingAttachment;
}

export interface CaptureAnalysis {
  bucket?: { nodeId: string; label: string; reason: string } | null;
  duplicateOf?: {
    id: string;
    vendor: string;
    amount: number;
    occurredAt: string;
    why: string;
    certainty: "exact" | "likely";
  } | null;
  subscription?: { likely: boolean; cadence: string; note: string } | null;
  anomaly?: { flagged: boolean; note: string } | null;
  insight?: string;
}

export default function SpendCapture({
  onResult,
  onAnalysis,
  lang = "en",
  knownVendors = [],
  aiEnabled = true,
}: {
  onResult: (c: Captured) => void;
  onAnalysis?: (a: CaptureAnalysis | null) => void;
  lang?: Locale;
  knownVendors?: string[];
  aiEnabled?: boolean;
}) {
  const tr = (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars);

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);

  // ── Images: file, camera, drag-drop, paste ───────────────────────────────

  async function scanOnDevice(file: File, attachment?: IncomingAttachment) {
    setStatus(tr("g.cap.scanning", { pct: 0 }));
    try {
      const { recognize } = await import("tesseract.js");
      const ocrLang = OCR_LANG[lang] ?? "eng";
      const logger = (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text") {
          setStatus(tr("g.cap.scanning", { pct: Math.round(m.progress * 100) }));
        }
      };
      // A language we host is read from our origin; one we do not is left to
      // tesseract's own default so it can still fetch it when there IS a
      // network. Forcing langPath for every language would break the four
      // non-staged locales online as well as off, which would be a worse
      // outcome than the one being fixed.
      const opts = LOCAL_LANGS.has(ocrLang)
        ? { ...OCR_PATHS, logger }
        : { workerPath: OCR_PATHS.workerPath, corePath: OCR_PATHS.corePath, logger };
      let data;
      try {
        ({ data } = await recognize(file, ocrLang, opts));
      } catch {
        // No model for that language, or no network to fetch one. English is
        // staged locally, so this fallback works offline — which is the whole
        // point of it and was not true before.
        ({ data } = await recognize(file, "eng", { ...OCR_PATHS, logger }));
      }

      const parsed = parseReceiptText(data.text || "", knownVendors);
      onResult({ ...parsed, attachment });
      setStatus(
        parsed.amount || parsed.vendor
          ? tr("g.cap.readResult", {
              vendor: parsed.vendor ? ` “${parsed.vendor}”` : "",
              amount: parsed.amount
                ? ` · ${parsed.currency ? `${parsed.currency} ` : ""}${parsed.amount}`
                : "",
            })
          : tr("g.cap.readFail"),
      );
    } catch {
      // OCR failed, but the photo is still worth keeping: the user can read it
      // themselves and type the amount, which is strictly better than losing it.
      if (attachment) onResult({ attachment });
      setStatus(tr("g.cap.scanFail"));
    }
  }

  const handleImage = useCallback(
    async (file: File) => {
      // A card or bank statement is a different job — many rows, not one payment
      // — and it has its own importer. Silently failing here is what people used
      // to get; point them at the thing that actually does it.
      if (file.type === "application/pdf") {
        setStatus(tr("cap.pdfToImport"));
        return;
      }
      if (!file.type.startsWith("image/")) {
        setStatus(tr("cap.notAnImage"));
        return;
      }
      setBusy(true);
      setPreview(URL.createObjectURL(file));
      onAnalysis?.(null);

      // Downscale ONCE, up front, and use the same bytes for both jobs: what is
      // sent to the reader and what is stored. Preparing twice would re-encode
      // the image a second time for no gain, and preparing only inside the AI
      // branch — which is what this did — is why the on-device path stored
      // nothing at all.
      let attachment: IncomingAttachment | undefined;
      try {
        const { base64, mimeType } = await prepareImage(file);
        attachment = { name: safeName(file.name, mimeType), type: mimeType, dataBase64: base64 };
      } catch {
        // An image we cannot re-encode is one we should not store either; the
        // parse below still runs on the original file.
      }

      // Try the AI reader first — it's the only path that gets currency, date
      // and a confidence score, and it can reason about the household.
      if (aiEnabled && attachment) {
        setStatus(tr("cap.reading"));
        try {
          const { dataBase64: base64, type: mimeType } = attachment;
          const res = await fetch("/api/receipt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: base64, mimeType }),
          });
          const data = await res.json();

          if (res.ok && data.extraction) {
            const e = data.extraction;
            onResult({
              vendor: e.vendor || undefined,
              amount: e.amount || undefined,
              currency: e.currency || undefined,
              occurredAt: e.occurredAt || undefined,
              bucketNodeId: data.analysis?.bucket?.nodeId,
              confidence: e.confidence,
              attachment,
            });
            onAnalysis?.(data.analysis ?? null);
            // When the receipt printed a breakdown, show it so the user can see
            // the subtotal/service/tax behind the total, not just the total.
            // NOT `?? "MYR"`. An unknown currency is now an empty string
            // (lib/receipt.ts stopped defaulting it), and printing "MYR" beside
            // a figure we did not read a currency for is the same small lie
            // that put CHF 54.50 into a ledger as RM 8.90. Say the number
            // without a unit instead; the form falls back to the household's
            // own currency, which is a stated default rather than a claim
            // about this receipt.
            const cur = e.currency || "";
            const parts: string[] = [];
            if (e.subtotal) parts.push(`${tr("cap.subtotal")} ${cur} ${e.subtotal}`.replace("  ", " "));
            if (e.serviceCharge) parts.push(`${tr("cap.service")} ${cur} ${e.serviceCharge}`);
            if (e.tax) parts.push(`${tr("cap.tax")} ${cur} ${e.tax}`);
            const breakdown = parts.length ? `  ·  ${parts.join(" · ")}` : "";
            setStatus(
              (e.amount || e.vendor
                ? tr("g.cap.readResult", {
                    vendor: e.vendor ? ` “${e.vendor}”` : "",
                    amount: e.amount ? ` · ${cur ? `${cur} ` : ""}${e.amount}` : "",
                  })
                : tr("g.cap.readFail")) + breakdown,
            );
            setBusy(false);
            return;
          }
          // 501 = no AI key configured. Expected, not exceptional: fall through
          // to on-device OCR, which is the app's default anyway.
        } catch {
          /* fall through to on-device */
        }
      }

      await scanOnDevice(file, attachment);
      setBusy(false);
    },
    [aiEnabled, onAnalysis, onResult, tr],
  );

  // Paste a Touch 'n Go screenshot straight from the clipboard — on a phone or
  // desktop this is how people actually have the receipt: they screenshotted it.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        void handleImage(file);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleImage]);

  const btn =
    "flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

  return (
    <div
      ref={dropRef}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void handleImage(file);
      }}
      className={`flex w-full flex-col gap-1.5 rounded-xl border-2 border-dashed p-2 transition ${
        dragging
          ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
          : "border-transparent"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={btn}>
          🖼️ {tr("cap.scan")}
        </button>

        <button type="button" onClick={() => cameraRef.current?.click()} disabled={busy} className={btn}>
          📷 {tr("cap.photo")}
        </button>

        {/* Gallery / screenshot picker */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImage(f);
            e.target.value = "";
          }}
        />
        {/* capture="environment" asks the phone for the rear camera directly,
            instead of dumping the user into a file browser. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImage(f);
            e.target.value = "";
          }}
        />

        <span className="text-[10px] text-zinc-400">{tr("cap.pasteHint")}</span>
      </div>

      {preview && (
        <div className="flex items-center gap-2">
          {/* A local object URL of the user's own screenshot — next/image would
              add nothing here and can't optimise a blob. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="h-12 w-12 rounded border border-zinc-200 object-cover dark:border-zinc-700" />
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              onAnalysis?.(null);
            }}
            className="text-[10px] text-zinc-400 underline hover:text-zinc-600"
          >
            {tr("cap.clear")}
          </button>
        </div>
      )}

      {status && (
        <p className={`text-[11px] ${busy ? "animate-pulse text-amber-600" : "text-zinc-500"}`}>{status}</p>
      )}
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

// A modern phone camera shoots 12 MP. Base64 inflates that by a third, and the
// API caps an upload at ~6 MB — so photographing a receipt with a recent phone
// could fail outright with a 413, and the ones that squeaked under the limit
// spent seconds uploading megapixels the vision model never looks at. Receipt
// text is legible well below 1600px on the long edge; anything more is upload
// time and tokens spent on nothing.
// MAX_EDGE and JPEG_QUALITY live in lib/attachments.ts, where the API's size
// limit and the PocketBase field's maxSize are defined alongside them — three
// numbers that must agree, and did not when they were spelled out separately.
const SKIP_RESIZE_BELOW = 1_500_000; // already small — don't re-encode and lose detail

async function prepareImage(file: File): Promise<{ base64: string; mimeType: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_EDGE / longest);

    if (scale === 1 && file.size <= SKIP_RESIZE_BELOW) {
      bitmap.close();
      return { base64: await toBase64(file), mimeType: file.type };
    }

    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new Error("encode failed");
    return { base64: await toBase64(blob), mimeType: "image/jpeg" };
  } catch {
    // HEIC on a browser that can't decode it, a blocked canvas, an exotic codec.
    // The original bytes are still worth a try — the server will tell us if
    // they're too big.
    return { base64: await toBase64(file), mimeType: file.type };
  }
}

function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;base64,/, ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}
