// Are the app's four primary destinations actually reachable — at every width,
// on every route — and do they meet the touch-target, active-state and keyboard
// rules? Answers it by measurement rather than by eye.
//
//   npm run check:nav                     # against the running app on :3000
//   npm run check:nav -- http://127.0.0.1:3001
//   npm run check:nav -- --shots ./out    # also write a screenshot per width
//
// Exits non-zero if any width x route combination fails, so it can gate a
// release the way `check:demo` does.
//
// Two things this script exists to get right, both of which produce confident
// wrong answers if you do the obvious thing instead:
//
//  1. Chrome's --window-size clamps to a 500px minimum on Windows. A headless
//     screenshot at 320px is therefore a *crop* of a 500px render: every
//     element looks clipped and the page looks catastrophically broken when it
//     is fine. Only Emulation.setDeviceMetricsOverride really resizes the
//     viewport, so this drives CDP rather than passing --window-size.
//
//  2. "The link is in the DOM" is not the same as "a thumb can reach it". A nav
//     item pushed outside the viewport, or 20px tall, passes a naive querySelector
//     check and fails the user. Boxes are measured, not merely counted.
//
// No dependencies: Node 22 ships a global WebSocket, which is all CDP needs.
//
// It finds the two primary bars by `<nav aria-label="Primary">`, which is also
// what keeps the footer's secondary link row out of the target-size check. Run
// this against a revision from before 2026-08-22 and the wide-width rows will
// report everything missing — the header nav carried no such label then. That
// is the script failing to find the bar, not the bar being absent.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith("http")) || "http://127.0.0.1:3000";
const shotDir = args.includes("--shots") ? args[args.indexOf("--shots") + 1] : null;

// 320 is the narrowest phone still in real use; 768 is iPad portrait, where the
// "desktop" header is being driven by a thumb.
const WIDTHS = [320, 375, 768, 1024, 1440];
const ROUTES = ["/", "/record", "/dashboard", "/hscore", "/more", "/login", "/signup"];
const WANT = ["/record", "/dashboard", "/hscore", "/more"];

// /demo is deliberately excluded: it is a self-contained one-page app whose tabs
// are component state, not links, so there is nothing here to find. ChromeGate
// keeps the global bar off it — see BottomNav.
const MIN_TARGET = 44; // WCAG 2.2 AA target size (2.5.8) is 24px; 44px is the
                       // Apple/Material thumb figure, and the brief's rule.

const PORT = Number(process.env.CDP_PORT || 9333);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

// Runs in the page. Returns what a reviewer would otherwise have to eyeball:
// per visible <nav>, which destinations it exposes and the box of each.
const PROBE = `(() => {
  const seen = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const links = [];
  for (const nav of [...document.querySelectorAll('nav')].filter(seen)) {
    for (const a of nav.querySelectorAll('a[href]')) {
      if (!seen(a)) continue;
      const r = a.getBoundingClientRect();
      links.push({
        path: new URL(a.href, location.origin).pathname,
        w: Math.round(r.width), h: Math.round(r.height),
        x: Math.round(r.left), right: Math.round(r.right),
        current: a.getAttribute('aria-current') === 'page',
        weight: getComputedStyle(a).fontWeight,
        // A decorative child marks the active item by shape rather than hue.
        marker: a.querySelector('span[aria-hidden="true"]') !== null,
        // The primary bars are the ones subject to the target-size rule; the
        // footer's secondary link row is not a primary destination.
        primary: nav.getAttribute('aria-label') === 'Primary',
      });
    }
  }
  return {
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    links,
  };
})()`;

let msgId = 0;
function rpc(ws, method, params = {}, sessionId) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id !== id) return;
      ws.removeEventListener("message", onMsg);
      if (m.error) reject(new Error(method + ": " + m.error.message));
      else resolve(m.result);
    };
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (s, n) => String(s).padEnd(n);

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error("No Chrome or Edge found. Set CHROME_PATH to the executable.");
  process.exit(2);
}

try {
  await fetch(BASE, { signal: AbortSignal.timeout(5000) });
} catch {
  console.error(`Nothing is answering at ${BASE}. Start the app first.`);
  process.exit(2);
}

const profile = join(tmpdir(), `hm-navcheck-${process.pid}`);
await mkdir(profile, { recursive: true });
const proc = spawn(chrome, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore", detached: false });

async function cdpUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(1000) });
      return (await r.json()).webSocketDebuggerUrl;
    } catch { await sleep(500); }
  }
  throw new Error("Chrome never opened its debugging port.");
}

let failures = 0;
const ws = new WebSocket(await cdpUrl());
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

const { targetId } = await rpc(ws, "Target.createTarget", { url: "about:blank" });
const { sessionId } = await rpc(ws, "Target.attachToTarget", { targetId, flatten: true });
await rpc(ws, "Page.enable", {}, sessionId);

async function probe(width, route) {
  await rpc(ws, "Emulation.setDeviceMetricsOverride",
    { width, height: 760, deviceScaleFactor: 1, mobile: width < 768 }, sessionId);
  if (route) {
    await rpc(ws, "Page.navigate", { url: BASE + route }, sessionId);
    // Client components mount and usePathname resolves only after hydration.
    await sleep(900);
  } else {
    await sleep(250);
  }
  const { result } = await rpc(ws, "Runtime.evaluate",
    { expression: PROBE, returnByValue: true }, sessionId);
  return result.value;
}

if (shotDir) await mkdir(shotDir, { recursive: true });

console.log(`${BASE}\n`);
console.log(pad("width", 7) + pad("route", 12) + pad("result", 8) +
  pad("missing", 30) + pad("offscreen", 14) + pad("under" + MIN_TARGET, 24) + "activeCue");

for (const width of WIDTHS) {
  for (const route of ROUTES) {
    const v = await probe(width, route);
    const primary = v.links.filter((l) => l.primary && WANT.includes(l.path));
    const present = new Set(primary.map((l) => l.path));

    const missing = WANT.filter((p) => !present.has(p));
    const offscreen = primary.filter((l) => l.x < -1 || l.right > v.innerWidth + 1);
    const small = primary.filter((l) => l.h < MIN_TARGET || l.w < MIN_TARGET);
    const active = primary.filter((l) => l.current);
    // Hue must never be the only thing separating the active item.
    const cueOk = active.length === 0 || active.every((l) => l.marker || Number(l.weight) >= 600);

    const ok = missing.length === 0 && offscreen.length === 0 && small.length === 0 && cueOk;
    if (!ok) failures++;

    console.log(pad(width, 7) + pad(route, 12) + pad(ok ? "ok" : "FAIL", 8) +
      pad(missing.join(",") || "-", 30) +
      pad(offscreen.map((l) => l.path).join(",") || "-", 14) +
      pad(small.map((l) => `${l.path}(${l.w}x${l.h})`).join(",") || "-", 24) +
      (active.length ? (cueOk ? "ok" : "COLOUR-ONLY") : "-"));

    if (shotDir && (route === "/" || route === "/record")) {
      const { data } = await rpc(ws, "Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(join(shotDir, `w${width}_${route === "/" ? "root" : route.slice(1)}.png`),
        Buffer.from(data, "base64"));
    }
  }
}

// A CSS-only solution survives a resize by construction; one that measures in JS
// may not. Worth testing separately, because both look identical on fresh load.
console.log("\nmid-session resize on /record, no reload:");
await probe(1440, "/record");
for (const w of [320, 1440, 375, 768, 320]) {
  const v = await probe(w, null);
  const present = new Set(v.links.filter((l) => l.primary).map((l) => l.path));
  const miss = WANT.filter((p) => !present.has(p));
  if (miss.length) failures++;
  console.log("  " + pad(w + "px", 8) + (miss.length ? "FAIL missing " + miss.join(",") : "ok, all four"));
}

await rpc(ws, "Target.closeTarget", { targetId }).catch(() => {});
ws.close();
proc.kill();
await rm(profile, { recursive: true, force: true }).catch(() => {});

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
