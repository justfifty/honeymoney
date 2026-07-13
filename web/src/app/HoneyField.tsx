"use client";

import { useEffect, useRef } from "react";

// Interactive "Bunga Raya" (hibiscus) field — Malaysia's national flower formed
// from particles in the single brand orange. It slowly rotates and tilts toward
// the mouse cursor (3D parallax), like the benchmark's red-dot cloud. Particles
// are generated deterministically (seeded PRNG) so SSR and client markup match;
// the motion is applied post-mount and disabled under prefers-reduced-motion.

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

function buildSvg() {
  const rand = mulberry32(20260731);
  const W = 1000;
  const H = 1000;
  const cx = W / 2;
  const cy = H / 2;
  const Rmax = Math.min(W, H) * 0.48;
  const N = 4200;
  const dots: string[] = [];
  for (let i = 0; i < N; i++) {
    const ang = rand() * Math.PI * 2;
    const petal = Math.pow(Math.abs(Math.cos(2.5 * ang)), 0.5);
    const env = 0.22 + 0.78 * petal;
    const rr = Math.pow(rand(), 0.5);
    const radius = rr * env * Rmax;
    const x = cx + Math.cos(ang) * radius;
    const y = cy + Math.sin(ang) * radius;
    const rad = 0.6 + rand() * 2.0;
    const op = (0.42 + rand() * 0.5) * (1 - rr * 0.12);
    dots.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(2)}" fill="${colorAt(rr * 1.05)}" opacity="${op.toFixed(2)}"/>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%">${dots.join("")}</svg>`;
}

export default function HoneyField() {
  const inner = useRef<HTMLDivElement>(null);
  const svg = buildSvg();

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let tX = 0;
    let tY = 0;
    let cX = 0;
    let cY = 0;
    let spin = 0;
    let last = performance.now();

    const onMove = (e: MouseEvent) => {
      tY = (e.clientX / window.innerWidth - 0.5) * 30; // rotateY
      tX = -(e.clientY / window.innerHeight - 0.5) * 22; // rotateX
    };
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      cX += (tX - cX) * 0.05;
      cY += (tY - cY) * 0.05;
      spin += dt * 2; // ~2°/s idle rotation
      el.style.transform = `perspective(1200px) rotateX(${cX.toFixed(2)}deg) rotateY(${cY.toFixed(2)}deg) rotateZ(${spin.toFixed(2)}deg)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-0 flex items-start justify-center overflow-hidden [mask-image:radial-gradient(ellipse_118%_56%_at_50%_29%,#000_42%,transparent_74%)]"
    >
      <div
        ref={inner}
        className="mt-[-30%] aspect-square h-[120%] max-h-none [transform-origin:center]"
        style={{ willChange: "transform" }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
