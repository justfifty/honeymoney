"use client";

import { useEffect, useRef, type RefObject } from "react";

// Honey's motion, extracted from record/PetCat.tsx so that three screens can
// share one cat instead of three copies of one.
//
// ── WHY A HOOK, AND WHY NOW ────────────────────────────────────────────────
//
// PetCat was 533 lines, and most of them were not about /record: springs, a
// fixed particle pool, a rAF that cancels itself, a measured home position and
// a reduced-motion path. Adding a cat to the Dashboard and to the H-Score by
// copying that file would have produced three places to regress the frame
// budget and three places to fix a bug — and only one of them is covered by
// scripts/check-tap.mjs.
//
// What actually differs between the three screens is one question, asked once
// per frame: WHERE DOES SHE WANT TO BE? So that is the seam. Everything else
// lives here.
//
//   /record    "lean"  — leans toward the pointer, and is dragged by it
//   /dashboard "trot"  — walks her baseline toward what you are reading
//   /hscore    "still" — does not follow at all; breathes, blinks, yawns
//
// ── THE RULES THIS FILE IS WRITTEN UNDER ───────────────────────────────────
//
// Unchanged from PetCat, because they are what keeps /record above 40fps on a
// throttled phone, and the Dashboard and H-Score are not cheaper pages:
//
//   1. NO setState IN THE LOOP. Every per-frame value is written to a DOM node
//      through a ref. React renders the calling component on discrete events
//      only — a new line of dialogue — not sixty times a second.
//   2. THE LOOP IS NOT ALWAYS RUNNING. It starts on an event and cancels itself
//      the moment the springs settle and the last particle dies. A page nobody
//      has touched schedules no rAF at all.
//   3. TRANSFORM AND OPACITY ONLY. Nothing here animates a property that
//      triggers layout or paint, and the particle pool is FIXED — nodes are
//      allocated once by the caller and reused.
//
// Reduced motion is not a degraded version of this: the loop is never started
// and the cat is still. Callers must keep giving feedback in words and in the
// meter, because "no animation" must not degrade to "no feedback".

export type PetGait = "lean" | "trot" | "still";

export interface PetRefs {
  /** The panel the cat lives in. Must be `relative` and `overflow-hidden`. */
  panelRef: RefObject<HTMLElement | null>;
  /** The element that is transformed. Wrap the artwork; do not transform it. */
  catRef: RefObject<HTMLElement | null>;
  /** Optional cursor-following glow. */
  glowRef?: RefObject<HTMLElement | null>;
  /** Optional parallax layer for ambient sparks. */
  fieldRef?: RefObject<HTMLElement | null>;
  /** The fixed particle pool, in order. Length must equal `pool`. */
  partRefs: RefObject<(HTMLElement | null)[]>;
}

export interface PetOptions {
  gait: PetGait;
  /** How many particles may be in the air at once. Fixed for the lifetime. */
  pool: number;
  /**
   * Breathing room kept between the cat and the panel's edge, in px. The reach
   * is MEASURED from the panel, not assumed symmetric: a cat sitting against
   * the left padding has genuinely less room to her left, and a symmetric
   * clamp is what lets a leftward drag slide her under `overflow-hidden` and
   * slice her in half.
   */
  edge?: number;
  /**
   * "trot" only. Her x target when nothing is being pointed at — normally 0
   * (home). The caller writes to it to walk her somewhere deliberate; see
   * dashboard/ChaseCat, which sends her to the bucket you are reading.
   */
  parkX?: RefObject<number>;
}

interface Particle {
  alive: boolean;
  x: number; y: number;
  vx: number; vy: number;
  rot: number; spin: number;
  life: number; max: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export interface PetPointer {
  x: number; y: number;
  inside: boolean;
  dragging: boolean;
  travel: number;
}

export interface PetApi {
  /** Start the loop if it is not already running. No-op under reduced motion. */
  run: () => void;
  /** Throw `n` hearts/ringgit from wherever the cat is standing. */
  burst: (n: number, spread?: number) => void;
  /** A squash-and-overshoot impulse — what a tap feels like. */
  squash: (force?: number) => void;
  /** True when the reader asked for reduced motion. Feedback must still happen. */
  isReduced: () => boolean;
  /** Pointer bookkeeping for the panel. Wire these to the panel element. */
  onPanelPointerMove: (e: { clientX: number; clientY: number }) => void;
  onPanelPointerEnter: () => void;
  onPanelPointerLeave: () => void;
  /** Pointer position within the panel, and drag state. Read-only for callers. */
  pointer: RefObject<PetPointer>;
  /** How many whole `stride`s the pointer has travelled since last asked. */
  consumeTravel: (stride: number) => number;
  /** Begin/end a drag. "lean" uses this to carry the cat under the finger. */
  setDragging: (on: boolean) => void;
}

export function useHoneyPet(refs: PetRefs, opts: PetOptions): PetApi {
  const { gait, pool, edge = 6, parkX } = opts;

  const parts = useRef<Particle[]>(
    Array.from({ length: pool }, () => ({
      alive: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, spin: 0, life: 0, max: 1,
    })),
  );

  // Position + velocity, plus a SEPARATE squash spring so a tap can overshoot
  // and settle without fighting the position spring for the same numbers.
  const body = useRef({ x: 0, y: 0, vx: 0, vy: 0, s: 0, sv: 0 });
  const ptr = useRef<PetPointer>({ x: 0, y: 0, inside: false, dragging: false, travel: 0 });
  const home = useRef({ x: 0, y: 0 });
  const reach = useRef({ left: 0, right: 0, up: 0, down: 0 });
  const raf = useRef(0);
  const last = useRef(0);
  const reduce = useRef(false);

  // Hoisted functions rather than useCallback: `step` schedules itself, which a
  // useCallback cannot express, and memoising the rest would buy nothing —
  // every value they touch lives in a ref, so a closure captured by an
  // in-flight frame is identical to a freshly created one.

  function step(now: number) {
    const dt = Math.min(0.032, (now - last.current) / 1000 || 0.016);
    last.current = now;

    const b = body.current;
    const p = ptr.current;
    const r = reach.current;

    // ── the one question that differs per screen ──────────────────────────
    let tx = 0;
    let ty = 0;
    if (gait === "lean") {
      if (p.dragging) {
        tx = clamp(p.x - home.current.x, -r.left, r.right);
        ty = clamp(p.y - home.current.y, -r.up, r.down);
      } else if (p.inside) {
        // Watched, not held: a fraction of the way, and never further than a
        // lean should carry her.
        tx = clamp((p.x - home.current.x) * 0.14, -Math.min(14, r.left), Math.min(14, r.right));
        ty = clamp((p.y - home.current.y) * 0.14, -Math.min(9, r.up), Math.min(9, r.down));
      }
    } else if (gait === "trot") {
      // She walks the panel's width but keeps her baseline — a cat crossing a
      // shelf, not a balloon. Vertical motion is only the bob her own gait
      // produces below, never a target, so she can never end up over a number.
      const wanted = p.inside ? p.x - home.current.x : (parkX?.current ?? 0);
      tx = clamp(wanted, -r.left, r.right);
      ty = 0;
    }
    // "still" wants home, which is what tx/ty already are.

    const stiff = p.dragging ? 420 : gait === "trot" ? 150 : 240;
    const damp = p.dragging ? 30 : gait === "trot" ? 17 : 21;
    b.vx += ((tx - b.x) * stiff - b.vx * damp) * dt;
    b.vy += ((ty - b.y) * stiff - b.vy * damp) * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    b.sv += (-b.s * 320 - b.sv * 15) * dt;
    b.s += b.sv * dt;

    // Tilt reads as weight: she leans into her own motion. A trotting cat also
    // bobs, and the bob is derived from her SPEED rather than from a timer, so
    // she is still when she is still and there is no timer to cancel.
    const purr = p.dragging ? Math.sin(now / 55) * 2.4 : 0;
    const tilt = clamp(b.vx * 0.022, -13, 13) + purr;
    const bob =
      gait === "trot" ? -Math.abs(Math.sin(now / 90)) * Math.min(3, Math.abs(b.vx) * 0.012) : 0;
    const lift = p.dragging ? 1.05 : 1;

    const cat = refs.catRef.current;
    if (cat) {
      cat.style.transform =
        `translate3d(${b.x.toFixed(2)}px, ${(b.y + bob).toFixed(2)}px, 0) ` +
        `rotate(${tilt.toFixed(2)}deg) ` +
        `scale(${(lift + b.s * 0.14).toFixed(3)}, ${(lift - b.s * 0.14).toFixed(3)})`;
      // Which way is she facing? Only "trot" turns around, and only past a
      // speed that reads as walking rather than as settling.
      if (gait === "trot" && Math.abs(b.vx) > 12) {
        cat.dataset.facing = b.vx < 0 ? "left" : "right";
      }
    }

    if (refs.glowRef?.current) {
      refs.glowRef.current.style.opacity = p.inside ? "1" : "0";
      refs.glowRef.current.style.transform =
        `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
    }
    if (refs.fieldRef?.current) {
      const dx = p.inside ? clamp((p.x - home.current.x) * 0.04, -10, 10) : 0;
      const dy = p.inside ? clamp((p.y - home.current.y) * 0.04, -7, 7) : 0;
      refs.fieldRef.current.style.transform =
        `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
    }

    // Particles: hearts and ringgit, thrown up and pulled down.
    let live = 0;
    const els = refs.partRefs.current;
    for (let i = 0; i < pool; i++) {
      const q = parts.current[i];
      const el = els?.[i];
      if (!q.alive || !el) continue;
      q.life += dt;
      if (q.life >= q.max) {
        q.alive = false;
        el.style.opacity = "0";
        continue;
      }
      live++;
      q.vy += 620 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.spin * dt;
      const k = q.life / q.max;
      el.style.opacity = String(k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      el.style.transform =
        `translate3d(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px, 0) ` +
        `rotate(${q.rot.toFixed(1)}deg) scale(${(1.15 - k * 0.5).toFixed(2)})`;
    }

    // Rule 2. `settled` is about the SPRINGS, not the pointer — a cat still
    // coasting after the cursor leaves has to be allowed to coast to a stop.
    // A park target that is not home also counts as unsettled, which is what
    // lets ChaseCat send her somewhere and have her stay there.
    const parked = gait === "trot" ? Math.abs((parkX?.current ?? 0) - b.x) : 0;
    const settled =
      Math.abs(b.x) < 0.2 && Math.abs(b.y) < 0.2 &&
      Math.abs(b.vx) < 1 && Math.abs(b.vy) < 1 &&
      Math.abs(b.s) < 0.002 && Math.abs(b.sv) < 0.02 &&
      parked < 0.5;

    if (settled && !live && !p.inside && !p.dragging) {
      raf.current = 0;
      if (cat) cat.style.transform = "";
      return;
    }
    raf.current = requestAnimationFrame(step);
  }

  function run() {
    if (reduce.current || raf.current) return;
    last.current = performance.now();
    raf.current = requestAnimationFrame(step);
  }

  function burst(n: number, spread = 1) {
    if (reduce.current) return;
    const b = body.current;
    let thrown = 0;
    for (let i = 0; i < pool && thrown < n; i++) {
      const q = parts.current[i];
      if (q.alive) continue;
      q.alive = true;
      q.x = home.current.x + b.x + (Math.random() - 0.5) * 26;
      q.y = home.current.y + b.y - 8;
      q.vx = (Math.random() - 0.5) * 190 * spread;
      q.vy = -170 - Math.random() * 150 * spread;
      q.rot = (Math.random() - 0.5) * 40;
      q.spin = (Math.random() - 0.5) * 320;
      q.life = 0;
      q.max = 0.85 + Math.random() * 0.5;
      thrown++;
    }
    run();
  }

  function squash(force = 8) {
    body.current.sv += force;
    run();
  }

  function onPanelPointerMove(e: { clientX: number; clientY: number }) {
    const r = refs.panelRef.current?.getBoundingClientRect();
    if (!r) return;
    const p = ptr.current;
    const nx = e.clientX - r.left;
    const ny = e.clientY - r.top;
    p.travel += Math.hypot(nx - p.x, ny - p.y);
    p.x = nx;
    p.y = ny;
    p.inside = true;
    run();
  }

  function onPanelPointerEnter() {
    ptr.current.inside = true;
    run();
  }

  function onPanelPointerLeave() {
    ptr.current.inside = false;
    ptr.current.dragging = false;
    run(); // let the springs coast home; the loop cancels itself when settled
  }

  function consumeTravel(stride: number) {
    const p = ptr.current;
    if (p.travel < stride) return 0;
    const n = Math.floor(p.travel / stride);
    p.travel -= n * stride;
    return n;
  }

  function setDragging(on: boolean) {
    ptr.current.dragging = on;
    if (on) ptr.current.travel = 0;
    run();
  }

  // Home position — where she sits when nothing is touching her. MEASURED, not
  // assumed: the panels are fluid, the particles are thrown from here, and the
  // clamp above is only as honest as these four numbers. Re-measured by a
  // ResizeObserver, which is why this needs no window listener.
  useEffect(() => {
    reduce.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    const measure = () => {
      const panel = refs.panelRef.current;
      const cat = refs.catRef.current;
      if (!panel || !cat) return;
      const pr = panel.getBoundingClientRect();
      const cr = cat.getBoundingClientRect();
      home.current = { x: cr.left - pr.left + cr.width / 2, y: cr.top - pr.top + cr.height / 2 };
      // Measured while she is AT home, so these are true distances to each
      // edge. The 1.05 accounts for the scale-up she gets while held.
      const halfW = (cr.width * 1.05) / 2;
      const halfH = (cr.height * 1.05) / 2;
      reach.current = {
        left: Math.max(0, home.current.x - halfW - edge),
        right: Math.max(0, pr.width - home.current.x - halfW - edge),
        up: Math.max(0, home.current.y - halfH - edge),
        down: Math.max(0, pr.height - home.current.y - halfH - edge),
      };
    };
    measure();

    const ro = new ResizeObserver(measure);
    const panel = refs.panelRef.current;
    if (panel) ro.observe(panel);

    // A loop left running in a hidden tab is pure cost — it wins the reader
    // nothing and keeps a composited layer alive. rAF already throttles when
    // hidden in most browsers; stopping outright also drops the layer.
    const onHidden = () => {
      if (!document.hidden) return;
      ptr.current.inside = false;
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
    document.addEventListener("visibilitychange", onHidden);

    return () => {
      ro.disconnect();
      document.removeEventListener("visibilitychange", onHidden);
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
    // refs are stable ref objects and `edge` is a constant per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    run,
    burst,
    squash,
    isReduced: () => reduce.current,
    onPanelPointerMove,
    onPanelPointerEnter,
    onPanelPointerLeave,
    pointer: ptr,
    consumeTravel,
    setDragging,
  };
}
