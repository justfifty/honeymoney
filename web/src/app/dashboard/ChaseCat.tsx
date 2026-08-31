"use client";

import Image from "next/image";
import { useRef, useState, type ReactNode } from "react";
import { t as translate, type Locale } from "@/lib/i18n";
import { useHoneyPet } from "../pet/useHoneyPet";
import PetParticles from "../pet/PetParticles";

// The Honey band on the Dashboard, with Honey actually in it.
//
// ── WHY THIS CARD AND NOT ANOTHER ──────────────────────────────────────────
//
// A dashboard is a screen you came to read numbers on, so a moving thing has to
// be somewhere it can never sit on top of one. This card is the only block on
// the page with no figures in it: it is Honey's own sentence about the figures
// above, on a flat gradient, and the page comment two lines up in page.tsx is
// emphatic that it comes AFTER the data it comments on. A cat walking here
// cannot obscure a balance because there is no balance here to obscure.
//
// It also has DEAD TIME to fill, which no other card does. The sentence is
// written by a language model and streams in behind a Suspense skeleton while
// every number above it is already on screen. Something alive in that gap is
// worth more than a second row of grey bars.
//
// ── WHAT SHE DOES ─────────────────────────────────────────────────────────
//
// She trots along the floor of the card toward wherever you are pointing, turns
// to face the way she is walking, and wanders back to her spot when you leave.
// The gait is "trot" (app/pet/useHoneyPet.ts), which pins her vertical target
// at her baseline — she can move left and right across this card and cannot
// rise off the floor of it, whatever the pointer does.
//
// On a phone there is no hover, so the same thing happens under a dragged
// thumb, and a tap on her is a boop: squash, a couple of hearts, and a line.
// The card is `touch-pan-y` for the same reason /record is — a thumb dragging
// UP must still scroll the page, or the Dashboard grows a dead zone.
//
// Costs nothing when untouched: no rAF is scheduled until a pointer enters,
// and the loop cancels itself once she has settled back home.

/** Small pool. This is a garnish on a data screen, not the party on /record. */
const POOL = 8;

/** How far a drag travels before it counts as another stroke of petting. */
const PET_STRIDE = 40;

export default function ChaseCat({
  lang,
  children,
}: {
  lang: Locale;
  /** The insight itself — a server component, handed through untouched. */
  children: ReactNode;
}) {
  const tr = (k: string) => translate(lang, k);

  // The ONLY reactive state, and it changes on a tap, not on a frame.
  const [line, setLine] = useState<string | null>(null);
  const spoke = useRef(0);

  const panelRef = useRef<HTMLElement | null>(null);
  const catRef = useRef<HTMLSpanElement | null>(null);
  const partRefs = useRef<(HTMLElement | null)[]>([]);

  const pet = useHoneyPet(
    { panelRef, catRef, partRefs },
    { gait: "trot", pool: POOL, edge: 10 },
  );

  function say(key: string) {
    const now = performance.now();
    if (now - spoke.current < 900) return;
    spoke.current = now;
    setLine(key);
    // She stops talking on her own. A line left on screen becomes furniture,
    // and the card's job is the insight underneath it.
    window.setTimeout(() => setLine((cur) => (cur === key ? null : cur)), 2400);
  }

  function boop() {
    pet.squash(9);
    pet.burst(2);
    say("pet.dash.boop");
  }

  return (
    <section
      ref={panelRef}
      onPointerMove={(e) => {
        pet.onPanelPointerMove(e);
        // Dragging ACROSS her on a phone is petting, the same gesture /record
        // uses. consumeTravel returns whole strides, so a fast flick throws the
        // hearts it earned rather than one.
        if (pet.pointer.current.dragging) {
          const n = pet.consumeTravel(PET_STRIDE);
          if (n) {
            pet.burst(Math.min(n, 3));
            say("pet.dash.purr");
          }
        }
      }}
      onPointerEnter={pet.onPanelPointerEnter}
      onPointerLeave={pet.onPanelPointerLeave}
      // pb-16 is her floor: the card keeps a strip at the bottom that no text
      // occupies, so she is walking on the card rather than across the sentence.
      className="relative mt-8 touch-pan-y overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-6 pb-16 text-white shadow-lg"
    >
      {children}

      <button
        type="button"
        onPointerDown={() => pet.setDragging(true)}
        onPointerUp={() => {
          pet.setDragging(false);
          boop();
        }}
        onPointerCancel={() => pet.setDragging(false)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          boop();
        }}
        aria-label={tr("pet.dash.aria")}
        className="hm-tap absolute bottom-2 left-5 touch-pan-y rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-orange-500"
      >
        <span ref={catRef} data-facing="right" className="block will-change-transform">
          <span className="hm-cat-breathe block overflow-hidden rounded-[26%] shadow-[0_6px_14px_-8px_rgba(0,0,0,0.6)]">
            {/* NOT `priority`. On /record she is the largest thing above the
                fold and is the LCP; here the figures are, and preloading a cat
                would make her compete with them for the same first bytes. */}
            <Image
              src="/honey-cat.jpg"
              alt=""
              width={1021}
              height={1024}
              draggable={false}
              className="hm-cat-face block h-11 w-11 scale-[1.08] select-none"
            />
          </span>
        </span>
      </button>

      {/* What she just said, if anything. Sits beside her on her own strip, so
          it can appear and vanish without moving the insight above it. */}
      <p
        aria-hidden="true"
        className={
          "pointer-events-none absolute bottom-5 left-20 text-xs font-semibold transition-opacity duration-300 " +
          (line ? "opacity-90" : "opacity-0")
        }
      >
        {line ? tr(line) : ""}
      </p>

      <PetParticles pool={POOL} refs={partRefs} className="text-white" />
    </section>
  );
}
