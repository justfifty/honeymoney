#!/usr/bin/env node
/**
 * Build the competition demo MP4: the deck's argument, told over the live product.
 *
 * Structure follows the brief a judge is scoring against — problem → solution →
 * proof → strategy → benefits → CTA — and every frame is either a real page of
 * honeymoney.app or a real slide of PITCH_DECK.html. Nothing is mocked.
 *
 * TWO FRAME SOURCES, both addressed rather than clicked. Chrome's --screenshot
 * cannot click or scroll, so:
 *   • web pages   — captured tall once per URL, cropped per beat at `y`.
 *   • deck slides — the deck is 13 slides of exactly 1280x720 stacked, so it is
 *                   captured as one strip at 1.5x and cropped at slide*1080.
 * That is what makes the three personas and all six graph views reachable:
 * /graph takes ?tenantId= and ?mode=, so each is a URL, not an interaction.
 *
 * THE VOICE IS SYNTHETIC, deliberately. A neural en-SG voice is regionally right
 * and always current; a human recording is warmer and goes stale the moment the
 * product changes. The `vo` strings below ARE the script — record over them.
 *
 * ⚠️ TIMING IS DRIVEN BY THE AUDIO. Each beat holds for as long as its line
 * takes to say, plus a breath. Hand-written hold times with narration poured in
 * afterwards is how VO ends up clipped mid-word.
 *
 *   node scripts/build-demo-video.mjs             capture + narrate + encode
 *   node scripts/build-demo-video.mjs --no-shoot  reuse frames and audio
 *   node scripts/build-demo-video.mjs --no-vo     silent, captions only
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORK = path.join(ROOT, ".demo-video");
const OUT = path.join(ROOT, "docs", "deck", "HoneyMoney_Demo_MAIC2026.mp4");
const DECK = "file:///" + path.join(ROOT, "docs", "deck", "PITCH_DECK.html").replace(/\\/g, "/");
const SITE = process.env.DEMO_SITE || "https://honeymoney.app";
// en-US-EmmaMultilingualNeural is one of the newer "Conversation/Copilot" voices
// (Cheerful, Clear, Conversational). The older *Neural voices — including the
// regionally-apt en-SG pair — read noticeably flatter and more announcer-like,
// which is the wrong register for a 3-minute explainer. Accent origin matters
// less here than not sounding synthetic.
const VOICE = process.env.DEMO_VOICE || "en-US-EmmaMultilingualNeural";
// Default TTS pace is slower than a person pitching. +12% is brisk without
// clipping consonants; the video shortens automatically because timing is
// driven by the measured audio.
const RATE = process.env.DEMO_RATE || "+12%";
const shoot = !process.argv.includes("--no-shoot");
const narrate = !process.argv.includes("--no-vo");
const samplesOnly = process.argv.includes("--samples");

const CHROME =
  process.env.CHROME ||
  ["C:/Program Files/Google/Chrome/Application/chrome.exe",
   "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!CHROME) throw new Error("No Chrome/Edge found. Set CHROME=<path>.");

const W = 1920, H = 1080, FPS = 30, XFADE = 0.55;
const PAD = 0.85;       // breath after each line
const MIN_HOLD = 3.0;
const PAGE_H = 3000;    // web pages: captured tall, cropped per beat
const DECK_SCALE = 1.5; // 1280x720 slides -> 1920x1080 frames

// drawtext needs an explicit font on Windows: without fontfile= ffmpeg dies with
// "Fontconfig error: Cannot load default config file", which says nothing about
// text. Segoe UI rather than Arial because captions carry → and ·.
const FONT = ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"].find(existsSync);
if (!FONT) throw new Error("No caption font found under C:/Windows/Fonts.");
const FONTARG = FONT.replace(/:/g, "\\\\:");

// The three seeded personas, from config.demoPersonaIds. /graph accepts these
// via ?tenantId= for anonymous visitors and rejects anything else, so a URL is
// enough to show each household's real graph.
const AISHA = "psaisha33333333";
const COUPLE = "cprahman2222222";
const RAHMAN = "hhrahman1111111";
const g = (q) => `/graph?${q}`;

/**
 * The beat sheet. `deck: n` takes slide n; `page` takes a URL cropped at `y`.
 * `cap` is read on screen, `vo` is heard — the same words rarely serve both.
 */
const SHOTS = [
  { deck: 1, cap: "Four e-wallets, cards and cash. Nothing adds them up.",
    vo: "Malaysian households run money across four or five e-wallets, plus cards and cash. Nothing adds them up." },
  { deck: 1, cap: "Tracking fatigue is the failure mode — not missing features.",
    vo: "Traditional apps answer that with manual entry and surveillance, so people burn out and stop. Tracking fatigue is the failure mode, not missing features." },
  { page: "/", y: 0, cap: "HoneyMoney — live now at honeymoney.app",
    vo: "HoneyMoney is a working product, live today, and free to open." },
  { deck: 3, cap: "The 3-Bucket Method: Must-paid · Savings · Spendings",
    vo: "The solution is one simple method. Must-paid for rent and bills. A savings percentage taken automatically. And a private spendings bucket, where tracking deliberately stops." },
  { page: "/", y: 250, cap: "Snap it or type it — one line, not a spreadsheet.",
    vo: "Recording a spend takes one line. Snap a receipt, forward a screenshot, or simply type it." },
  { page: g(`tenantId=${AISHA}&mode=sankey`), y: 90,
    cap: "Aisha — Solo: freelance and shop income",
    vo: "The same engine serves very different households. Aisha is solo, with freelance and online shop income." },
  { page: g(`tenantId=${COUPLE}&mode=sankey`), y: 90,
    cap: "Nadia & Faiz — a couple, two incomes, one mortgage",
    vo: "Nadia and Faiz are a couple: two incomes, one mortgage, and a personal bucket each." },
  { page: g(`tenantId=${RAHMAN}&mode=sankey`), y: 90,
    cap: "The Rahman Household — a family carrying more",
    vo: "The Rahmans are a family, carrying school fees and support for ageing parents. Three shapes, one schema, no changes." },
  { page: g(`tenantId=${RAHMAN}&mode=bars`), y: 90,
    cap: "Six views of the same graph — Budget",
    vo: "Because the money is a graph, it can be read six ways. Budget, against what each bucket is allowed." },
  { page: g(`tenantId=${RAHMAN}&mode=tree`), y: 90,
    cap: "Tree — structure at a glance",
    vo: "A tree, for the structure of the household at a glance." },
  { page: g(`tenantId=${RAHMAN}&mode=treemap`), y: 90,
    cap: "Treemap — where the weight sits",
    vo: "A treemap, for where the weight actually sits." },
  { page: g(`tenantId=${RAHMAN}&mode=organic`), y: 90,
    cap: "Organic — the household as a network",
    vo: "An organic network, showing how everything connects." },
  { page: g(`tenantId=${RAHMAN}&mode=flow`), y: 90,
    cap: "Flow — income to buckets to spending",
    vo: "And flow, following income into buckets, and out to real spending." },
  { page: "/demo", y: 60,
    cap: "Four households, one in every H-Score band",
    vo: "The public demo puts a household in each of the four H-Score bands." },
  { page: "/demo", y: 60,
    cap: "Suria · Strong    Nadia & Faiz · Steady",
    vo: "Suria is Strong. Nadia and Faiz are Steady." },
  { page: "/demo", y: 60,
    cap: "The Azlans · Building    Hafiz & Lina · Thriving",
    vo: "The Azlans are Building, under real pressure. And Hafiz and Lina are Thriving, so the top band is visibly reachable, not a marketing promise." },
  { page: "/demo", y: 520,
    cap: "H-Score: one number, and what drives it",
    vo: "Every score breaks down into what you save, what the essentials take, and how deep the buffer is." },
  { deck: 7, cap: "Strategy: free for households, employers sponsor seats",
    vo: "The strategy is free for households, growing by family referral, and monetised through employers who sponsor seats as a wellbeing benefit." },
  { deck: 9, cap: "Malaysia fit: BNM inclusion · MADANI · SDG 1, 3, 8",
    vo: "It is built for Malaysia, aligned to Bank Negara's financial inclusion agenda, the MADANI agenda, and three sustainable development goals." },
  { page: "/guide", y: 200,
    cap: "On-device receipt scanning. Zero AI tokens.",
    vo: "Receipt scanning runs on your own device and spends no A I tokens at all. Private by design." },
  { deck: 12, cap: "honeymoney.app · MAIC Nexus 2026 · Track T3",
    vo: "HoneyMoney. Happy wife, happy life. Live now at honeymoney dot app." },
];

// ── Frame capture ───────────────────────────────────────────────────────────
const slug = (s) => s.replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
const pageFile = (p) => path.join(WORK, "pg_" + slug(p) + ".png");
const deckStrip = path.join(WORK, "deck_strip.png");
// The voice and rate are part of the filename. Keying the cache on beat index
// alone meant changing DEMO_VOICE or DEMO_RATE silently reused the previous
// narration — the video would rebuild and sound identical.
const voTag = (VOICE + RATE).replace(/[^a-z0-9]+/gi, "").toLowerCase();
const voFile = (i) => path.join(WORK, `vo_${voTag}_${String(i).padStart(2, "0")}.mp3`);

// NOT when --samples: that run only writes audition clips, and wiping the work
// dir there deletes the captured frames a subsequent --no-shoot build needs.
if (shoot && !samplesOnly) rmSync(WORK, { recursive: true, force: true });
if (!existsSync(WORK)) mkdirSync(WORK, { recursive: true });

const capture = (url, out, width, height, scale) => {
  const args = ["--headless", "--disable-gpu", "--hide-scrollbars",
    // Fresh profile: an established one overlays the PWA install banner.
    `--user-data-dir=${path.join(WORK, "prof_" + slug(out))}`,
    `--window-size=${width},${height}`,
    // Load-bearing: hero copy fades in, and a screenshot taken before that
    // finishes catches the headline at ~15% opacity. Looks like a contrast bug.
    "--virtual-time-budget=9000",
    `--screenshot=${out}`];
  if (scale) args.push(`--force-device-scale-factor=${scale}`);
  execFileSync(CHROME, [...args, url], { stdio: "ignore" });
  if (!existsSync(out)) throw new Error(`capture failed: ${url}`);
};

const dur = (f) => parseFloat(execFileSync("ffprobe",
  ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).trim());

// --samples: write the same two lines in every candidate voice so a human can
// pick by ear. Necessary because nothing in this pipeline can judge a voice —
// duration and dB are measurable, "does this sound like a person" is not.
if (samplesOnly) {
  const dir = path.join(WORK, "samples");
  mkdirSync(dir, { recursive: true });
  const line =
    "In Malaysian households, money is the number one source of conflict. " +
    "HoneyMoney makes recording a spend take one line. Snap a receipt, or simply type it.";
  const candidates = [
    "en-US-EmmaMultilingualNeural", "en-US-AvaMultilingualNeural",
    "en-US-AndrewMultilingualNeural", "en-US-BrianMultilingualNeural",
    "en-SG-LunaNeural", "en-SG-WayneNeural", "en-GB-SoniaNeural",
  ];
  for (const v of candidates) {
    for (const r of ["+0%", "+12%", "+20%"]) {
      const f = path.join(dir, `${v}_${r.replace(/[+%]/g, "")}.mp3`);
      execFileSync("python", ["-m", "edge_tts", "--voice", v, "--rate", r,
        "--text", line, "--write-media", f], { stdio: "ignore" });
      console.log(`  ${v.padEnd(34)} ${r.padStart(5)}  ${(dur(f)).toFixed(1)}s`);
    }
  }
  console.log(`\n  samples in ${path.relative(ROOT, dir)} — play them, then rebuild with:`);
  console.log(`    DEMO_VOICE=<voice> DEMO_RATE=<rate> node scripts/build-demo-video.mjs --no-shoot`);
  process.exit(0);
}

const webPages = [...new Set(SHOTS.filter((s) => s.page).map((s) => s.page))];
if (shoot) {
  for (const p of webPages) { capture(SITE + p, pageFile(p), W, PAGE_H); console.log(`  captured ${p}`); }
  if (SHOTS.some((s) => s.deck !== undefined)) {
    capture(DECK, deckStrip, 1280, Math.ceil(13 * 720 * 1.02), DECK_SCALE);
    console.log("  captured deck strip (13 slides)");
  }
}
for (const p of webPages) if (!existsSync(pageFile(p))) throw new Error(`missing frame: ${p} — run without --no-shoot`);

// ── Narration, and the timing it dictates ───────────────────────────────────

SHOTS.forEach((s, i) => {
  if (!narrate) { s.hold = MIN_HOLD + 1.4; return; }
  if (!existsSync(voFile(i)))
    execFileSync("python", ["-m", "edge_tts", "--voice", VOICE, "--rate", RATE,
      "--text", s.vo, "--write-media", voFile(i)], { stdio: "ignore" });
  if (!existsSync(voFile(i))) throw new Error(`TTS failed for beat ${i}`);
  s.voDur = dur(voFile(i));
  s.hold = Math.max(MIN_HOLD, s.voDur + PAD);
});
if (narrate) console.log(`  narrated ${SHOTS.length} beats with ${VOICE}`);

// ── Filter graph ────────────────────────────────────────────────────────────
const esc = (t) => t.replace(/[\\:']/g, (c) => "\\" + c).replace(/,/g, "\\,");
const filters = SHOTS.map((s, i) =>
  s.deck !== undefined
    ? `[${i}:v]crop=${W}:${H}:0:${s.deck * H},setsar=1,fps=${FPS},format=yuv420p[v${i}]`
    : `[${i}:v]crop=${W}:${H}:0:${s.y},setsar=1,fps=${FPS},format=yuv420p[v${i}]`,
);

let prev = "v0", acc = SHOTS[0].hold;
const starts = [0];
for (let i = 1; i < SHOTS.length; i++) {
  filters.push(`[${prev}][v${i}]xfade=transition=fade:duration=${XFADE}:offset=${(acc - XFADE).toFixed(2)}[x${i}]`);
  starts.push(acc - XFADE);
  acc += SHOTS[i].hold - XFADE;
  prev = `x${i}`;
}

// Captions are drawn AFTER the xfade, switched by timestamp. Burning them into
// each still first made two captions dissolve THROUGH each other at every
// transition — legible in neither state.
let chain = prev;
filters.push(`[${chain}]drawbox=y=ih-142:w=iw:h=142:color=black@0.82:t=fill[bg]`);
chain = "bg";
SHOTS.forEach((s, i) => {
  const from = i === 0 ? 0 : starts[i] + XFADE / 2;
  const to = i === SHOTS.length - 1 ? acc + 1 : starts[i + 1] + XFADE / 2;
  const out = i === SHOTS.length - 1 ? "vout" : `c${i}`;
  filters.push(`[${chain}]drawtext=fontfile=${FONTARG}:text='${esc(s.cap)}':fontcolor=white:fontsize=40:` +
    `x=(w-text_w)/2:y=h-93:enable='between(t,${from.toFixed(2)},${to.toFixed(2)})'[${out}]`);
  chain = out;
});

const args = [];
SHOTS.forEach((s) => args.push("-loop", "1", "-t", s.hold.toFixed(2), "-i",
  s.deck !== undefined ? deckStrip : pageFile(s.page)));
if (narrate) {
  SHOTS.forEach((_, i) => args.push("-i", voFile(i)));
  const n = SHOTS.length;
  SHOTS.forEach((s, i) => {
    // Speech starts just after the cut, so no line begins mid-transition.
    const at = Math.round((starts[i] + (i === 0 ? 0.3 : XFADE)) * 1000);
    filters.push(`[${n + i}:a]adelay=${at}|${at}[a${i}]`);
  });
  filters.push(`${SHOTS.map((_, i) => `[a${i}]`).join("")}amix=inputs=${n}:normalize=0:dropout_transition=0,aresample=48000[aout]`);
}

args.push("-filter_complex", filters.join(";"), "-map", "[vout]");
if (narrate) args.push("-map", "[aout]", "-c:a", "aac", "-b:a", "160k");
args.push("-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p",
  "-movflags", "+faststart", "-r", String(FPS), "-shortest", "-y", OUT);

// Round FIRST, then split: Math.round(acc % 60) can yield 60 and print "1:60".
const total = Math.round(acc), mins = Math.floor(total / 60), secs = total % 60;
console.log(`\n  encoding ${SHOTS.length} beats → ${path.relative(ROOT, OUT)}  (${mins}:${String(secs).padStart(2, "0")}${narrate ? `, ${VOICE}` : ", silent"})`);
if (acc > 175) console.warn(`  ⚠️ ${mins}:${String(secs).padStart(2, "0")} — the skill's hard cap is 3:00 and target 2:50. Trim beats.`);
execFileSync("ffmpeg", args, { stdio: ["ignore", "ignore", "ignore"] });
writeFileSync(path.join(WORK, "beats.json"), JSON.stringify({ site: SITE, voice: narrate ? VOICE : null, runtime: acc, shots: SHOTS }, null, 2));
console.log("  done.");
