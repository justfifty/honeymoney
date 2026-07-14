"use client";

import { useEffect, useRef } from "react";

// A native <details> menu stays open until you click its summary again — so on
// the lens bar you could end up with Bucket, Vendor and Category all hanging
// open over the graph at once. This wrapper keeps the zero-JS <details> markup
// (server-rendered links, still works before hydration) but gives it the
// behaviour people expect of a menu:
//
//   • only one menu open at a time
//   • closes shortly after the pointer leaves
//   • closes on an outside click, on Escape, or once you actually pick something
//
// It deliberately does NOT close when it shouldn't:
//   • not on touch, where "the cursor left" is meaningless — an outside tap closes it
//   • not while a field inside is focused, so PeopleMenu's add-person form
//     can't be yanked away mid-typing

// Long enough to forgive a cursor cutting the corner between summary and panel
// (they're separated by a small gap), short enough not to feel sticky.
const CLOSE_DELAY_MS = 220;

export default function AutoCloseDetails({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const timer = useRef<number | null>(null);

  function cancelClose() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Opening one menu closes its siblings.
    function onToggle() {
      if (!el!.open) return;
      document.querySelectorAll<HTMLDetailsElement>("details[data-menu]").forEach((other) => {
        if (other !== el) other.open = false;
      });
    }

    function onPointerDown(e: PointerEvent) {
      if (el!.open && !el!.contains(e.target as Node)) el!.open = false;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || !el!.open) return;
      el!.open = false;
      el!.querySelector("summary")?.focus();
    }

    el.addEventListener("toggle", onToggle);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      el.removeEventListener("toggle", onToggle);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      cancelClose();
    };
  }, []);

  // Picking a lens is a client-side navigation, so nothing would otherwise
  // dismiss the panel — it would sit there covering the graph you just filtered.
  // Only links count: PeopleMenu's add/remove <button>s should leave the menu up
  // so you can edit the roster in one visit.
  function onClick(e: React.MouseEvent) {
    if ((e.target as Element).closest("a") && ref.current) ref.current.open = false;
  }

  function onMouseLeave() {
    const el = ref.current;
    if (!el?.open) return;
    // Hover isn't a real signal on touch devices — an outside tap closes it instead.
    if (!window.matchMedia("(hover: hover)").matches) return;
    // Someone is typing in here (PeopleMenu's name field) — leave them alone.
    const active = document.activeElement;
    if (active && el.contains(active) && active.matches("input, select, textarea")) return;

    cancelClose();
    timer.current = window.setTimeout(() => {
      if (ref.current) ref.current.open = false;
    }, CLOSE_DELAY_MS);
  }

  return (
    <details
      ref={ref}
      data-menu
      className={className}
      onClick={onClick}
      onMouseLeave={onMouseLeave}
      onMouseEnter={cancelClose}
    >
      {children}
    </details>
  );
}
