// Does anything in the app still reach for a microphone?
//
//   npm run check:mic                      # against the running app on :3000
//   npm run check:mic -- http://127.0.0.1:3001
//
// Task 3 of the 2026-08-22 brief removed the Speak function, and its acceptance
// criterion is a RUNTIME one — "no microphone permission prompt fires anywhere
// in the app" — so this measures rather than asserts. Exits non-zero on any
// finding, so it can gate a release the way check:nav and check:demo do.
//
// Two halves, because either alone gives a confident wrong answer:
//
//  1. BEHAVIOURAL. Every microphone entry point is replaced before a single line
//     of app code runs (Page.addScriptToEvaluateOnNewDocument), so a call is
//     recorded instead of prompting. A grep cannot see a mic reached through a
//     computed property or from inside a bundled dependency; this can. Note that
//     a headless Chrome auto-denies permission rather than prompting, so
//     watching for a visible prompt would pass no matter what the page did — the
//     call itself is the thing to catch.
//
//  2. STRUCTURAL. A dead mic BUTTON is still a broken promise to the user: it
//     either does nothing or throws. So the DOM is also swept for a control that
//     looks like one — a mic glyph, or an accessible name mentioning speech in
//     any of the six supported languages.
//
// A view that renders behind a component-state tab is invisible to a plain
// navigate — /demo opens on H-Score, so its Record screen (which carried a
// Speak button) is never in the DOM on load, and a route-only sweep passes it
// happily. Every `nav button` is therefore clicked and the sweep repeated.
//
// Routes that need a session render their signed-out state, so the crawler
// cannot reach the signed-in capture surface. That gap is covered by half 3
// rather than left open.
//
//  3. SOURCE. No file under src/ may name a speech API at all. This is the half
//     that speaks for /record and /dashboard while signed out, and it is a
//     stronger claim than any single page visit: the constructor cannot be
//     called from a surface where the identifier does not appear.
//
// No dependencies: Node 22 ships a global WebSocket, which is all CDP needs.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith("http")) || "http://127.0.0.1:3000";

const ROUTES = ["/", "/demo", "/record", "/dashboard", "/graph", "/guide", "/more", "/import", "/login", "/signup"];
const PORT = Number(process.env.CDP_PORT || 9334);

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

// Installed before the document exists, so app code can only ever see these.
// Each entry point is replaced rather than merely wrapped: the point is to
// record the reach without granting it, and without a prompt either way.
const TRAP = String.raw`
window.__mic = [];
const note = (what) => { window.__mic.push(what + " @" + location.pathname); };

function trapCtor(name) {
  const fake = function () { note(name); return { start(){}, stop(){}, abort(){} }; };
  try {
    Object.defineProperty(window, name, { configurable: true, writable: true, value: fake });
  } catch (e) { /* a locked-down property is one nothing can call either */ }
}
// Defined unconditionally, so a feature-detect branch that would be dead in this
// browser still gets exercised — Chrome has webkitSpeechRecognition, but a
// Firefox-only path must be caught here too.
trapCtor("SpeechRecognition");
trapCtor("webkitSpeechRecognition");

try {
  const md = navigator.mediaDevices;
  if (md) {
    md.getUserMedia = function (c) {
      // Camera getUserMedia is legitimate; only audio is this script's business.
      if (c && c.audio) note("getUserMedia({audio})");
      return Promise.reject(new DOMException("blocked by check:mic", "NotAllowedError"));
    };
  }
} catch (e) { /* no mediaDevices on an insecure origin — nothing to reach */ }

try {
  const q = navigator.permissions && navigator.permissions.query.bind(navigator.permissions);
  if (q) {
    navigator.permissions.query = function (d) {
      if (d && d.name === "microphone") note("permissions.query(microphone)");
      return q(d);
    };
  }
} catch (e) { /* ignore */ }

["getUserMedia", "webkitGetUserMedia", "mozGetUserMedia"].forEach(function (legacy) {
  try { navigator[legacy] = function () { note("navigator." + legacy); }; } catch (e) { /* ignore */ }
});
`;

// Half 2. An accessible name is what a user (and a screen reader) actually
// meets, so that — not the class list — is what gets matched.
const SPEECH_WORDS = [
  "speak", "voice", "microphone", "listening", "dictat", "say a spend",
  "cakap", "sebut", "suara", "mikrofon",
  "\u8bed\u97f3", "\u8bf4\u51fa", "\u9ea6\u514b\u98ce",
  "\u8a9e\u97f3", "\u8aaa\u51fa", "\u9ea5\u514b\u98a8",
  "\u0baa\u0bc7\u0b9a\u0bc1", "\u0b95\u0bc1\u0bb0\u0bb2\u0bcd", "\u0bae\u0bc8\u0b95\u0bcd",
  "\u092c\u094b\u0932", "\u0906\u0935\u093e\u091c\u093c", "\u092e\u093e\u0907\u0915",
];

// U+1F3A4 microphone, U+1F399 studio microphone.
const SWEEP = String.raw`(() => {
  const words = __WORDS__;
  const seen = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const name = (el) =>
    ((el.getAttribute('aria-label') || '') + ' ' + (el.title || '') + ' ' + (el.textContent || ''))
      .toLowerCase();
  const hits = [];
  for (const el of document.querySelectorAll('button, a, [role="button"], input')) {
    if (!seen(el)) continue;
    const n = name(el);
    if (/\u{1F3A4}|\u{1F399}/u.test(n)) { hits.push('mic glyph: ' + n.trim().slice(0, 40)); continue; }
    const w = words.find((x) => n.includes(x));
    if (w) hits.push('"' + w + '" in: ' + n.trim().slice(0, 40));
  }
  return { hits, fired: window.__mic || [] };
})()`.replace("__WORDS__", JSON.stringify(SPEECH_WORDS));

// Clicks one visible `nav button` by index and reports how many there are, so
// the caller can walk them without holding a stale element reference across
// re-renders. Index -1 counts without clicking. Returns 0 on a route with no
// such bar, which is most of them.
//
// replaceAll, not replace: with replace() only the FIRST `__I__` is substituted,
// the rest stay as a bare identifier, and the expression throws a ReferenceError
// inside the page. Paired with an evaluate() that swallowed exceptions, that
// produced a check which clicked nothing and reported every route clean — the
// exact failure this script exists to prevent. Hence also `throwOnError` below.
const TABS_AT = (i) => String.raw`(() => {
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const btns = [...document.querySelectorAll('nav button')].filter(seen);
  if (__I__ >= 0 && btns[__I__]) btns[__I__].click();
  return btns.length;
})()`.replaceAll("__I__", String(i));

// Half 3 — the identifiers, in source. Kept in step with the trap above.
const SPEECH_API = /SpeechRecognition|webkitSpeechRecognition|getUserMedia|MediaRecorder|speechSynthesis|useDictation/;

async function scanSource(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { await scanSource(p, out); continue; }
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(e.name)) continue;
    const text = await readFile(p, "utf8");
    text.split("\n").forEach((line, n) => {
      const m = line.match(SPEECH_API);
      // A comment recording that the feature was removed is not a reach for it.
      if (m && !/^\s*(\/\/|\*|\/\*)/.test(line)) {
        out.push(relative(SRC_ROOT, p).replace(/\\/g, "/") + ":" + (n + 1) + "  " + m[0]);
      }
    });
  }
  return out;
}

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

const SRC_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "src");

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error("No Chrome or Edge found. Set CHROME_PATH to the executable.");
  process.exit(2);
}

try {
  await fetch(BASE, { signal: AbortSignal.timeout(5000) });
} catch {
  console.error("Nothing is answering at " + BASE + ". Start the app first.");
  process.exit(2);
}

const profile = join(tmpdir(), "hm-miccheck-" + process.pid);
await mkdir(profile, { recursive: true });
const proc = spawn(chrome, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-port=" + PORT, "--user-data-dir=" + profile, "about:blank",
], { stdio: "ignore", detached: false });

async function cdpUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch("http://127.0.0.1:" + PORT + "/json/version", { signal: AbortSignal.timeout(1000) });
      return (await r.json()).webSocketDebuggerUrl;
    } catch { await sleep(500); }
  }
  throw new Error("Chrome never opened its debugging port.");
}

const ws = new WebSocket(await cdpUrl());
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

const { targetId } = await rpc(ws, "Target.createTarget", { url: "about:blank" });
const { sessionId } = await rpc(ws, "Target.attachToTarget", { targetId, flatten: true });
await rpc(ws, "Page.enable", {}, sessionId);
await rpc(ws, "Page.addScriptToEvaluateOnNewDocument", { source: TRAP }, sessionId);
// 375px: the mic used to sit in the capture row, which is the row that wraps.
await rpc(ws, "Emulation.setDeviceMetricsOverride",
  { width: 375, height: 760, deviceScaleFactor: 1, mobile: true }, sessionId);

let failures = 0;
console.log(BASE + "\n");
console.log(pad("route", 14) + pad("result", 8) + "finding");

// A probe that throws in the page must stop the run, not quietly return
// undefined — a silent probe reports "clean" for every route it never ran on.
const evaluate = async (expression) => {
  const r = await rpc(ws, "Runtime.evaluate", { expression, returnByValue: true }, sessionId);
  if (r.exceptionDetails) {
    throw new Error("probe threw in the page: " +
      (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }
  return r.result.value;
};

for (const route of ROUTES) {
  await rpc(ws, "Page.navigate", { url: BASE + route }, sessionId);
  await sleep(900); // client components mount only after hydration

  const findings = [];
  const collect = (v, where) => {
    for (const f of v.fired) findings.push("CALLED " + f);
    for (const h of v.hits) findings.push(where + h);
    v.fired.length = 0; // already reported; keep later tabs from re-listing it
  };

  collect(await evaluate(SWEEP), "");

  // Then each component-state tab, if this route has any.
  const tabs = await evaluate(TABS_AT(-1));
  for (let i = 0; i < tabs; i++) {
    await evaluate(TABS_AT(i));
    await sleep(350);
    collect(await evaluate(SWEEP), `tab ${i + 1}/${tabs}: `);
  }

  if (findings.length) failures++;
  console.log(pad(route, 14) + pad(findings.length ? "FAIL" : "ok", 8) +
    (findings.join(" \u00b7 ") || (tabs ? `- (${tabs} tabs walked)` : "-")));
}

await rpc(ws, "Target.closeTarget", { targetId }).catch(() => {});
ws.close();
proc.kill();
await rm(profile, { recursive: true, force: true }).catch(() => {});

// Half 3 — speaks for the signed-in surfaces the crawler cannot open.
const inSource = await scanSource(SRC_ROOT);
console.log("\nspeech APIs named anywhere in src/:");
if (inSource.length) {
  failures += inSource.length;
  for (const l of inSource) console.log("  FAIL  " + l);
} else {
  console.log("  none");
}

console.log(failures
  ? "\n" + failures + " finding(s): the microphone has not fully gone."
  : "\nNo route reaches for a microphone, no mic control is rendered, and no" +
    "\nsource file names a speech API.");
process.exit(failures ? 1 : 0);
