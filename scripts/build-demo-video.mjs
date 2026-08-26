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
 *   • web pages   — captured tall once per (URL, viewport), cropped per beat.
 *   • deck slides — rasterised straight out of the SHIPPED PDF with pdftoppm,
 *                   one page per beat. `deck: n` is the PDF page number a human
 *                   would type into a viewer, 1-indexed.
 *
 * THE DECK IN THIS VIDEO IS THE DECK THE JUDGES GET. It used to be a Chrome
 * render of PITCH_DECK.html, which stopped being the deck the day the Canva
 * export became the upload artefact — so the video was quoting slides from a
 * file nobody ships. Reading the PDF removes the possibility of drift: there is
 * one deck, and the video cannot be a render of a different one.
 * That is what makes the three personas, all six graph views, the four score
 * tiers and the product directory reachable: /graph takes ?tenantId= and ?mode=,
 * /demo takes ?persona=, ?tab= and ?dir=. Each is a URL, not an interaction.
 *
 * SCROLLING IS THE CROP, MOVING. `scroll: <cssY>` pans the crop window from `y`
 * down to that offset over the beat, on a smoothstep so it eases in and out
 * rather than starting and stopping dead. A page is a tall document and a still
 * frame shows one screenful of it; panning is the only way a 6-second beat can
 * show what a visitor would actually scroll through, and it is also what stops
 * fourteen static screenshots from reading as a slideshow.
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
import { existsSync, mkdirSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORK = path.join(ROOT, ".demo-video");
const OUT = path.join(ROOT, "docs", "deck", "HoneyMoney_Demo_MAIC2026.mp4");
const DECK_PDF = path.join(ROOT, "docs", "deck", "HoneyMoney_Pitch_Deck_MAIC2026.pdf");
const SITE = process.env.DEMO_SITE || "https://honeymoney.app";
// en-US-AvaMultilingualNeural — chosen by ear from the --samples set, which is
// the only way this can be chosen: duration and dB are measurable, "sounds like
// a person" is not. One of the newer "Conversation/Copilot" voices (expressive,
// caring, pleasant); the older *Neural voices, including the regionally-apt
// en-SG pair, read flatter and more announcer-like, and en-SG is 24% slower for
// the same line. Accent origin matters less here than not sounding synthetic.
const VOICE = process.env.DEMO_VOICE || "en-US-AvaMultilingualNeural";
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
// Web pages are mounted at 90% on a near-black field rather than shown full
// bleed. Full-bleed screenshots read as "the video IS the page" and every edge
// artefact — a scrollbar shadow, a cut-off row — reads as a product bug; a
// margin reads as "the video is SHOWING you the page". Deck slides stay full
// bleed: they are 16:9 frames designed for exactly this canvas.
const PAGE_W = 1728, PAGE_H_FRAME = 972, MOUNT = "0x0e1013";
// Deck slides are letterboxed to clear the caption band rather than shown full
// bleed. They used to be full bleed because the HTML deck kept its bottom 142px
// for a footer; the Canva deck puts body copy there, so the band was cutting the
// last line off two cards on "Drivers & Impact". 936 (not 938) because 936 x
// 16/9 is exactly 1664 — an integer, an even one, and yuv420p needs even.
const DECK_W = 1664, DECK_H = 936;
const PAD = 0.85;       // breath after each line
const MIN_HOLD = 3.0;
// The default CSS viewport HEIGHT a page is captured at. Taller is not free:
// the landing hero sizes its Sankey to the viewport, and at 3400 it rendered as
// a 600px blank gap where the chart should be. A page that needs more than this
// says so with its own `vh`.
const PAGE_H = 3000;

// CSS viewport width a page is captured at. Every capture is re-rendered to
// exactly 1920 real pixels wide (device scale factor = 1920/vw), so a narrower
// viewport costs no sharpness — it only changes what CSS thinks the window is.
//
// It is load-bearing for legibility, not a style choice. /demo, /dashboard and
// /learn put their content in a max-w-lg / max-w-2xl column: at vw 1920 that
// column is 27% of the frame and 14px body text lands at ~12px on the finished
// video — present, but not readable. At NARROW it is 40% of the frame and the
// same text is ~19px, which is the difference between showing a judge the tier
// content and showing them a screenshot of a page that has tier content on it.
// 1280 (and not less) because the desktop nav, the two-column bucket grid and
// HoneyField all key off min-width:768px–1024px: go narrower and the video
// starts showing a layout the pitch never claims.
const NARROW = 1280;

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
// /demo?persona=&tab=&dir= — the public demo's four score tiers and the product
// directory, each addressable. Added to the app for this video and kept because
// an unlinkable tier is also an uncitable one.
const d = (q) => `/demo?${q}&tab=hscore`;

/**
 * The beat sheet. `deck: n` takes PAGE n of the shipped deck PDF (1-indexed,
 * the number a viewer shows); `page` takes a URL cropped at `y`.
 * `scroll: y2` pans that crop down to y2 across the beat; `vw` captures the
 * page at a narrower CSS viewport (see NARROW). `cap` is read on screen, `vo`
 * is heard — the same words rarely serve both.
 *
 * All `y` and `scroll` values are CSS pixels at that beat's own `vw`, so they
 * are the numbers you would read off the page in devtools, not frame offsets.
 */
const SHOTS = [
  { deck: 2, cap: "Four e-wallets, cards and cash. Nothing adds them up.",
    vo: "Malaysian households run money across four or five e-wallets, plus cards and cash. Nothing adds them up." },
  { deck: 2, cap: "Tracking fatigue is the failure mode — not missing features.",
    vo: "Traditional apps answer with manual entry and surveillance, so people burn out and stop. Tracking fatigue is the failure mode, not missing features." },
  { page: "/", y: 0, scroll: 210, cap: "HoneyMoney — live now at honeymoney.app",
    vo: "HoneyMoney is a working product, live today, and free to open." },
  { deck: 4, cap: "The 3-Bucket Method: Must-Paid · Savings · Spendings",
    vo: "One simple method. Must-paid for rent and bills, shared and visible. A savings percentage, moved before it can be spent. And Spendings: the household sees the total, and the detail stays yours." },
  { page: "/", y: 170, scroll: 1180, cap: "Photo, receipt scan, screenshot, or statement import.",
    vo: "Recording a spend takes seconds: a photo, a receipt scan, a screenshot, or a statement import. No bank link, no forms, no spreadsheet." },
  { page: g(`tenantId=${AISHA}&mode=sankey`), y: 60, scroll: 150,
    cap: "Aisha — Solo: freelance and shop income",
    vo: "The same engine serves very different households. Aisha is solo, with freelance and online shop income." },
  { page: g(`tenantId=${COUPLE}&mode=sankey`), y: 60, scroll: 150,
    cap: "Nadia & Faiz — a couple, two incomes, one mortgage",
    vo: "Nadia and Faiz are a couple: two incomes, one mortgage, and a personal bucket each." },
  { page: g(`tenantId=${RAHMAN}&mode=sankey`), y: 60, scroll: 150,
    cap: "The Rahman Household — a family carrying more",
    vo: "The Rahmans are a family, carrying school fees and support for ageing parents. Three shapes, one schema, no changes." },
  { page: g(`tenantId=${RAHMAN}&mode=bars`), y: 60, scroll: 150,
    cap: "Six views of the same graph — Budget",
    vo: "Because the money is a graph, it can be read six ways. Budget, against what each bucket is allowed." },
  { page: g(`tenantId=${RAHMAN}&mode=tree`), y: 60, scroll: 150,
    cap: "Tree — structure at a glance",
    vo: "A tree, for the structure of the household at a glance." },
  { page: g(`tenantId=${RAHMAN}&mode=treemap`), y: 60, scroll: 150,
    cap: "Treemap — where the weight sits",
    vo: "A treemap, for where the weight actually sits." },
  { page: g(`tenantId=${RAHMAN}&mode=organic`), y: 60, scroll: 150,
    cap: "Organic — the household as a network",
    vo: "An organic network, showing how everything connects." },
  { page: g(`tenantId=${RAHMAN}&mode=flow`), y: 60, scroll: 150,
    cap: "Flow — income to buckets to spending",
    vo: "And flow, following income into buckets, and out to real spending." },
  { page: "/dashboard", vw: NARROW, y: 0, scroll: 1530,
    cap: "One consolidated dashboard — spend, forecast, and Honey's advice",
    vo: "Everything consolidates into one dashboard: spending by day, week and month, a forward-looking forecast, and Honey's plain-language advice." },

  // ── the four tiers, one URL each ──────────────────────────────────────────
  // Four beats rather than one, because the tiers are the product's opinion
  // about a household and a single frame of one of them proves nothing. Each
  // pans its own screen, so what a judge sees is the score, then the five
  // sub-scores it is made of, then what moved it — the arithmetic, not a badge.
  { page: d("persona=individual"), vw: NARROW, y: 0, scroll: 820,
    cap: "Tiered insight — four households, four bands, four links",
    vo: "Insight is tiered, and every tier is its own link. Suria is Strong — and each score breaks into what you save, what essentials take, and how deep the buffer is." },
  { page: d("persona=couple"), vw: NARROW, y: 80, scroll: 850,
    cap: "Nadia & Faiz · Steady — two incomes, one mortgage",
    vo: "Nadia and Faiz are Steady: coping month to month, a buffer barely one month deep." },
  { page: d("persona=family"), vw: NARROW, y: 80, scroll: 850,
    cap: "The Azlans · Building — four people on RM7,000 gross",
    vo: "The Azlans are Building. Nothing here is a mistake they made; it is what the arithmetic does." },
  { page: d("persona=thriving"), vw: NARROW, y: 80, scroll: 850,
    cap: "Hafiz & Lina · Thriving — over four months of buffer",
    vo: "And Hafiz and Lina are Thriving, four months of buffer deep — so the top band is reachable, not a marketing promise." },

  // ── how the tiers pay for themselves ──────────────────────────────────────
  // The quiz is one card on an otherwise empty page: there is nothing below it
  // to pan to, so it is filmed narrower and held rather than scrolled into blank.
  { page: "/learn", vw: 1024, y: 0, scroll: 30,
    cap: "HoneyMoney Academy — a free money quiz, no sign-in, nothing stored",
    vo: "Learning is part of the product: the Academy quiz is live and free, no sign-in, nothing stored — and a surface a sponsor can back." },
  { page: d("persona=family&dir=deposits"), vw: NARROW, y: 0, scroll: 360,
    cap: "Goals open a catalogue — regulator named, nothing ranked",
    vo: "A weak sub-score opens a goal, and a goal opens a catalogue: every listing names its regulator and licence, and nothing in it is ranked or paid to rank." },
  { deck: 8, cap: "Free for households · goals and insights as a service",
    vo: "Households never pay. The revenue is budgeting goals and insights, as a service, funded by trusted sponsors and partner referrals." },
  { deck: 10, cap: "BNM literacy · MADANI · SDG 1 & 8 · bilingual PDPA notice",
    vo: "Built for Malaysia: Bank Negara's literacy priorities, the MADANI agenda, and a bilingual privacy notice with per-purpose consent, live today." },
  { page: "/guide", vw: NARROW, y: 600, scroll: 1400, cap: "On-device receipt scanning. Zero AI tokens.",
    vo: "Receipt scanning runs on your own device and spends no A I tokens at all. Private by design." },
  { deck: 12, cap: "honeymoney.app · MAIC Nexus 2026 · Track T3",
    vo: "HoneyMoney. Happy wife, happy life. Live now at honeymoney dot app." },
];

// ── Frame capture ───────────────────────────────────────────────────────────
const slug = (s) => s.replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
// Viewport width is part of the cache key. Without it, two beats that ask for
// the same URL at different `vw` share one file and the second silently gets
// the first one's layout — a bug that looks like a CSS bug, in a video.
const vwOf = (s) => s.vw || W;
const vhOf = (s) => s.vh || PAGE_H;
const pageKey = (s) => `${vwOf(s)}x${vhOf(s)}|${s.page}`;
const pageFile = (k) => path.join(WORK, "pg_" + slug(k) + ".png");
// One PNG per referenced page, named by page number, so a stale frame from a
// previous deck cannot survive a page being renumbered.
const deckPage = (n) => path.join(WORK, `deck_${String(n).padStart(2, "0")}.png`);
// The voice and rate are part of the filename. Keying the cache on beat index
// alone meant changing DEMO_VOICE or DEMO_RATE silently reused the previous
// narration — the video would rebuild and sound identical.
const voTag = (VOICE + RATE).replace(/[^a-z0-9]+/gi, "").toLowerCase();
// The LINE is in the key too, not just the voice and the beat number. Keyed on
// index alone, rewriting a beat's `vo` and rebuilding with --no-shoot silently
// re-used the previous take: the caption changed, the narration didn't, and the
// two drifted apart with nothing failing.
const voHash = (text) => createHash("sha1").update(text).digest("hex").slice(0, 8);
const voFile = (i, text) =>
  path.join(WORK, `vo_${voTag}_${String(i).padStart(2, "0")}_${voHash(text)}.mp3`);

// Frames only. The narration is keyed by voice, rate AND line, so it cannot go
// stale — and re-shooting used to throw away all two dozen takes to pick up a
// one-pixel layout change, which made "just re-capture that page" a two-minute
// job with a network dependency instead of a ten-second one.
// NOT when --samples: that run only writes audition clips, and wiping frames
// there would break a subsequent --no-shoot build.
if (!existsSync(WORK)) mkdirSync(WORK, { recursive: true });
if (shoot && !samplesOnly)
  for (const f of readdirSync(WORK))
    if (f.startsWith("pg_") || f.startsWith("deck_") || f.startsWith("prof_"))
      rmSync(path.join(WORK, f), { recursive: true, force: true });

const capture = (url, out, width, height, scale) => {
  const args = ["--headless", "--disable-gpu", "--hide-scrollbars",
    // Fresh profile: an established one overlays the PWA install banner.
    `--user-data-dir=${path.join(WORK, "prof_" + slug(out))}`,
    `--window-size=${width},${height}`,
    // Load-bearing: hero copy fades in, and a screenshot taken before that
    // finishes catches the headline at ~15% opacity. Looks like a contrast bug.
    "--virtual-time-budget=9000",
    // And the budget alone is not enough — it is a race, not a wait. Measured on
    // the landing page: three identical runs, two complete and one frozen with
    // the hero at ~40% opacity and the product shot not painted at all. Raising
    // the budget did not help and sometimes made it worse, because virtual time
    // is spent on the network before the entrance animations start.
    // The site already answers this properly: globals.css turns .hm-animate off
    // under prefers-reduced-motion, so asking for reduced motion renders every
    // element at its final state with nothing to race. Same pixels the site
    // shows a person who has asked their OS for less motion, every time.
    "--force-prefers-reduced-motion",
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
  // OUTSIDE the work dir. Samples used to live under .demo-video, which any
  // capture run wipes — so auditions were destroyed by the very build they were
  // meant to inform, and had to be regenerated to answer "which file was Sonia?".
  const dir = path.join(ROOT, ".vo-samples");
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

const webPages = new Map();
for (const s of SHOTS) if (s.page) webPages.set(pageKey(s), s);
const deckPages = [...new Set(SHOTS.filter((s) => s.deck !== undefined).map((s) => s.deck))];

// The deck is edited in Canva and exported over this file, so a slide can be
// added, removed or reordered without a single line of this repo changing. A
// beat pointing past the last page must fail loudly here rather than quietly
// narrate the wrong slide.
if (deckPages.length) {
  if (!existsSync(DECK_PDF)) throw new Error(`missing deck: ${DECK_PDF}`);
  const info = execFileSync("pdfinfo", [DECK_PDF], { encoding: "utf8" });
  const pages = parseInt(/^Pages:\s*(\d+)$/m.exec(info)?.[1] ?? "0", 10);
  const over = deckPages.filter((n) => n < 1 || n > pages);
  if (over.length) throw new Error(`beat sheet asks for deck page(s) ${over.join(", ")}; the deck has ${pages}`);
  // pdftoppm's -scale-to-x/-scale-to-y force the output size, so a deck that
  // stops being 16:9 would be silently STRETCHED to fit rather than letterboxed
  // — the one failure this pipeline could not show you in a log line.
  const size = /^Page size:\s*([\d.]+) x ([\d.]+)/m.exec(info);
  if (size) {
    const ratio = parseFloat(size[1]) / parseFloat(size[2]);
    if (Math.abs(ratio - W / H) > 0.01)
      throw new Error(`deck pages are ${size[1]}x${size[2]}pt (${ratio.toFixed(3)}:1), not 16:9 — rendering to ${W}x${H} would stretch them`);
  }
}
if (shoot) {
  for (const [k, s] of webPages) {
    const vw = vwOf(s);
    // Always 1920 real pixels wide, whatever the CSS viewport: a narrow page is
    // captured at a higher device scale factor rather than upscaled afterwards.
    capture(SITE + s.page, pageFile(k), vw, vhOf(s), W / vw);
    console.log(`  captured ${s.page}${vw === W ? "" : ` @${vw}px`}`);
  }
  for (const n of deckPages) {
    // -singlefile drops the page-number suffix pdftoppm otherwise appends, and
    // that suffix is zero-padded to the PAGE COUNT — so a 9-page deck writes
    // deck-9.png and a 10-page deck writes deck-09.png. Building the filename
    // ourselves would break silently the first time a slide is added.
    // Safe to force the size: the aspect check above already proved the pages
    // are 16:9, so this is a scale, not a stretch.
    execFileSync("pdftoppm", ["-png", "-f", String(n), "-l", String(n), "-singlefile",
      "-scale-to-x", String(W), "-scale-to-y", String(H),
      DECK_PDF, deckPage(n).replace(/\.png$/, "")], { stdio: "ignore" });
    if (!existsSync(deckPage(n))) throw new Error(`deck page ${n} did not render — is ${path.basename(DECK_PDF)} present?`);
    console.log(`  rendered deck p${n}`);
  }
}
for (const k of webPages.keys())
  if (!existsSync(pageFile(k))) throw new Error(`missing frame: ${k} — run without --no-shoot`);

// ── Narration, and the timing it dictates ───────────────────────────────────

SHOTS.forEach((s, i) => {
  if (!narrate) { s.hold = MIN_HOLD + 1.4; return; }
  const f = voFile(i, s.vo);
  if (!existsSync(f))
    execFileSync("python", ["-m", "edge_tts", "--voice", VOICE, "--rate", RATE,
      "--text", s.vo, "--write-media", f], { stdio: "ignore" });
  if (!existsSync(f)) throw new Error(`TTS failed for beat ${i}`);
  s.voDur = dur(f);
  s.hold = Math.max(MIN_HOLD, s.voDur + PAD);
});
if (narrate) console.log(`  narrated ${SHOTS.length} beats with ${VOICE}`);

// ── Filter graph ────────────────────────────────────────────────────────────
// Apostrophes become U+2019. Backslash-escaping ' inside drawtext's own
// single-quoted string does not survive ffmpeg's filter parser on Windows —
// the first caption to contain "Honey's" killed the whole encode with a bare
// exit status and no stderr. The typographic quote renders identically in
// Segoe UI and needs no escaping at all.
const esc = (t) => t.replace(/'/g, "’").replace(/[\\:]/g, (c) => "\\" + c).replace(/,/g, "\\,");
/**
 * The crop window's y, as an ffmpeg expression over the beat's own clock.
 *
 * Smoothstep (3u² − 2u³) rather than a linear ramp: a page that starts moving
 * at full speed on the cut and stops dead at the end reads as a machine
 * scrolling, and it fights the cross-fade at both ends, where two pages are on
 * screen at once and only one of them is moving. Easing in and out puts the
 * motion in the middle of the beat, where nothing else is happening.
 */
const panY = (a, b, hold) => {
  if (a === b) return String(a);
  // No backslash before the comma: the whole expression is single-quoted, which
  // already protects it from the filtergraph splitter, and an escaped comma
  // inside the quotes reaches the expression parser as a literal one.
  const u = `min(t/${hold.toFixed(2)},1)`;
  return `'${a}+(${b - a})*${u}*${u}*(3-2*${u})'`;
};

const filters = SHOTS.map((s, i) => {
  // Pinned to the TOP of the frame, not centred: centring would split the
  // leftover 144px between top and bottom and put half a slide back under the
  // caption band, which is the thing this exists to avoid.
  if (s.deck !== undefined)
    return `[${i}:v]scale=${DECK_W}:${DECK_H},pad=${W}:${H}:(ow-iw)/2:0:color=${MOUNT},` +
      `setsar=1,fps=${FPS},format=yuv420p[v${i}]`;
  // CSS px -> captured px. `y`/`scroll` are written in the page's own units so
  // the beat sheet stays readable when a beat's `vw` changes.
  const k = W / vwOf(s);
  const y0 = Math.round((s.y ?? 0) * k);
  const y1 = Math.round((s.scroll ?? s.y ?? 0) * k);
  const maxY = Math.round(vhOf(s) * k) - H;
  if (y0 > maxY || y1 > maxY)
    throw new Error(`beat ${i} (${s.page}) pans to ${Math.max(y0, y1)} but the capture bottoms out at ${maxY}`);
  // No `eval=frame`: crop has no such option (that is scale/overlay) and adding
  // it fails the whole encode. crop already re-evaluates x/y for every frame,
  // which is exactly why `t` is usable here at all.
  return `[${i}:v]crop=${W}:${H}:0:${panY(y0, y1, s.hold)},scale=${PAGE_W}:${PAGE_H_FRAME},` +
    `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${MOUNT},setsar=1,fps=${FPS},format=yuv420p[v${i}]`;
});

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
// -framerate FPS on each still, not just the fps filter downstream: crop's
// per-frame evaluation reads the INPUT timestamp, and the image2 demuxer's
// default 25fps would give the pan 25 distinct positions a second inside a
// 30fps video — visible as a faint stutter on slow moves.
SHOTS.forEach((s) => args.push("-loop", "1", "-framerate", String(FPS), "-t", s.hold.toFixed(2), "-i",
  s.deck !== undefined ? deckPage(s.deck) : pageFile(pageKey(s))));
if (narrate) {
  SHOTS.forEach((s, i) => args.push("-i", voFile(i, s.vo)));
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
