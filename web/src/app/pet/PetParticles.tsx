"use client";

import type { RefObject } from "react";

// The hearts and ringgit Honey throws, as markup.
//
// FIXED POOL, ALLOCATED ONCE. This is rule 3 from useHoneyPet.ts wearing a
// component's clothes: the nodes exist from mount, and a burst mutates their
// styles rather than mounting and unmounting DOM. React never re-renders them —
// the loop writes `transform` and `opacity` straight through the refs — so the
// cost of a celebration is a handful of style writes on already-composited
// layers, not a reconciliation.
//
// `pool` must match the `pool` passed to useHoneyPet. It is one number in two
// places by necessity: the hook owns the physics array and JSX owns the nodes.
export default function PetParticles({
  pool,
  refs,
  className = "text-amber-500",
}: {
  pool: number;
  /** The same array the hook was given. Filled in by these refs. */
  refs: RefObject<(HTMLElement | null)[]>;
  /** Colour, so a cat on a white card and one on an orange band can differ. */
  className?: string;
}) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 block">
      {Array.from({ length: pool }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={
            "absolute left-0 top-0 select-none text-xs font-bold opacity-0 will-change-transform " +
            className
          }
        >
          {i % 3 === 0 ? "RM" : "♥"}
        </span>
      ))}
    </span>
  );
}
