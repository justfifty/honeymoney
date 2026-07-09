"use client";

import { useRef, useState } from "react";
import { t as translate, type Locale } from "@/lib/i18n";

// map an app locale to a BCP-47 speech-recognition locale
const SPEECH_LANG: Record<string, string> = {
  en: "en-MY", ms: "ms-MY", zh: "zh-CN", ta: "ta-IN", hi: "hi-IN",
};

// No-token capture: fill a spend by SPEAKING or SCANNING a receipt — zero AI
// tokens, zero cost. Voice uses the browser's built-in Speech Recognition
// engine (on-device, multilingual: en/ms/zh/ta/hi). Receipts use tesseract.js
// (the WASM build of Tesseract OCR — the same engine as Python's pytesseract,
// but no server sidecar). Both just parse {vendor, amount} to prefill the form;
// the paid Gemini path stays optional/premium.

export interface Captured {
  vendor?: string;
  amount?: number;
}

// pull the most likely spend amount out of free text (voice or OCR)
function extractAmount(text: string): number | undefined {
  const t = text.toLowerCase();
  const matches = [...t.matchAll(/(?:rm|myr|ringgit)?\s*([0-9]+(?:[.,][0-9]{1,2})?)/gi)]
    .map((m) => parseFloat(m[1].replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (matches.length === 0) return undefined;
  // prefer a value that appears near a "total"/"jumlah"/"amount" keyword
  const near = t.match(/(?:total|jumlah|amount|bayar)\D{0,12}([0-9]+(?:[.,][0-9]{1,2})?)/i);
  if (near) return parseFloat(near[1].replace(",", "."));
  return Math.max(...matches);
}

function parseVoice(transcript: string): Captured {
  const amount = extractAmount(transcript);
  // vendor = text after "at" / "kat" / "di" / "from"
  const m = transcript.match(/\b(?:at|kat|di|from|ke)\s+([a-z0-9'&\- ]{2,40})/i);
  const vendor = m ? m[1].trim().replace(/\s+/g, " ") : undefined;
  return { vendor, amount };
}

function parseReceipt(text: string): Captured {
  const amount = extractAmount(text);
  // vendor = first line that is mostly letters (store name usually at the top)
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length >= 3 && /[a-z]/i.test(l) && (l.match(/[a-z]/gi)?.length ?? 0) >= l.length * 0.5);
  return { vendor: line ? line.slice(0, 40) : undefined, amount };
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onerror: (e: { error?: string }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}

export default function SpendCapture({
  onResult,
  lang = "en",
}: {
  onResult: (c: Captured) => void;
  lang?: Locale;
}) {
  const tr = (k: string) => translate(lang, k);
  const speechLang = SPEECH_LANG[lang] ?? "en-MY";
  const [status, setStatus] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function speak() {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setStatus("Voice not supported in this browser — try Chrome/Edge.");
      return;
    }
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = speechLang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      const parsed = parseVoice(transcript);
      onResult(parsed);
      setStatus(`Heard: “${transcript}”`);
    };
    rec.onerror = (e) => setStatus(`Voice error: ${e.error ?? "unknown"}`);
    rec.onend = () => setListening(false);
    setStatus("Listening… say e.g. “25 ringgit at Speedmart”");
    setListening(true);
    rec.start();
  }

  async function scan(file: File) {
    setStatus("Scanning receipt… 0%");
    try {
      const { recognize } = await import("tesseract.js");
      const { data } = await recognize(file, "eng", {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") setStatus(`Scanning receipt… ${Math.round(m.progress * 100)}%`);
        },
      });
      const parsed = parseReceipt(data.text || "");
      onResult(parsed);
      setStatus(
        parsed.amount || parsed.vendor
          ? `Read${parsed.vendor ? ` “${parsed.vendor}”` : ""}${parsed.amount ? ` · RM ${parsed.amount}` : ""} — check & adjust`
          : "Couldn't read it — type it in instead",
      );
    } catch {
      setStatus("Scan failed — type it in instead");
    }
  }

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={speak}
          className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${listening ? "border-rose-400 bg-rose-50 text-rose-600 dark:bg-rose-950/40" : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"}`}
        >
          {listening ? "⏹" : "🎤"} {tr("cap.speak")}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          📷 {tr("cap.scan")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) scan(f);
            e.target.value = "";
          }}
        />
        <span className="text-[10px] text-zinc-400">{tr("cap.noTokens")}</span>
      </div>
      {status && <p className="text-[11px] text-zinc-500">{status}</p>}
    </div>
  );
}
