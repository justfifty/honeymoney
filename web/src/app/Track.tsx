"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Anonymous, first-party page-view tracker. Logs one view per navigation and a
// duration on leave. No third parties, no cookies of its own beyond a random
// session id in localStorage — fits the "no tracking fatigue" promise.
function sessionId(): string {
  try {
    let s = localStorage.getItem("hm_sid");
    if (!s) {
      s = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("hm_sid", s);
    }
    return s;
  } catch {
    return "";
  }
}

export default function Track() {
  const pathname = usePathname();
  const start = useRef(0);

  useEffect(() => {
    const session = sessionId();
    start.current = Date.now();

    // Deferred to idle, and that is not fastidiousness. This fired the instant a
    // route committed — the same moment the new page is fetching its own data,
    // hydrating, and waiting to answer the next tap. On a phone with one usable
    // connection, a page-view beacon competing with the render it is measuring
    // makes the thing slower purely so it can be recorded as slower.
    //
    // requestIdleCallback runs it when the main thread has nothing better to do;
    // the 2 s ceiling stops a busy page deferring it forever, and the setTimeout
    // fallback covers Safari, which only shipped rIC in 16.4.
    const idle: (cb: () => void, opts?: { timeout?: number }) => number =
      typeof window.requestIdleCallback === "function"
        ? (cb, opts) => window.requestIdleCallback(cb, opts)
        : (cb) => window.setTimeout(cb, 300);
    // The id of the row this view created. Sent back on leave so the server can
    // write the duration straight to it — the lookup it replaces was measured at
    // 67 ms, the most expensive of the three round trips a page view used to
    // cost. A ref, not state: nothing renders from it.
    const viewId = { current: "" };
    const handle = idle(
      () => {
        fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: pathname, referrer: document.referrer, session }),
          keepalive: true,
        })
          .then((r) => r.json())
          .then((d) => {
            if (typeof d?.id === "string") viewId.current = d.id;
          })
          .catch(() => {});
      },
      { timeout: 2000 },
    );

    const send = () => {
      const body = JSON.stringify({
        path: pathname,
        session,
        duration_ms: Date.now() - start.current,
        close: true,
        viewId: viewId.current,
      });
      try {
        navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
      } catch {
        /* ignore */
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") send();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", send);
    return () => {
      // If the view beacon never got its idle slot — a fast tap-through, say —
      // cancel it rather than let it fire against a path nobody is on any more.
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      send();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", send);
    };
  }, [pathname]);

  return null;
}
