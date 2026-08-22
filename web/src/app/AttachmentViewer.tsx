"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { attachmentUrl } from "@/lib/attachments";
import { t as translate, type Locale } from "@/lib/i18n";

// Full-screen receipt viewer.
//
// The job is narrow and unglamorous: let someone READ a receipt they
// photographed. Everything here follows from that.
//
//   • Zoom is non-negotiable, not a nicety. A receipt fitted to a phone screen
//     is unreadable — the line items are the whole reason to open it. Pinch,
//     double-tap and wheel all reach the same zoom state.
//   • Rotate, because people photograph receipts sideways constantly.
//   • The full-resolution original loads only when the viewer opens. The 400x0
//     thumb is shown first so there is never a blank frame, and it is the SAME
//     image, so the swap is invisible apart from getting sharper.
//   • A failure gets a message and a retry, not an empty box. A receipt is the
//     user's own record of their own money; "nothing happened" is the one
//     response that gives them no way forward.
//
// Gestures are handled with raw pointer events rather than a library: the whole
// interaction is two fingers and a drag, and no dependency is worth carrying
// into a PWA for that.
//
// TASK 2 SEAM — `aside` below is where extracted line items will render, beside
// the image on a wide viewport and stacked under it on a narrow one. Verifying
// an extraction is a glance between the picture and the numbers, not a memory
// test, so they have to be on screen together. The panel is deliberately empty
// and unrendered until then; the layout it needs already works.

export interface ViewerAttachment {
  txId: string;
  filename: string;
  /** Shown in the header — the vendor and amount this receipt belongs to. */
  caption?: string;
}

const MAX_SCALE = 6;
const MIN_SCALE = 1;
const DOUBLE_TAP_SCALE = 2.5;

export default function AttachmentViewer({
  items,
  startIndex = 0,
  onClose,
  lang = "en",
}: {
  items: ViewerAttachment[];
  startIndex?: number;
  onClose: () => void;
  lang?: Locale;
}) {
  const tr = (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars);

  const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), Math.max(0, items.length - 1)));
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // Whether a finger is currently down. State rather than a ref, because it is
  // READ DURING RENDER to drop the CSS transition mid-gesture — a ref would not
  // re-render, so the transition would keep whatever value it had at mount and
  // the drag would lag behind the finger by a frame.
  const [interacting, setInteracting] = useState(false);
  // Bumped to force a fresh <img> load on retry — without it the browser serves
  // the failed response from cache and "Try again" appears to do nothing.
  const [attempt, setAttempt] = useState(0);

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // Live pointer state. In a ref, not state: these update on every pointermove
  // and re-rendering the image on each one makes the drag stutter.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startDist: number; startScale: number; startOffset: { x: number; y: number }; last: { x: number; y: number } } | null>(null);
  const lastTap = useRef(0);

  const current = items[index];
  const many = items.length > 1;

  const reset = useCallback(() => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    setStatus("loading");
  }, []);

  const go = useCallback(
    (delta: number) => {
      if (!many) return;
      setIndex((i) => (i + delta + items.length) % items.length);
      reset();
    },
    [items.length, many, reset],
  );

  // Focus moves into the dialog on open so a keyboard user is not left behind on
  // the page underneath, and Escape has something to fire from.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // The page behind must not scroll while a full-screen layer is open — on iOS
  // that shows as the receipt drifting under your finger as you try to pan it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        go(1);
      } else if (e.key === "ArrowLeft") {
        go(-1);
      } else if (e.key === "+" || e.key === "=") {
        setScale((s) => Math.min(MAX_SCALE, s * 1.25));
      } else if (e.key === "-") {
        setScale((s) => Math.max(MIN_SCALE, s / 1.25));
      } else if (e.key === "r" || e.key === "R") {
        setRotation((r) => (r + 90) % 360);
      } else if (e.key === "0") {
        setScale(1);
        setOffset({ x: 0, y: 0 });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  // ── gestures ──────────────────────────────────────────────────────────────

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];

    if (pts.length === 2) {
      gesture.current = {
        startDist: dist(pts[0], pts[1]),
        startScale: scale,
        startOffset: offset,
        last: { x: e.clientX, y: e.clientY },
      };
      return;
    }

    // Double-tap to zoom. 300ms is the usual threshold; below it a slow
    // two-finger placement registers as a tap and fights the pinch.
    const now = e.timeStamp;
    if (now - lastTap.current < 300) {
      setScale((s) => (s > 1.05 ? 1 : DOUBLE_TAP_SCALE));
      setOffset({ x: 0, y: 0 });
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
    gesture.current = {
      startDist: 0,
      startScale: scale,
      startOffset: offset,
      last: { x: e.clientX, y: e.clientY },
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    if (!g) return;

    if (pts.length === 2 && g.startDist > 0) {
      const next = (dist(pts[0], pts[1]) / g.startDist) * g.startScale;
      setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, next)));
      return;
    }

    if (pts.length === 1) {
      const dx = e.clientX - g.last.x;
      const dy = e.clientY - g.last.y;
      g.last = { x: e.clientX, y: e.clientY };
      // Panning only means something zoomed in. At 1x a horizontal drag is a
      // swipe between attachments instead, which is handled on pointer-up.
      if (scale > 1.05) setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
  }

  // Swipe is measured from where the finger went DOWN to where it came up. That
  // is deliberately tracked on its own rather than inferred from the pan
  // bookkeeping above, which only ever holds the LAST move — reconstructing a
  // total from deltas is how a swipe ends up firing on a slow drag.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  function onSurfaceDown(e: React.PointerEvent) {
    swipeStart.current = { x: e.clientX, y: e.clientY };
    setInteracting(true);
    onPointerDown(e);
  }
  function onSurfaceUp(e: React.PointerEvent) {
    const s = swipeStart.current;
    swipeStart.current = null;
    onPointerUp(e);
    if (pointers.current.size === 0) setInteracting(false);
    // Only at 1x: once zoomed in, a horizontal drag is panning the receipt, and
    // stealing that to change image is maddening when you are mid-read.
    if (!s || !many || scale > 1.05) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    // The 1.5x vertical guard stops a slightly-diagonal scroll changing image.
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  }

  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return;
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * (e.deltaY > 0 ? 0.9 : 1.1))));
  }

  if (!current) return null;

  const full = `${attachmentUrl(current.txId, current.filename)}${attempt ? `&_r=${attempt}` : ""}`.replace(
    /\?&/,
    "?",
  );
  const preview = attachmentUrl(current.txId, current.filename, "400x0");

  const btn =
    "flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-lg text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tr("att.viewerLabel")}
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm"
    >
      {/* Header: close is the leftmost control and 44px, because on a phone the
          first thing a user wants from a full-screen image is out of it. */}
      <header className="flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button ref={closeRef} type="button" onClick={onClose} className={btn} aria-label={tr("att.close")}>
          ✕
        </button>
        <div className="min-w-0 flex-1">
          {current.caption && (
            <p className="truncate text-sm font-medium text-white/90">{current.caption}</p>
          )}
          {many && (
            <p className="text-[11px] text-white/50">
              {tr("att.counter", { n: index + 1, total: items.length })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setRotation((r) => (r + 90) % 360)}
          className={btn}
          aria-label={tr("att.rotate")}
        >
          ↻
        </button>
        <button
          type="button"
          onClick={() => {
            setScale((s) => (s > 1.05 ? 1 : DOUBLE_TAP_SCALE));
            setOffset({ x: 0, y: 0 });
          }}
          className={btn}
          aria-label={scale > 1.05 ? tr("att.zoomOut") : tr("att.zoomIn")}
        >
          {scale > 1.05 ? "－" : "＋"}
        </button>
      </header>

      {/* The seam. `lg:flex-row` is the whole Task 2 preparation: when the line
          items panel exists it becomes the second child and needs no rewrite. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          ref={surfaceRef}
          onPointerDown={onSurfaceDown}
          onPointerMove={onPointerMove}
          onPointerUp={onSurfaceUp}
          onPointerCancel={onSurfaceUp}
          onWheel={onWheel}
          className="relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden"
        >
          {status === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
              {/* The thumb stands in while the original arrives, so the frame is
                  never empty — same picture, just softer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="" aria-hidden className="max-h-[70vh] max-w-[90vw] opacity-40 blur-sm" />
              <p className="absolute bottom-10 animate-pulse text-xs">{tr("att.loading")}</p>
            </div>
          )}

          {status === "error" ? (
            <div className="flex flex-col items-center gap-4 px-8 text-center">
              <p className="text-4xl" aria-hidden>
                🧾
              </p>
              <p className="max-w-xs text-sm text-white/80">{tr("att.failed")}</p>
              <button
                type="button"
                onClick={() => {
                  setStatus("loading");
                  setAttempt((a) => a + 1);
                }}
                className="min-h-11 rounded-full bg-amber-500 px-6 text-sm font-semibold text-white transition hover:bg-amber-600"
              >
                {tr("att.retry")}
              </button>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={`${current.txId}/${current.filename}/${attempt}`}
              src={full}
              alt={current.caption ? tr("att.altOf", { what: current.caption }) : tr("att.alt")}
              onLoad={() => setStatus("ready")}
              onError={() => setStatus("error")}
              draggable={false}
              className="max-h-full max-w-full object-contain"
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)`,
                transition: interacting ? "none" : "transform 140ms ease-out",
                visibility: status === "ready" ? "visible" : "hidden",
                cursor: scale > 1.05 ? "grab" : "default",
              }}
            />
          )}

          {many && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label={tr("att.prev")}
                className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-xl text-white transition hover:bg-black/60"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label={tr("att.next")}
                className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-xl text-white transition hover:bg-black/60"
              >
                ›
              </button>
            </>
          )}
        </div>

        {/* TASK 2: the line-items panel mounts here. Left unrendered rather than
            rendered empty — an empty panel is a promise the product cannot yet
            keep, and it would eat half the screen on a laptop today. */}
      </div>

      <p className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 text-center text-[11px] text-white/40">
        {tr("att.hint")}
      </p>
    </div>
  );
}
