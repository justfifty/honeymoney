"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { t as translate, type Locale } from "@/lib/i18n";
import { parseReceiptText } from "@/lib/voiceParse";
import { safeName, type IncomingAttachment } from "@/lib/attachments";
import { prepareAll } from "@/lib/imagePrep";

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

/** One row off the receipt. Structurally the ReceiptLineItem of lib/receipt.ts. */
export interface ReceiptLine {
  label: string;
  amount: number;
  qty?: number;
  unitPrice?: number;
  discount?: boolean;
}

/** Which figure the receipt's own arithmetic says is wrong. */
export type SuspectField = "total" | "subtotal" | "items" | "tax" | "serviceCharge";

/**
 * What the receipt's own arithmetic said about this reading.
 *
 * Produced identically by both readers — see lib/receiptMath.ts — so the user is
 * told the same thing about their receipt whether or not an API key happens to
 * be configured.
 */
export interface ReceiptChecks {
  confirmed: string[];
  conflicts: { relation: string; expected: number; found: number; suspect: SuspectField }[];
  suspect: SuspectField | null;
}

/** The figures a receipt prints between its items and its total. */
export interface ReceiptBreakdown {
  subtotal: number;
  serviceCharge: number;
  tax: number;
  rounding: number;
  total: number;
}

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
   *
   * ⚠️ AND THE AI PATH THEN FORGOT TO SEND THEM. `onResult` below listed its
   * fields one by one and `lineItems` was not among them, while the on-device
   * branch spreads `...parsed` and carried them by accident. So the BETTER
   * reader -- the one that costs a token, reads quantities, and is the only one
   * that can itemise a photographed till roll properly -- was the one that
   * arrived with no items at all, and the feature looked broken exactly when it
   * was working. Anything added to this interface has to be added to BOTH
   * branches; there is no shared assembly point.
   */
  lineItems?: ReceiptLine[];
  /**
   * What the receipt printed BETWEEN the items and the total.
   *
   * Carried rather than merely announced in a status line, because it is what
   * makes the itemised list add up: items summing to 48.00 under a total of
   * 54.50 is alarming until you can see the 10% service charge and the 6% tax
   * that account for the gap. Without these the reconciliation can only say
   * "these disagree", which trains people to ignore it.
   */
  breakdown?: ReceiptBreakdown;
  /** True when the receipt had more rows than the reader kept. See ReceiptExtraction. */
  itemsTruncated?: boolean;
  /**
   * Corroboration, or contradiction, from the receipt's own arithmetic.
   *
   * The reason to carry this rather than fold it entirely into `confidence`: a
   * number can only say "be careful", while this says WHICH FIELD to be careful
   * about. "Check the amount and shop before saving" is advice nobody can act
   * on; "the items add up to 148.20 but the total reads 14.82" points at one
   * input and is settled in two seconds by the person holding the paper.
   */
  checks?: ReceiptChecks;
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

  async function scanOnDevice(file: File, attachment?: IncomingAttachment, prepped?: Blob | null) {
    setStatus(tr("g.cap.scanning", { pct: 0 }));
    try {
      const { createWorker, PSM } = await import("tesseract.js");
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

      // The GRAYSCALE, CONTRAST-STRETCHED, correctly-sized copy — not the raw
      // File, which is what this used to hand over. See lib/imagePrep.ts for
      // what each of those does and why a phone photo of thermal paper needs all
      // three. Null when the browser could not decode the image, and then the
      // original is still worth a try.
      const source: File | Blob = prepped ?? file;

      // ── WHY createWorker RATHER THAN recognize() ────────────────────────
      //
      // The one-shot `recognize` helper gives no way to set engine parameters,
      // so this ran on Tesseract's defaults, and two of those are actively wrong
      // for a receipt:
      //
      //   PSM 3 (the default) hunts for a multi-column page layout. A till roll
      //   is one narrow column, and on a 3:1 receipt the layout analyser
      //   regularly decides the item names and the prices are SEPARATE COLUMNS
      //   and emits them as separate blocks — so the text arrives with every
      //   label on one run of lines and every amount on another. The line-item
      //   regex needs "label ... amount" on ONE line and matched nothing at all,
      //   which is a large part of why on-device itemisation was thin.
      //   SINGLE_BLOCK treats the receipt as the single column it is.
      //
      //   preserve_interword_spaces keeps the whitespace column between the
      //   label and the price. Tesseract collapses runs of spaces by default,
      //   and that column is the only thing separating "Nasi lemak" from "7.00".
      const RECEIPT_PARAMS = {
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
      };

      async function readWith(language: string, workerOpts: Record<string, unknown>) {
        const worker = await createWorker(language, undefined, workerOpts);
        try {
          await worker.setParameters(RECEIPT_PARAMS);
          return await worker.recognize(source);
        } finally {
          // Terminated in a finally: a worker left running holds its WASM heap
          // for the life of the tab, and a user scanning five receipts in a row
          // would be carrying five of them.
          await worker.terminate().catch(() => undefined);
        }
      }

      let data;
      try {
        ({ data } = await readWith(ocrLang, opts));
      } catch {
        // No model for that language, or no network to fetch one. English is
        // staged locally, so this fallback works offline — which is the whole
        // point of it. The four non-staged locales are still ATTEMPTED first, so
        // a Chinese or Tamil receipt is read in its own script whenever there is
        // a network to fetch the model with.
        ({ data } = await readWith("eng", { ...OCR_PATHS, logger }));
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

      // ── ONE DECODE, THREE RENDITIONS ────────────────────────────────────
      //
      // This used to prepare ONE image and use it for both jobs, on the
      // reasoning that "preparing twice would re-encode the image for no gain".
      // The gain turned out to be large, and the sharing was the whole cost: the
      // storage rendition is 1600px at q0.85 because a ledger should not fill up
      // with 4MB photographs, and by sharing it the STORAGE limit silently
      // became the READING limit. A 4000px photo of a receipt was being read at
      // a 2.5x downscale, and the first thing to go at that size is exactly the
      // small print the line items are made of.
      //
      // lib/imagePrep.ts decodes once and draws three copies from that single
      // bitmap — so the expensive step still happens once, while each consumer
      // gets the picture it can actually use.
      let attachment: IncomingAttachment | undefined;
      let reading: { base64: string; mimeType: string } | undefined;
      let ocrSource: Blob | null = null;
      try {
        const { store, read, ocr } = await prepareAll(file);
        attachment = {
          name: safeName(file.name, store.mimeType),
          type: store.mimeType,
          dataBase64: store.base64,
        };
        reading = { base64: read.base64, mimeType: read.mimeType };
        ocrSource = ocr;
      } catch {
        // An image we cannot re-encode is one we should not store either; the
        // parse below still runs on the original file.
      }

      // Try the AI reader first — it's the only path that gets currency, date
      // and a confidence score, and it can reason about the household.
      if (aiEnabled && reading) {
        setStatus(tr("cap.reading"));
        try {
          // The READING copy, not the stored one. This is the line the whole of
          // imagePrep.ts exists for.
          const { base64, mimeType } = reading;
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
              // See the note on Captured.lineItems: this line is the whole bug.
              lineItems: Array.isArray(e.lineItems) && e.lineItems.length ? e.lineItems : undefined,
              itemsTruncated: e.itemsTruncated === true,
              checks: e.checks ?? undefined,
              // Only when the receipt actually printed a breakdown. An object of
              // zeroes would draw a "Subtotal 0.00" row for a wallet screenshot
              // that never had one, which is the reader claiming to have read
              // something it did not.
              breakdown:
                e.subtotal || e.serviceCharge || e.tax || e.rounding
                  ? {
                      subtotal: Number(e.subtotal) || 0,
                      serviceCharge: Number(e.serviceCharge) || 0,
                      tax: Number(e.tax) || 0,
                      rounding: Number(e.rounding) || 0,
                      total: Number(e.total) || Number(e.amount) || 0,
                    }
                  : undefined,
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

      await scanOnDevice(file, attachment, ocrSource);
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

// The image work that used to live here — the downscaler, the base64 reader and
// the note about a 12 MP phone camera against a ~6 MB upload cap — moved to
// lib/imagePrep.ts, which prepares a rendition per consumer instead of one for
// everybody. The cap argument still holds; it is simply an argument about what
// is UPLOADED rather than about what is READ, and conflating the two was
// costing the reader most of the receipt's small print.

