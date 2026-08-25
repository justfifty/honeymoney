"use client";

import { useEffect, useRef, useState } from "react";

// Interactive sunburst field — the HoneyMoney mark itself, dissolved into
// particles in the single brand orange. It slowly rotates and tilts toward the
// mouse cursor (3D parallax). The ray geometry mirrors Logo.tsx — keep the two
// in step.
//
// ── DESKTOP ONLY, AND BUILT IN THE BROWSER ─────────────────────────────────
//
// This is a POINTER effect: the only thing that moves it is `mousemove`, which
// a touchscreen never fires. On a phone it was therefore pure cost, and the
// cost was not small — measured on /record, 2026-08-25:
//
//   page HTML with the field   372 KB      4 208 DOM nodes
//   page HTML without it        48 KB          8 DOM nodes
//
// 87% of every page's payload was a decoration no phone user could interact
// with. Worse than the bytes: the 4 200-circle SVG carries a
// `mask-image: radial-gradient(...)` and was re-composited by a
// requestAnimationFrame loop that never stopped, so a mid-range phone spent
// every frame rasterising a masked 104vmin layer. That is what made /record —
// the default landing, and the one screen the app asks for every day — feel
// frozen: taps and scrolls were being dropped by a busy main thread.
//
// So the particles are now built in an effect rather than during render. The
// gate (`hover: hover and pointer: fine`, plus a width floor) can only be read
// in the browser, and building client-side is what lets a phone skip the work
// AND the bytes — a server-rendered field would have shipped the 324 KB
// regardless of who could see it. Nothing is server-rendered, so the seeded
// PRNG is no longer load-bearing for hydration; it is kept because a stable
// mark is the point of the mark.
//
// To put the field back on phones, drop DESKTOP_ONLY below — and re-measure.

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(h: string) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}
function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}
// one-orange tonal ramp: light heart → brand orange → deep burnt orange at tips
const STOPS = ["#FFB27A", "#FF7518", "#B54804"].map(hexToRgb);
function colorAt(t: number) {
  const c = Math.min(0.999, Math.max(0, t));
  const seg = Math.min(STOPS.length - 2, Math.floor(c * (STOPS.length - 1)));
  const local = c * (STOPS.length - 1) - seg;
  const [r1, g1, b1] = STOPS[seg];
  const [r2, g2, b2] = STOPS[seg + 1];
  return `rgb(${lerp(r1, r2, local)},${lerp(g1, g2, local)},${lerp(b1, b2, local)})`;
}

// Ray geometry, in the mark's own units (see Logo.tsx).
const N_RAYS = 20;
const R_IN = 3.94;
const R_LONG = 10.88;
const R_SHORT = 9.47;
const CORE = 4.12;
const BASE_HALF = (7.6 * Math.PI) / 180;
const TIP_HALF = (2.6 * Math.PI) / 180;

function buildSvg() {
  const rand = mulberry32(20260731);
  const W = 1000;
  const H = 1000;
  const cx = W / 2;
  const cy = H / 2;
  const Rmax = Math.min(W, H) * 0.48;
  const s = Rmax / R_LONG; // mark units → field units
  // Roughly normal, mean 0, sd ~0.5 — softens the wedge edges so the mark reads
  // as a cloud that resolves into the logo rather than a stamped-out shape.
  const gauss = () => (rand() + rand() + rand() + rand() - 2) / 2;

  const N = 2600;
  const dots: string[] = [];
  for (let i = 0; i < N; i++) {
    let x: number;
    let y: number;
    let rr: number; // 0 at the hub, 1 at the longest tip

    if (rand() < 0.17) {
      // hub
      const radius = Math.sqrt(rand()) * CORE * s * 1.12;
      const ang = rand() * Math.PI * 2;
      x = cx + Math.cos(ang) * radius;
      y = cy + Math.sin(ang) * radius;
      rr = radius / Rmax;
    } else {
      // one of the tapered rays, alternating long/short
      const k = Math.floor(rand() * N_RAYS);
      const rOut = k % 2 === 0 ? R_LONG : R_SHORT;
      const base = (2 * Math.PI * k) / N_RAYS - Math.PI / 2; // 12 o'clock
      const t = Math.pow(rand(), 0.62); // denser toward the hub
      const half = BASE_HALF + (TIP_HALF - BASE_HALF) * t;
      const ang = base + (rand() * 2 - 1) * half + gauss() * half * 0.6 * (0.35 + t);
      const radius = (R_IN + t * (rOut - R_IN)) * s * (1 + gauss() * 0.05 * (0.3 + t));
      x = cx + Math.cos(ang) * radius;
      y = cy + Math.sin(ang) * radius;
      rr = radius / Rmax;
    }

    const rad = 0.6 + rand() * 2.0;
    const op = (0.42 + rand() * 0.5) * (1 - Math.min(1, rr) * 0.14);
    dots.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(2)}" fill="${colorAt(rr * 1.05)}" opacity="${op.toFixed(2)}"/>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%">${dots.join("")}</svg>`;
}

// How far the mark drifts toward the pointer, as a share of the viewport.
const DRIFT = 0.06;

// A real pointer, and room to show a 104vmin mark next to the content. Both
// halves matter: a Surface in tablet mode reports a coarse pointer at 1280px,
// and a phone plugged into a mouse reports a fine one at 390px.
const DESKTOP_ONLY = "(hover: hover) and (pointer: fine) and (min-width: 768px)";

export default function HoneyField() {
  const inner = useRef<HTMLDivElement>(null);
  // null until the browser has been asked. Never guess "desktop" here: a first
  // paint that injects 2 600 circles and then removes them is the phone cost we
  // are removing, paid anyway.
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_ONLY);
    const apply = () => setSvg(mq.matches ? buildSvg() : null);
    apply();
    // Rotating a tablet or docking a laptop changes the answer; the field should
    // appear and disappear with it rather than being decided once at load.
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const el = inner.current;
    if (!el || !svg) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    // targets (t*) chase the pointer; current (c*) eases toward them each frame
    let tRotX = 0;
    let tRotY = 0;
    let tPanX = 0;
    let tPanY = 0;
    let cRotX = 0;
    let cRotY = 0;
    let cPanX = 0;
    let cPanY = 0;
    let spin = 0;
    let last = performance.now();

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX / window.innerWidth - 0.5;
      const dy = e.clientY / window.innerHeight - 0.5;
      tRotY = dx * 30;
      tRotX = -dy * 22;
      // the mark drifts toward the cursor, so it feels drawn to it
      tPanX = dx * window.innerWidth * DRIFT;
      tPanY = dy * window.innerHeight * DRIFT;
    };
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      cRotX += (tRotX - cRotX) * 0.05;
      cRotY += (tRotY - cRotY) * 0.05;
      cPanX += (tPanX - cPanX) * 0.04;
      cPanY += (tPanY - cPanY) * 0.04;
      spin += dt * 2; // ~2°/s idle rotation
      el.style.transform =
        `perspective(1200px) translate3d(${cPanX.toFixed(1)}px,${cPanY.toFixed(1)}px,0)` +
        ` rotateX(${cRotX.toFixed(2)}deg) rotateY(${cRotY.toFixed(2)}deg) rotateZ(${spin.toFixed(2)}deg)`;
      raf = requestAnimationFrame(loop);
    };
    // Compositing a masked 104vmin layer 60 times a second is not free even on a
    // desktop, and a background tab gets nothing for it. rAF already throttles
    // when hidden in most browsers; stopping outright also drops the layer.
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    window.addEventListener("mousemove", onMove);
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(raf);
    };
  }, [svg]);

  // Not merely hidden — not in the document at all. `display:none` would still
  // have cost the parse, the nodes and the bytes, which is the whole problem.
  if (!svg) return null;

  // Fixed to the viewport and behind every page's content, so the same mark
  // follows the cursor across the whole site rather than living in the hero.
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center overflow-hidden"
    >
      <div
        ref={inner}
        className="aspect-square h-[104vmin] max-h-none opacity-45 [mask-image:radial-gradient(circle_at_center,#000_42%,transparent_68%)] [transform-origin:center]"
        style={{ willChange: "transform" }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
