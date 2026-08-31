"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { Band } from "@/lib/hscore";
import { useHoneyPet } from "../pet/useHoneyPet";
import PetParticles from "../pet/PetParticles";

type Tr = (k: string, vars?: Record<string, string | number>) => string;

// Honey on the H-Score, doing nothing in particular — which is the point.
//
// ── WHY A STILL CAT AND NOT A CHASING ONE ──────────────────────────────────
//
// The Dashboard's cat follows the cursor because a dashboard is a screen you
// sweep. The H-Score is a screen you STARE at: one ring, one number, and five
// bars underneath explaining it. Something that darted about here would pull
// the eye off the only thing on the page worth looking at.
//
// So she is idle furniture with a mood, and the mood is the band. That is what
// earns her a place on a score screen rather than making her a sticker on it:
//
//   provisional  curled up asleep, with z's. The score is greyed out because
//                we have said we do not have enough to be honest yet, and a
//                sleeping cat says "resting, come back" in a way that a second
//                paragraph of notice text does not.
//   building     awake, alert, tail flicking. Watching it happen.
//   steady       settled, breathing.
//   strong       settled, breathing, and pleased about it.
//   thriving     loafed, and yawning, because there is nothing left to worry at.
//
// ── AND WHY IT COSTS NOTHING ───────────────────────────────────────────────
//
// Every one of those states is a CSS animation (globals.css, `hm-cat-*`): a
// long timeline that is nearly all held neutral frame, running on the
// compositor. No requestAnimationFrame is scheduled on this page until somebody
// actually touches her, and the loop from useHoneyPet cancels itself the moment
// the squash spring settles. An H-Score left open on a desk is as expensive as
// an H-Score with no cat on it.
//
// The gait is "still" for the same reason: she has no pointer target at all, so
// the only thing the loop is ever integrating is a boop.
//
// ── ON THE ARTWORK ─────────────────────────────────────────────────────────
//
// There is one photograph of Honey and there is not going to be a sprite sheet
// for a hackathon. So the yawn is a squash-and-stretch on the existing image
// plus three z's — which reads as a yawn because of the TIMING, not because the
// picture changed. If real frames ever arrive, the moods are already named and
// this is the only file that has to know about them.

/** Tiny. A boop on a score screen is punctuation, not a celebration. */
const POOL = 6;

/** Band → the idle animation class and the line she offers when booped. */
const MOODS: Record<string, { anim: string; say: string }> = {
  asleep: { anim: "hm-cat-doze", say: "pet.hs.say.asleep" },
  building: { anim: "hm-cat-flick", say: "pet.hs.say.building" },
  steady: { anim: "hm-cat-breathe", say: "pet.hs.say.steady" },
  strong: { anim: "hm-cat-breathe", say: "pet.hs.say.strong" },
  thriving: { anim: "hm-cat-yawn", say: "pet.hs.say.thriving" },
};

export default function MoodCat({
  band,
  /** False while the score is provisional — she sleeps through that. */
  confident,
  tr,
}: {
  band: Band;
  confident: boolean;
  tr: Tr;
}) {
  const mood = confident ? (MOODS[band] ?? MOODS.steady) : MOODS.asleep;
  const asleep = !confident;

  const [line, setLine] = useState<string | null>(null);
  const spoke = useRef(0);

  const panelRef = useRef<HTMLElement | null>(null);
  const catRef = useRef<HTMLSpanElement | null>(null);
  const partRefs = useRef<(HTMLElement | null)[]>([]);

  const pet = useHoneyPet({ panelRef, catRef, partRefs }, { gait: "still", pool: POOL });

  function boop() {
    const now = performance.now();
    pet.squash(asleep ? 5 : 9);
    pet.burst(asleep ? 1 : 2);
    // Under reduced motion nothing above does anything visible, so the LINE is
    // the whole of the feedback and must not be rate-limited away on the first
    // press. Same rule as /record: no animation must not become no answer.
    if (now - spoke.current < 700 && line) return;
    spoke.current = now;
    setLine(mood.say);
    // And then give the caption back. The caption says something about the
    // score and the boop line does not, so the line has to be the temporary
    // one of the two — otherwise one tap permanently costs the reader a
    // sentence that was doing work.
    window.setTimeout(() => setLine((cur) => (cur === mood.say ? null : cur)), 2600);
  }

  return (
    <section
      ref={panelRef}
      className="relative mt-5 flex touch-pan-y items-center gap-3 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <button
        type="button"
        onPointerUp={boop}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          boop();
        }}
        aria-label={tr("pet.hs.aria")}
        className="hm-tap relative shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900"
      >
        <span ref={catRef} className="block will-change-transform">
          <span className={`${mood.anim} block overflow-hidden rounded-[26%]`}>
            <Image
              src="/honey-cat.jpg"
              alt=""
              width={1021}
              height={1024}
              draggable={false}
              className="hm-cat-face block h-12 w-12 scale-[1.08] select-none"
            />
          </span>
        </span>

        {/* Three z's, staggered by delay rather than by three keyframe sets.
            Only while she is asleep — a dozing cat over a confident score would
            be saying the opposite of what the ring says. */}
        {asleep && (
          <span aria-hidden="true" className="pointer-events-none absolute -right-1 -top-1">
            {[0, 1.1, 2.2].map((d, i) => (
              <span
                key={i}
                className="hm-cat-zzz absolute font-display text-[10px] font-bold text-amber-500"
                style={{ animationDelay: `${d}s` }}
              >
                z
              </span>
            ))}
          </span>
        )}
      </button>

      <p className="min-w-0 flex-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        {/* Her caption is about the score, so it is worth reading even if you
            never touch her — which is the test for whether she belongs here at
            all. The booped line replaces it and then gives it back. */}
        {tr(line ?? (asleep ? "pet.hs.cap.asleep" : `pet.hs.cap.${band}`))}
      </p>

      <PetParticles pool={POOL} refs={partRefs} />
    </section>
  );
}
