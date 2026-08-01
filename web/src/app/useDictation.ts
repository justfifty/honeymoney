"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { scoreAlternative } from "@/lib/voiceParse";
import type { Locale } from "@/lib/i18n";

// The browser speech path, extracted so every capture surface shares ONE
// recogniser. It was previously inlined in SpendCapture, which meant the landing
// page could only get a mic by copy-pasting it — and the two hard-won details
// below are exactly the kind that rot in a copy:
//
//   • the locale map (zh-Hant was once missing, silently routing Traditional-
//     Chinese speakers into an English recogniser), and
//   • the alternative-picking heuristic, which must score for the best *spend*,
//     not merely the reading that happens to contain a digit.

// App locale → BCP-47 speech locale.
export const SPEECH_LANG: Record<string, string> = {
  en: "en-MY",
  ms: "ms-MY",
  zh: "zh-CN",
  "zh-Hant": "zh-TW",
  ta: "ta-IN",
  hi: "hi-IN",
};

export const VOICE_ERRORS: Record<string, string> = {
  "no-speech": "I didn't hear anything — try again, a little closer to the mic.",
  "audio-capture": "No microphone found. Check your device's microphone.",
  "not-allowed": "Microphone access was blocked. Allow it in your browser settings.",
  network: "Speech recognition needs a network connection.",
  aborted: "Listening stopped.",
};

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

// Whether this browser has SpeechRecognition at all. Read through
// useSyncExternalStore rather than an effect, so the server render (assume yes)
// and the client render (the truth) reconcile without a hydration mismatch and
// without a cascading setState. Support never changes mid-session, hence the
// no-op subscribe.
const neverChanges = () => () => {};
const hasSpeech = () => {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
};
const assumeSupported = () => true;

export interface Dictation {
  /** True while the mic is open. */
  listening: boolean;
  /** Words as they land, including interim ones — a mic that shows nothing feels broken. */
  heard: string;
  /** False when the browser has no SpeechRecognition at all (Firefox, some in-app webviews). */
  supported: boolean;
  /** Start listening, or stop if already listening. */
  toggle: () => void;
}

export function useDictation({
  lang = "en",
  knownVendors = [],
  onFinal,
  onError,
  onStart,
}: {
  lang?: Locale;
  knownVendors?: string[];
  /** Fires once, when the user stops speaking, with the best-scoring transcript. */
  onFinal: (transcript: string) => void;
  onError?: (message: string, code: string) => void;
  onStart?: () => void;
}): Dictation {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const supported = useSyncExternalStore(neverChanges, hasSpeech, assumeSupported);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  // Callbacks live in a ref so `toggle` stays referentially stable — otherwise
  // every parent re-render would hand back a new toggle and thrash the button.
  const cb = useRef({ onFinal, onError, onStart, knownVendors });
  useEffect(() => {
    cb.current = { onFinal, onError, onStart, knownVendors };
  });

  // An open microphone must not outlive the component.
  useEffect(() => () => recRef.current?.abort(), []);

  const toggle = useCallback(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (recRef.current && listening) {
      recRef.current.stop();
      return;
    }

    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = SPEECH_LANG[lang] ?? "en-MY";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 5;

    let finalTranscript = "";

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const alts = Array.from(result as ArrayLike<{ transcript: string; confidence: number }>);

        if (result.isFinal) {
          // Pick the alternative that yields the best *spend*, not merely the one
          // containing a digit — the older heuristic preferred any reading with a
          // number in it, which selected for exactly the number-only transcripts
          // this whole path exists to avoid.
          const best = alts
            .map((a) => ({
              transcript: a.transcript,
              score: scoreAlternative(a.transcript, cb.current.knownVendors) + (a.confidence ?? 0),
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
      const code = e.error ?? "unknown";
      setListening(false);
      cb.current.onError?.(VOICE_ERRORS[code] ?? `Voice input failed (${code}).`, code);
    };

    rec.onend = () => {
      setListening(false);
      const text = finalTranscript.trim();
      if (text) cb.current.onFinal(text);
    };

    setHeard("");
    setListening(true);
    cb.current.onStart?.();
    rec.start();
  }, [lang, listening]);

  return { listening, heard, supported, toggle };
}
