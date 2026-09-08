// Does the EDGE still have the assets the ORIGIN is asking for?
//
// ── THE FAILURE THIS CATCHES ───────────────────────────────────────────────
//
// honeymoney.app is served from two places at once. App routes (/login,
// /dashboard, /graph…) are proxied to the origin, which renders them from the
// current `web/.next`. Everything under `/_next/static/*` is served by the
// Cloudflare Pages snapshot. Those filenames are content-hashed, so a rebuild
// renames every one of them.
//
// Rebuild the origin and don't republish the snapshot, and the two halves stop
// agreeing: the origin serves HTML pointing at chunk names the snapshot has
// never heard of. The stylesheet 404s. Every route in the app — public and
// private — renders as unstyled HTML with giant unsized icons and never
// hydrates. deploy/pages/README.md calls it "the unstyled-site failure" and
// records it happening on 2026-08-24, 2026-08-25 and 2026-08-27, "each time by
// a route nobody had considered".
//
// It happened again on 2026-09-01, by yet another route: `npm run build` run
// merely to check that a change compiled. The README warns about exactly that
// and offers `NEXT_DIST_DIR=.next-verify npm run build` instead — but a warning
// in a document is not a guard, and the failure is SILENT. Every command
// reports success. The site answers 200. Only the browser knows, and only if
// somebody looks.
//
// So: look. This is the whole check, and it takes about four seconds.
//
//   npm run check:edge                       # against honeymoney.app
//   npm run check:edge -- https://staging…   # or anywhere else
//
// Exit 1 if any referenced asset is missing, so it can gate a deploy or run in
// a loop after one.

const args = process.argv.slice(2);
const BASE = (args.find((a) => a.startsWith("http")) || "https://honeymoney.app").replace(/\/$/, "");

// One public route served from the snapshot, and several app routes served by
// the origin. The origin ones are the point — a snapshot page is internally
// consistent by construction, because its HTML and its assets shipped together.
// The drift only shows where origin HTML meets edge assets.
const ROUTES = ["/", "/login", "/signup", "/record", "/dashboard", "/graph"];

// Which of those actually prove anything. `/` is answered by the snapshot for
// an anonymous English visitor, so it agrees with itself no matter how far the
// origin has drifted — it can never fail this check and must never be counted
// as evidence that the check ran. See the "inconclusive" exit at the bottom.
const SNAPSHOT_ROUTES = new Set(["/"]);

const TIMEOUT = 20000;

async function head(url) {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT),
    });
    return res.status;
  } catch {
    return 0;
  }
}

async function html(url) {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return { status: res.status, body: "" };
    return { status: res.status, body: await res.text() };
  } catch (err) {
    return { status: 0, body: "", error: String(err) };
  }
}

// Run straight after a deploy, the edge may not have finished propagating, and
// a false alarm that fails the publish command is worse than no check at all —
// people turn those off. So `--after-deploy` waits, and retries once before it
// is willing to call the deploy broken.
const AFTER_DEPLOY = args.includes("--after-deploy");
if (AFTER_DEPLOY) {
  process.stdout.write("\nwaiting 10s for the edge to settle… ");
  await new Promise((r) => setTimeout(r, 10000));
  console.log("checking");
}

console.log(`\nedge ↔ origin asset check\n   ${BASE}\n`);

let broken = 0;
let checked = 0;
// How many ORIGIN routes were actually read. A skipped route is not a passing
// route, and this is what stops the summary claiming otherwise.
let originRoutesRead = 0;
const unreadable = [];
const seen = new Map(); // asset -> status, so a shared chunk is fetched once

for (const route of ROUTES) {
  const fromOrigin = !SNAPSHOT_ROUTES.has(route);
  const page = await html(BASE + route);
  if (!page.status) {
    console.log(`  ??   ${route.padEnd(11)} unreachable`);
    if (fromOrigin) unreadable.push(`${route} — unreachable`);
    continue;
  }
  if (page.status !== 200) {
    console.log(`  ${page.status}  ${route.padEnd(11)} (not 200 — not checked)`);
    if (fromOrigin) unreadable.push(`${route} — ${page.status}`);
    continue;
  }
  if (fromOrigin) originRoutesRead++;

  // Every build asset the document asks for. `.css` first in the report,
  // because the stylesheet is the one whose absence is visible from the far
  // side of the room.
  const assets = [
    ...new Set((page.body.match(/\/_next\/static\/[a-zA-Z0-9._/-]+\.(?:css|js|woff2?)/g) || [])),
  ].sort((a, b) => (a.endsWith(".css") ? -1 : 0) - (b.endsWith(".css") ? -1 : 0));

  if (!assets.length) {
    console.log(`  --   ${route.padEnd(11)} no build assets referenced`);
    continue;
  }

  const missing = [];
  for (const a of assets) {
    if (!seen.has(a)) seen.set(a, await head(BASE + a));
    const status = seen.get(a);
    checked++;
    if (status !== 200 && status !== 206) missing.push({ a, status });
  }

  if (missing.length) {
    broken++;
    console.log(`  FAIL ${route.padEnd(11)} ${missing.length}/${assets.length} assets missing`);
    for (const m of missing) console.log(`         ${m.status || "ERR"}  ${m.a}`);
  } else {
    console.log(`  ok   ${route.padEnd(11)} ${assets.length} assets present`);
  }
}

// The retry covers "could not read the origin" as well as "assets missing".
// Straight after a publish the origin has usually just been restarted, so a
// route answering 503 for a few seconds is a cold start rather than a fault —
// and failing the publish over one would teach people to stop running this.
if ((broken || !originRoutesRead) && AFTER_DEPLOY && !process.env.HM_EDGE_RETRIED) {
  console.log(
    broken
      ? "\n…one route came back short. Waiting 20s and checking once more before failing."
      : "\n…no origin route answered. Waiting 20s and checking once more before failing.",
  );
  await new Promise((r) => setTimeout(r, 20000));
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  // fileURLToPath, not `pathname.slice(1)`: that trick strips the drive-letter
  // slash on Windows and the ROOT slash on Linux, so the retry — the only
  // path a GitHub runner takes after a publish — respawned a script it could
  // not find and failed for a reason that had nothing to do with the edge.
  const again = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], {
    stdio: "inherit",
    env: { ...process.env, HM_EDGE_RETRIED: "1" },
  });
  process.exit(again.status ?? 1);
}

if (broken) {
  console.log(
    `\n${broken} route(s) reference assets the edge does not have.\n\n` +
      `This is the unstyled-site failure: the origin has been rebuilt and the Pages\n` +
      `snapshot has not been republished, so the HTML points at content-hashed files\n` +
      `that no longer exist. Affected pages render as unstyled HTML and never hydrate.\n\n` +
      `Fix, from web/:   npm run site:publish\n` +
      `(build the app and restart the origin FIRST if .next has moved on — the\n` +
      `snapshot is rendered from the running server, so it can only be as current\n` +
      `as that server is.)\n\n` +
      `To check that a change merely COMPILES without doing this to the live site,\n` +
      `use \`npm run verify\` — it builds into .next-verify and leaves .next alone.\n`,
  );
  process.exit(1);
}

// ── A CHECK THAT COULD NOT LOOK MUST NOT REPORT "ok" ───────────────────────
//
// Every non-200 above used to `continue` without touching `broken`, and the
// run then printed "Edge and origin agree" and exited 0. Read that against the
// failure this file exists to catch: the origin is down or flapping, so every
// app route answers 503 from the worker's offline page and is skipped, `/` is
// answered by the SNAPSHOT and agrees with itself by construction, and the
// script congratulates you on a site whose origin it never once reached.
//
// That is not a weak check, it is an inverted one — it passed most confidently
// in the exact conditions that produce the failure. As the gate on
// `site:publish` it was gating on nothing, and as a monitor it was a green
// light over a broken site. Reported 2026-09-08 as "haywire icon and
// unreachable", a week after the last publish.
//
// So: reaching no origin route is its own outcome, named and non-zero. It is
// NOT the unstyled-site failure and does not claim to be — the message says
// which of the two you have, because the fixes are different.
if (!originRoutesRead) {
  console.log(
    `\nINCONCLUSIVE — no origin route could be read, so nothing was verified.\n\n` +
      unreadable.map((u) => `  ${u}`).join("\n") +
      `\n\n${BASE}/ answers from the Pages snapshot, which is internally consistent\n` +
      `whatever the origin is doing, so it proves nothing on its own.\n\n` +
      `The origin is down or unreachable from here. Bring it back first — that is\n` +
      `its own problem, not a snapshot problem — then re-run this check. Until it\n` +
      `answers, whether the edge still holds the assets it is serving is unknown.\n`,
  );
  // As a MONITOR, inconclusive is a failure: someone should look. As the last
  // step of a PUBLISH, it is not — the upload already succeeded, the origin
  // being down is not something the publish did or a re-run can undo, and a
  // red run says "the deploy failed" to a person reading it on a phone, who
  // then re-runs it and changes nothing. Publish run #3 on 2026-09-08 was
  // exactly that: 119 files and the worker deployed, then red for an origin
  // outage that had nothing to do with it. A warning annotation keeps the fact
  // visible at the top of the run without lying about what happened.
  if (AFTER_DEPLOY) {
    console.log("::warning title=Published, but the origin was down — edge not verified::" +
      "The upload succeeded. No origin route answered, so whether the edge holds the " +
      "assets the origin references could not be checked. Run `npm run check:edge` " +
      "once the origin is back.");
    process.exit(0);
  }
  process.exit(1);
}

if (unreadable.length) {
  console.log(`\n  note: ${unreadable.length} origin route(s) could not be read — ${unreadable.join(", ")}`);
}
console.log(
  `\nEdge and origin agree — ${checked} asset reference(s) across ` +
    `${originRoutesRead} origin route(s), none missing.\n`,
);
process.exit(0);
