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

    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname, referrer: document.referrer, session }),
      keepalive: true,
    }).catch(() => {});

    const send = () => {
      const body = JSON.stringify({
        path: pathname,
        session,
        duration_ms: Date.now() - start.current,
        close: true,
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
      send();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", send);
    };
  }, [pathname]);

  return null;
}
