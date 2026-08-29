"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { t as translate, type Locale } from "@/lib/i18n";

// Honey, the cat — the top of /record.
//
// This replaces the old header (an <h1>, a one-line subtitle and an "Import →"
// link). The heading did not disappear: it is still here as an sr-only <h1>, so
// the document outline, the screen reader and the page's semantics are
// unchanged. Only the PIXELS were a title; the meaning stays. Import moved to
// its listing on /more, which is where every secondary destination already
// lives — see more/page.tsx.
//
// WHY A TOY ON A FINANCE APP. Capture is the one thing this app asks for every
// single day, and the daily-habit problem is not comprehension, it is return.
// The screen you must come back to should be pleased to see you. The cat is the
// greeting; the meter gives the visit a tiny reason to last a few seconds
// longer; and the celebration line points at the input, so the delight ends
// pointing at the job.
//
// ── The performance rule this file is written under ────────────────────────
//
// scripts/check-tap.mjs measures /record at 390x844 under a 4x CPU throttle and
// fails the route below ~40fps, because a page that cannot keep frames cannot
// dispatch taps. An interactive mascot is exactly the kind of thing that breaks
// that check, so three rules are absolute here:
//
//   1. NO setState IN THE ANIMATION LOOP. Every per-frame value is written
//      straight to a DOM node's `style.transform` through a ref. React renders
//      this component on discrete events only (a new line of dialogue), which
//      is a handful of renders per visit rather than sixty per second.
//   2. THE LOOP IS NOT ALWAYS RUNNING. It starts on the first pointer or key
//      that touches the panel and cancels itself the moment the springs settle
//      and the last particle dies. An untouched /record schedules no rAF at
//      all — idle breathing is a CSS animation, which never reaches the main
//      thread.
//   3. TRANSFORM AND OPACITY ONLY. Nothing here animates a property that
//      triggers layout or paint, and the particle pool is FIXED — the nodes are
//      allocated once at mount and reused, so a burst mutates styles instead of
//      building and tearing down DOM.
//
// Reduced motion is not a degraded version of this: the loop is never started,
// the cat is still, and petting still fills the meter and still answers in
// words. "No animation" must not degrade to "no feedback" — the same rule
// globals.css already applies to the tap states.

interface Props {
  lang: Locale;
  /** Household composition, already localised. Shown as the cat's caption. */
  household?: string | null;
}

/** How many particles can be in the air at once. Fixed pool — see rule 3. */
const POOL = 16;

/** Pets needed to fill the meter. Small enough to reach, big enough to earn. */
const PETS_TO_FULL = 12;

/** Pointer travel (px) that counts as one pet while dragging across the cat. */
const PET_STRIDE = 34;

/** Breathing room kept between the cat and the panel's edge, in px. */
const EDGE = 6;

// Ambient field, in the spirit of the drifting particles on a Stripe hero: pure
// CSS keyframes, no JS, and a parallax layer that only moves while a pointer is
// actually in the panel. Positions are hand-placed rather than random so the
// server and client markup agree — a Math.random() here is a hydration mismatch
// waiting to happen.
const SPARKS = [
  { left: "12%", top: "22%", size: 5, dur: "7.5s", delay: "0s", depth: 0.5 },
  { left: "26%", top: "72%", size: 4, dur: "9s", delay: "-2s", depth: 0.8 },
  { left: "44%", top: "16%", size: 6, dur: "8.2s", delay: "-4s", depth: 0.35 },
  { left: "58%", top: "62%", size: 4, dur: "10s", delay: "-1s", depth: 0.7 },
  { left: "71%", top: "28%", size: 5, dur: "7s", delay: "-3.5s", depth: 0.55 },
  { left: "84%", top: "68%", size: 4, dur: "9.4s", delay: "-5s", depth: 0.9 },
  { left: "92%", top: "34%", size: 3, dur: "8.8s", delay: "-6s", depth: 0.45 },
  { left: "35%", top: "44%", size: 3, dur: "11s", delay: "-2.5s", depth: 1 },
];

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  life: number;
  max: number;
}

export default function PetCat({ lang, household }: Props) {
  const tr = useCallback(
    (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars),
    [lang],
  );

  // The ONLY reactive state: what the cat is currently saying. Everything that
  // moves is a ref (see rule 1).
  const [line, setLine] = useState("pet.say.greet");

  const panelRef = useRef<HTMLElement | null>(null);
  const catRef = useRef<HTMLSpanElement | null>(null);
  const glowRef = useRef<HTMLSpanElement | null>(null);
  const fieldRef = useRef<HTMLSpanElement | null>(null);
  const meterRef = useRef<HTMLSpanElement | null>(null);
  const partEls = useRef<(HTMLSpanElement | null)[]>([]);

  const parts = useRef<Particle[]>(
    Array.from({ length: POOL }, () => ({
      alive: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, spin: 0, life: 0, max: 1,
    })),
  );

  // Cat body: position + velocity, plus a separate squash spring so a boop can
  // overshoot and settle without fighting the position spring.
  const body = useRef({ x: 0, y: 0, vx: 0, vy: 0, s: 0, sv: 0 });
  const ptr = useRef({ x: 0, y: 0, inside: false, down: false, dragging: false, travel: 0, downAt: 0 });
  const home = useRef({ x: 0, y: 0 });
  // How far she may travel in each direction before she would touch an edge.
  // Measured, not guessed: she sits hard against the panel's left padding, so a
  // symmetric reach lets a leftward drag push her under the `overflow-hidden`
  // and slice her in half. The room on her left is genuinely not the room on
  // her right, and the clamp has to know that.
  const reach = useRef({ left: 0, right: 0, up: 0, down: 0 });
  const pets = useRef(0);
  const celebrating = useRef(false);
  const raf = useRef(0);
  const last = useRef(0);
  const spoke = useRef(0);
  const reduce = useRef(false);

  // Everything below is a plain hoisted function rather than a useCallback.
  // `step` schedules itself, which a useCallback cannot express (it would be
  // reading its own binding before it is initialised), and memoising the rest
  // would buy nothing: this component re-renders only when the cat says
  // something new, and every value the handlers touch lives in a ref, so a
  // closure captured by an in-flight frame is identical to a fresh one.

  /** Say something, but never faster than a person can read it. */
  function say(key: string, force = false) {
    const now = performance.now();
    if (!force && now - spoke.current < 900) return;
    spoke.current = now;
    setLine(key);
  }

  // ── the loop ──────────────────────────────────────────────────────────────

  function step(now: number) {
    const dt = Math.min(0.032, (now - last.current) / 1000 || 0.016);
    last.current = now;

    const b = body.current;
    const p = ptr.current;

    // Where does the cat want to be? Under the finger while it is being
    // dragged; leaning toward the pointer while it is merely being watched;
    // home otherwise. Clamped so it can never escape the panel.
    const r = reach.current;
    let tx = 0;
    let ty = 0;
    if (p.dragging) {
      tx = clamp(p.x - home.current.x, -r.left, r.right);
      ty = clamp(p.y - home.current.y, -r.up, r.down);
    } else if (p.inside) {
      // Merely watched, not held: she leans a fraction of the way, and never
      // further than a lean should carry her.
      tx = clamp((p.x - home.current.x) * 0.14, -Math.min(14, r.left), Math.min(14, r.right));
      ty = clamp((p.y - home.current.y) * 0.14, -Math.min(9, r.up), Math.min(9, r.down));
    }

    const stiff = p.dragging ? 420 : 240;
    const damp = p.dragging ? 30 : 21;
    b.vx += ((tx - b.x) * stiff - b.vx * damp) * dt;
    b.vy += ((ty - b.y) * stiff - b.vy * damp) * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    b.sv += (-b.s * 320 - b.sv * 15) * dt;
    b.s += b.sv * dt;

    // Tilt reads as weight: the cat leans into its own motion. The extra
    // wobble while petting is the purr — small, fast, and only while touched.
    const purr = p.dragging ? Math.sin(now / 55) * 2.4 : 0;
    const tilt = clamp(b.vx * 0.022, -13, 13) + purr;
    const lift = p.dragging ? 1.05 : 1;

    if (catRef.current) {
      catRef.current.style.transform =
        `translate3d(${b.x.toFixed(2)}px, ${b.y.toFixed(2)}px, 0) ` +
        `rotate(${tilt.toFixed(2)}deg) ` +
        `scale(${(lift + b.s * 0.14).toFixed(3)}, ${(lift - b.s * 0.14).toFixed(3)})`;
    }

    // Glow and parallax follow the pointer. Both are transforms on already
    // composited layers, so this costs nothing beyond the style write.
    if (glowRef.current) {
      glowRef.current.style.opacity = p.inside ? "1" : "0";
      glowRef.current.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
    }
    if (fieldRef.current) {
      const dx = p.inside ? clamp((p.x - home.current.x) * 0.04, -10, 10) : 0;
      const dy = p.inside ? clamp((p.y - home.current.y) * 0.04, -7, 7) : 0;
      fieldRef.current.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
    }

    // Particles: hearts and ringgit, thrown up and pulled down.
    let live = 0;
    for (let i = 0; i < POOL; i++) {
      const q = parts.current[i];
      const el = partEls.current[i];
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

    // Rule 2: stop as soon as there is nothing left to draw. `settled` is about
    // the springs, not about the pointer — a cat still coasting after the
    // cursor leaves has to be allowed to coast to a stop.
    const settled =
      Math.abs(b.x) < 0.2 && Math.abs(b.y) < 0.2 &&
      Math.abs(b.vx) < 1 && Math.abs(b.vy) < 1 &&
      Math.abs(b.s) < 0.002 && Math.abs(b.sv) < 0.02;

    if (settled && !live && !p.inside && !p.down) {
      raf.current = 0;
      if (catRef.current) catRef.current.style.transform = "";
      return;
    }
    raf.current = requestAnimationFrame(step);
  }

  function run() {
    if (reduce.current || raf.current) return;
    last.current = performance.now();
    raf.current = requestAnimationFrame(step);
  }

  // ── events ────────────────────────────────────────────────────────────────

  /** Throw `n` hearts/ringgit from wherever the cat is standing. */
  function burst(n: number, spread = 1) {
    if (reduce.current) return;
    const b = body.current;
    let thrown = 0;
    for (let i = 0; i < POOL && thrown < n; i++) {
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

  /** One unit of pampering. Fills the meter; a full meter throws a party. */
  function pet() {
    if (celebrating.current) return;
    pets.current = Math.min(PETS_TO_FULL, pets.current + 1);
    if (meterRef.current) {
      meterRef.current.style.width = `${Math.round((pets.current / PETS_TO_FULL) * 100)}%`;
    }
    burst(1);

    if (pets.current >= PETS_TO_FULL) {
      celebrating.current = true;
      say("pet.say.happy", true);
      body.current.sv += 11;
      burst(POOL, 1.5);
      // Reset so the game is repeatable rather than a one-off that leaves a
      // full bar sitting there with nothing left to do.
      window.setTimeout(() => {
        pets.current = 0;
        celebrating.current = false;
        if (meterRef.current) meterRef.current.style.width = "0%";
        say("pet.say.again", true);
      }, 2600);
      return;
    }
    say(pets.current < 4 ? "pet.say.pet1" : pets.current < 8 ? "pet.say.pet2" : "pet.say.pet3");
  }

  // Home position — where the cat sits when nothing is touching it. Measured
  // rather than assumed, because the panel is fluid and the particles are
  // thrown from here. Re-measured on resize; the observer is why this needs no
  // window listener.
  useEffect(() => {
    reduce.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    const measure = () => {
      const panel = panelRef.current;
      const cat = catRef.current;
      if (!panel || !cat) return;
      const pr = panel.getBoundingClientRect();
      const cr = cat.getBoundingClientRect();
      home.current = { x: cr.left - pr.left + cr.width / 2, y: cr.top - pr.top + cr.height / 2 };
      // Measured while she is AT home, so these are true distances to each
      // edge. The 1.05 accounts for the scale-up she gets while held.
      const halfW = (cr.width * 1.05) / 2;
      const halfH = (cr.height * 1.05) / 2;
      reach.current = {
        left: Math.max(0, home.current.x - halfW - EDGE),
        right: Math.max(0, pr.width - home.current.x - halfW - EDGE),
        up: Math.max(0, home.current.y - halfH - EDGE),
        down: Math.max(0, pr.height - home.current.y - halfH - EDGE),
      };
    };
    measure();

    const ro = new ResizeObserver(measure);
    const panel = panelRef.current;
    if (panel) ro.observe(panel);
    return () => {
      ro.disconnect();
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, []);

  function onPanelMove(e: React.PointerEvent) {
    const r = panelRef.current?.getBoundingClientRect();
    if (!r) return;
    const p = ptr.current;
    const nx = e.clientX - r.left;
    const ny = e.clientY - r.top;
    if (p.dragging) {
      p.travel += Math.hypot(nx - p.x, ny - p.y);
      if (p.travel >= PET_STRIDE) {
        p.travel = 0;
        pet();
      }
    }
    p.x = nx;
    p.y = ny;
    p.inside = true;
    run();
  }

  function onPanelEnter() {
    ptr.current.inside = true;
    say("pet.say.hello");
    run();
  }

  function onPanelLeave() {
    ptr.current.inside = false;
    run(); // let the springs coast home; the loop cancels itself when settled
  }

  function onCatDown(e: React.PointerEvent<HTMLButtonElement>) {
    const p = ptr.current;
    p.down = true;
    p.dragging = true;
    p.travel = 0;
    p.downAt = performance.now();
    // Capture so a drag that leaves the button (or the panel) keeps feeding
    // this handler instead of being dropped mid-stroke.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    say("pet.say.drag");
    run();
  }

  function onCatUp(e: React.PointerEvent<HTMLButtonElement>) {
    const p = ptr.current;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const quick = performance.now() - p.downAt < 260 && p.travel < 12;
    p.down = false;
    p.dragging = false;
    p.travel = 0;
    if (quick) {
      // A tap, not a drag: boop. Decided here rather than in onClick, which
      // would fire again at the end of every drag and count it as a second pet.
      body.current.sv += 8;
      say("pet.say.boop", true);
      pet();
    }
    run();
  }

  // Keyboards never produce a pointer event, so the same game has to be
  // reachable from the key that a button is expected to answer.
  function onCatKey(e: React.KeyboardEvent) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    body.current.sv += 8;
    say("pet.say.boop", true);
    pet();
    run();
  }

  return (
    <section
      ref={panelRef}
      onPointerMove={onPanelMove}
      onPointerEnter={onPanelEnter}
      onPointerLeave={onPanelLeave}
      aria-labelledby="record-heading"
      // The padding is not only spacing: `overflow-hidden` makes this panel the
      // room the cat lives in, and the clamp in `step` measures her freedom from
      // these edges. Tighten it and she stops being draggable; there is nothing
      // to drag her into.
      className="hm-animate relative overflow-hidden rounded-3xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-amber-100/60 px-5 py-5 sm:py-6 dark:border-amber-900/50 dark:from-amber-950/40 dark:via-zinc-950 dark:to-amber-950/20"
    >
      {/* The page's heading did not go away — it stopped being a picture. */}
      <h1 id="record-heading" className="sr-only">
        {tr("cap.title")}
      </h1>

      <span
        ref={glowRef}
        aria-hidden="true"
        className="hm-cat-glow pointer-events-none absolute left-0 top-0 opacity-0"
      />

      <span ref={fieldRef} aria-hidden="true" className="pointer-events-none absolute inset-0 block">
        {SPARKS.map((s, i) => (
          <span
            key={i}
            className="hm-cat-spark absolute rounded-full bg-amber-400"
            style={{
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              animationDuration: s.dur,
              animationDelay: s.delay,
              opacity: 0.2 + s.depth * 0.3,
            }}
          />
        ))}
      </span>

      <div className="relative flex items-center gap-3 sm:gap-4">
        <button
          type="button"
          onPointerDown={onCatDown}
          onPointerUp={onCatUp}
          onPointerCancel={onCatUp}
          onKeyDown={onCatKey}
          aria-label={tr("pet.aria")}
          // pan-y, not none: a thumb dragging sideways pets the cat, and a
          // thumb dragging UP still scrolls the page. `none` here would make
          // the top of the daily-capture screen a dead zone for scrolling,
          // which is a real cost to pay for a toy.
          className="hm-tap shrink-0 touch-pan-y rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-50 dark:focus-visible:ring-offset-zinc-950"
        >
          <span ref={catRef} className="block will-change-transform">
            <span className="hm-cat-breathe block overflow-hidden rounded-[26%] shadow-[0_10px_24px_-12px_rgba(224,92,5,0.55)]">
              {/* Scaled a touch past its box: the artwork is a rounded icon on
                  a white field, and the crop is what removes the white rather
                  than leaving a pale square floating on the panel. */}
              <Image
                src="/honey-cat.jpg"
                alt=""
                width={1021}
                height={1024}
                priority
                draggable={false}
                className="block h-[76px] w-[76px] scale-[1.08] select-none sm:h-[88px] sm:w-[88px]"
              />
            </span>
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <p
            aria-live="polite"
            className="min-h-[2.5rem] font-display text-[0.95rem] font-semibold leading-snug tracking-tight text-zinc-800 dark:text-zinc-100"
          >
            {tr(line)}
          </p>
          <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {household ? tr("pet.caption.household", { who: household }) : tr("pet.caption")}
          </p>
          <span
            aria-hidden="true"
            className="mt-2 block h-1.5 w-28 overflow-hidden rounded-full bg-amber-200/70 dark:bg-amber-900/50"
          >
            <span
              ref={meterRef}
              className="block h-full w-0 rounded-full bg-amber-500 transition-[width] duration-200 ease-out"
            />
          </span>
        </div>
      </div>

      <span aria-hidden="true" className="pointer-events-none absolute inset-0 block">
        {Array.from({ length: POOL }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              partEls.current[i] = el;
            }}
            className="absolute left-0 top-0 select-none text-xs font-bold text-amber-500 opacity-0 will-change-transform"
          >
            {i % 3 === 0 ? "RM" : "♥"}
          </span>
        ))}
      </span>
    </section>
  );
}
