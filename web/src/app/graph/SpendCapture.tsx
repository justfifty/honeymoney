"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { t as translate, type Locale } from "@/lib/i18n";
import { parseReceiptText, parseVoiceLocal, scoreAlternative } from "@/lib/voiceParse";

// Capture a spend by SPEAKING, SCANNING, PHOTOGRAPHING or PASTING.
//
// Two tiers, and the app is fully usable on either:
//   • On-device (default, zero tokens, zero cost): browser Speech Recognition +
//     tesseract.js OCR, parsed by lib/voiceParse.ts. Works offline, nothing
//     leaves the machine — the PDPA / data-residency story.
//   • AI-assisted (when a provider is configured): the transcript or image goes
//     to /api/voice or /api/receipt, which grounds it in the household's real
//     graph and can also suggest a bucket, flag a duplicate and spot an anomaly.
//
// The AI tier is strictly an enhancement. Every AI failure degrades to the
// on-device result rather than to an error.

// App locale → BCP-47 speech locale. zh-Hant was missing here, which silently
// routed Traditional-Chinese speakers into an ENGLISH recogniser — their
// transcripts came back as garbage and only the digits survived.
const SPEECH_LANG: Record<string, string> = {
  en: "en-MY",
  ms: "ms-MY",
  zh: "zh-CN",
  "zh-Hant": "zh-TW",
  ta: "ta-IN",
  hi: "hi-IN",
};

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

export interface Captured {
  vendor?: string;
  amount?: number;
  currency?: string;
  occurredAt?: string;
  bucketNodeId?: string;
  note?: string;
  confidence?: number;
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

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: (e: SpeechResultEvent) => void;
  onerror: (e: { error?: string }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }>;
}

const VOICE_ERRORS: Record<string, string> = {
  "no-speech": "I didn't hear anything — try again, a little closer to the mic.",
  "audio-capture": "No microphone found. Check your device's microphone.",
  "not-allowed": "Microphone access was blocked. Allow it in your browser settings.",
  network: "Speech recognition needs a network connection.",
  aborted: "Listening stopped.",
};

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
  const speechLang = SPEECH_LANG[lang] ?? "en-MY";

  const [status, setStatus] = useState<string | null>(null);
  const [heard, setHeard] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [supportsVoice, setSupportsVoice] = useState(true);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSupportsVoice(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    return () => recRef.current?.abort();
  }, []);

  // ── Voice ────────────────────────────────────────────────────────────────

  const finishVoice = useCallback(
    async (transcript: string) => {
      if (!transcript.trim()) return;
      const local = parseVoiceLocal(transcript, knownVendors);

      // Show the on-device result immediately — the user shouldn't wait on a
      // network round-trip to see their words become a spend.
      onResult(local);

      if (!aiEnabled) {
        setStatus(describe(local, transcript));
        return;
      }

      setBusy(true);
      setStatus(tr("cap.thinking"));
      try {
        const res = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, lang }),
        });
        const data = await res.json();
        if (res.ok && data.parsed) {
          onResult(data.parsed);
          setStatus(describe(data.parsed, transcript));
        } else {
          setStatus(describe(local, transcript));
        }
      } catch {
        setStatus(describe(local, transcript));
      } finally {
        setBusy(false);
      }
    },
    [aiEnabled, knownVendors, lang, onResult, tr],
  );

  function describe(p: Captured, transcript: string): string {
    const bits: string[] = [];
    if (p.vendor) bits.push(`“${p.vendor}”`);
    if (p.amount) bits.push(`${p.currency ?? "MYR"} ${p.amount}`);
    if (!bits.length) return tr("cap.heardNothing", { text: transcript });
    const low = (p.confidence ?? 1) < 0.6 ? ` · ${tr("cap.checkThis")}` : "";
    return `${tr("cap.heard", { text: transcript })} → ${bits.join(" · ")}${low}`;
  }

  function speak() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setStatus(tr("g.cap.noVoice"));
      return;
    }
    if (listening) {
      recRef.current?.stop();
      return;
    }

    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = speechLang;
    rec.interimResults = true; // show words as they land — a live mic that shows
    rec.continuous = false; //    nothing feels broken and people give up on it
    rec.maxAlternatives = 5;

    let finalTranscript = "";

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const alts = Array.from(result as ArrayLike<{ transcript: string; confidence: number }>);

        if (result.isFinal) {
          // Pick the alternative that yields the best *spend*, not merely the
          // one containing a digit. The old heuristic explicitly preferred any
          // alternative with a number in it, which selected for exactly the
          // number-only readings this component was criticised for.
          const best = alts
            .map((a) => ({
              transcript: a.transcript,
              score: scoreAlternative(a.transcript, knownVendors) + (a.confidence ?? 0),
            }))
            .sort((x, y) => y.score - x.score)[0];
          finalTranscript += ` ${best?.transcript ?? alts[0]?.transcript ?? ""}`;
        } else {
          interim += alts[0]?.transcript ?? "";
        }
      }
      setHeard((finalTranscript + interim).trim());
    };

    rec.onerror = (e) => {
      const key = e.error ?? "unknown";
      setStatus(VOICE_ERRORS[key] ?? tr("g.cap.voiceError", { error: key }));
      setListening(false);
    };

    rec.onend = () => {
      setListening(false);
      void finishVoice(finalTranscript.trim());
    };

    setHeard("");
    setStatus(tr("g.cap.listening"));
    setListening(true);
    rec.start();
  }

  // ── Images: file, camera, drag-drop, paste ───────────────────────────────

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

      // Try the AI reader first — it's the only path that gets currency, date
      // and a confidence score, and it can reason about the household.
      if (aiEnabled) {
        setStatus(tr("cap.reading"));
        try {
          const { base64, mimeType } = await prepareImage(file);
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
            });
            onAnalysis?.(data.analysis ?? null);
            // When the receipt printed a breakdown, show it so the user can see
            // the subtotal/service/tax behind the total, not just the total.
            const cur = e.currency ?? "MYR";
            const parts: string[] = [];
            if (e.subtotal) parts.push(`${tr("cap.subtotal")} ${cur} ${e.subtotal}`);
            if (e.serviceCharge) parts.push(`${tr("cap.service")} ${cur} ${e.serviceCharge}`);
            if (e.tax) parts.push(`${tr("cap.tax")} ${cur} ${e.tax}`);
            const breakdown = parts.length ? `  ·  ${parts.join(" · ")}` : "";
            setStatus(
              (e.amount || e.vendor
                ? tr("g.cap.readResult", {
                    vendor: e.vendor ? ` “${e.vendor}”` : "",
                    amount: e.amount ? ` · ${cur} ${e.amount}` : "",
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

      await scanOnDevice(file);
      setBusy(false);
    },
    [aiEnabled, onAnalysis, onResult, tr],
  );

  async function scanOnDevice(file: File) {
    setStatus(tr("g.cap.scanning", { pct: 0 }));
    try {
      const { recognize } = await import("tesseract.js");
      const ocrLang = OCR_LANG[lang] ?? "eng";
      let data;
      try {
        ({ data } = await recognize(file, ocrLang, {
          logger: (m: { status: string; progress: number }) => {
            if (m.status === "recognizing text") {
              setStatus(tr("g.cap.scanning", { pct: Math.round(m.progress * 100) }));
            }
          },
        }));
      } catch {
        // The language pack may not be downloadable (offline, or no such pack).
        // English still reads the digits, which is the half that matters most.
        ({ data } = await recognize(file, "eng"));
      }

      const parsed = parseReceiptText(data.text || "", knownVendors);
      onResult(parsed);
      setStatus(
        parsed.amount || parsed.vendor
          ? tr("g.cap.readResult", {
              vendor: parsed.vendor ? ` “${parsed.vendor}”` : "",
              amount: parsed.amount ? ` · ${parsed.currency ?? "MYR"} ${parsed.amount}` : "",
            })
          : tr("g.cap.readFail"),
      );
    } catch {
      setStatus(tr("g.cap.scanFail"));
    }
  }

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
        <button
          type="button"
          onClick={speak}
          disabled={busy || !supportsVoice}
          title={supportsVoice ? undefined : tr("g.cap.noVoice")}
          className={
            listening
              ? "flex items-center gap-1 rounded-lg border border-rose-400 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 dark:bg-rose-950/40"
              : btn
          }
        >
          <span className={listening ? "animate-pulse" : ""}>{listening ? "⏹" : "🎤"}</span>{" "}
          {listening ? tr("cap.stop") : tr("cap.speak")}
        </button>

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

      {listening && heard && (
        <p className="rounded-lg bg-zinc-100 px-2 py-1 text-[11px] italic text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {heard}…
        </p>
      )}

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
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;
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
