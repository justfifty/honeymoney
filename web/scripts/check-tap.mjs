// Is the bottom tab bar actually TAPPABLE on a phone — and is the main thread
// free enough to notice the tap?
//
// check-nav.mjs proves the five destinations are present, on-screen and 44px.
// That is necessary and it is not sufficient: a link can pass every one of those
// and still be untappable, because something else is painted over it or because
// the main thread is too busy to dispatch the event. Both happened here.
//
//   node scripts/check-tap.mjs http://127.0.0.1:3001
//   node scripts/check-tap.mjs http://127.0.0.1:3000 http://127.0.0.1:3001   # compare
//
// Two measurements, at 390x844 (iPhone 14) with a 4x CPU throttle to stand in
// for a mid-range Android:
//
//  1. HIT TEST. For each tab, elementFromPoint() at its centre. If the answer is
//     not that tab (or a child of it), something is on top and the tap goes
//     there instead. This is what the install banner was doing at bottom-3.
//
//  2. FRAME THROUGHPUT. Count requestAnimationFrame callbacks over 2s while
//     scrolling. A page that cannot reach ~40fps under throttle is a page whose
//     taps and scrolls get dropped, which is what "the screen is stuck" means.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASES = process.argv.slice(2).filter((a) => a.startsWith("http"));
if (!BASES.length) BASES.push("http://127.0.0.1:3000");

const ROUTE = "/record";
const TABS = ["/record", "/dashboard", "/graph", "/hscore", "/more"];
const PORT = Number(process.env.CDP_PORT || 9334);
const CPU_THROTTLE = 4;

const CHROME = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
].filter(Boolean).find((p) => existsSync(p));
if (!CHROME) { console.error("No Chrome/Edge found. Set CHROME_PATH."); process.exit(2); }

const HIT = `(() => {
  const nav = [...document.querySelectorAll('nav[aria-label="Primary"]')]
    .find((n) => getComputedStyle(n).position === 'fixed');
  if (!nav) return { error: 'no fixed primary nav' };
  const out = [];
  for (const a of nav.querySelectorAll('a[href]')) {
    const r = a.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(x, y);
    const ok = hit ? (hit === a || a.contains(hit)) : false;
    // Name the thing that stole the tap, so a failure says WHAT is on top.
    let blocker = null;
    if (!ok && hit) {
      const el = hit.closest('[class]') || hit;
      blocker = el.tagName.toLowerCase() + '.' + String(el.className).split(/\s+/).slice(0, 3).join('.');
    }
    out.push({ path: new URL(a.href, location.origin).pathname, ok, blocker });
  }
  return { tabs: out, nodes: document.getElementsByTagName('*').length,
           circles: document.getElementsByTagName('circle').length };
})()`;

const FPS = `new Promise((resolve) => {
  let frames = 0; const t0 = performance.now();
  const tick = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
    else resolve(Math.round(frames / ((performance.now() - t0) / 1000))); };
  requestAnimationFrame(tick);
  // Scroll while measuring: an idle page can look fine and still stutter the
  // moment the compositor has to do something.
  let y = 0; const s = setInterval(() => { window.scrollTo(0, (y += 40) % 400); }, 50);
  setTimeout(() => clearInterval(s), 2000);
})`;

let msgId = 0;
const rpc = (ws, method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++msgId;
  const onMsg = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id !== id) return;
    ws.removeEventListener("message", onMsg);
    m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result);
  };
  ws.addEventListener("message", onMsg);
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = join(tmpdir(), `hm-tapcheck-${process.pid}`);
await mkdir(profile, { recursive: true });
const proc = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run",
  "--no-default-browser-check", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; }
  catch { await sleep(250); }
}
if (!wsUrl) { proc.kill(); console.error("Chrome never exposed CDP."); process.exit(2); }

const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let failed = false;
try {
  for (const BASE of BASES) {
    const { targetId } = await rpc(ws, "Target.createTarget", { url: "about:blank" });
    const { sessionId } = await rpc(ws, "Target.attachToTarget", { targetId, flatten: true });
    await rpc(ws, "Page.enable", {}, sessionId);
    await rpc(ws, "Emulation.setDeviceMetricsOverride",
      { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
    await rpc(ws, "Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);
    await rpc(ws, "Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE }, sessionId);

    await rpc(ws, "Page.navigate", { url: BASE + ROUTE }, sessionId);
    // Wait for the bar to EXIST and be laid out, rather than sleeping a flat
    // guess. A fixed wait is calibrated to localhost and is wrong the first time
    // the script is pointed at the real site: over the network, with a 4x CPU
    // throttle, honeymoney.app had not applied its stylesheet yet and the probe
    // reported "no fixed primary nav" for a bar that was present in the HTML.
    // A check that cries wolf against production is a check nobody runs.
    const ready = await rpc(ws, "Runtime.evaluate", { expression: `new Promise((resolve) => {
      const t0 = Date.now();
      const look = () => {
        const n = [...document.querySelectorAll('nav[aria-label="Primary"]')]
          .find((n) => getComputedStyle(n).position === 'fixed');
        if (n && n.getBoundingClientRect().height > 0) return resolve('ready');
        if (Date.now() - t0 > 25000) return resolve('timeout');
        setTimeout(look, 250);
      };
      look();
    })`, awaitPromise: true, returnByValue: true }, sessionId);
    if (ready.result.value === "timeout") {
      console.log(`
${BASE}${ROUTE}  no fixed primary nav after 25s`);
      failed = true;
      await rpc(ws, "Target.closeTarget", { targetId });
      continue;
    }
    await sleep(1200); // let hydration settle before hit-testing

    const hit = (await rpc(ws, "Runtime.evaluate",
      { expression: HIT, returnByValue: true }, sessionId)).result.value;
    const fps = (await rpc(ws, "Runtime.evaluate",
      { expression: FPS, awaitPromise: true, returnByValue: true }, sessionId)).result.value;

    console.log(`\n${BASE}${ROUTE}  (390x844, ${CPU_THROTTLE}x CPU throttle)`);
    if (hit.error) { console.log("  " + hit.error); failed = true; }
    else {
      console.log(`  DOM nodes ${hit.nodes}   <circle> ${hit.circles}   frames/s ${fps}`);
      for (const want of TABS) {
        const t = hit.tabs.find((x) => x.path === want);
        if (!t) { console.log(`  ${want.padEnd(12)} MISSING`); failed = true; }
        else if (!t.ok) { console.log(`  ${want.padEnd(12)} BLOCKED by ${t.blocker}`); failed = true; }
        else console.log(`  ${want.padEnd(12)} tappable`);
      }
      if (fps < 40) { console.log(`  frames/s ${fps} is below 40 — taps and scrolls will be dropped`); failed = true; }
    }
    await rpc(ws, "Target.closeTarget", { targetId });
  }
} finally {
  ws.close();
  proc.kill();
}
process.exit(failed ? 1 : 0);
