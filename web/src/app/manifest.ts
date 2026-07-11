import type { MetadataRoute } from "next";

// PWA manifest — makes HoneyMoney installable ("Add to Home Screen") on mobile
// WITHOUT ever forcing it. It works as a normal browser page; installing is a
// user choice. No service worker (avoids stale-cache surprises in the demo).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HoneyMoney — AI Financial Wellness",
    short_name: "HoneyMoney",
    description: "Funding transparency, spending autonomy — a knowledge-graph money app for personal, family & business.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#E8A012",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
