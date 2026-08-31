// Knock on both halves of the origin, on a schedule, so that a person never has
// to be the one who wakes them.
//
// ── WHAT THIS IS BUYING ────────────────────────────────────────────────────
//
// The app runs under Passenger on DOM Cloud Lite, which has no `docker` feature
// and therefore no resident process: NGINX spawns the app on demand and reaps
// it after an idle spell. Measured, the spawn costs ~3s. That is not a slow
// page — it is a page that is not running yet, and it lands on whoever arrives
// first after a quiet hour. Which, for a household app used a few times a day,
// is very nearly EVERY visit.
//
// deploy/domcloud/pb.deploy.yml documents why this cannot be fixed on the host:
// DOM Cloud's deploy runner copies a fixed allowlist of passenger keys into the
// NGINX config and silently drops the rest, `min_instances` among them. So the
// process is kept alive from outside or not at all.
//
// ── WHY IT DOES NOT RETRY, ALERT, OR CARE ──────────────────────────────────
//
// A warmer that fails is not an incident; it means the next real visitor pays
// the cold start they were paying anyway. So every outcome is logged and none
// is thrown: a scheduled Worker that throws gets retried by the platform, and
// retrying a knock on a host that is down is how a warmer turns into a load
// generator against your own origin at the exact moment it is least able to
// take it.
//
// The timeout is deliberately LONGER than the cold start it is provoking. The
// whole point is to sit through the spawn so that nobody else has to; aborting
// at 3s would reliably cancel the very thing it was scheduled to do.
const KNOCK_TIMEOUT_MS = 20000;

async function knock(name, url) {
  if (!url) return `${name}: not configured`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      // A warm process is the goal; a warm CDN entry is not, and would defeat
      // the whole exercise by answering without ever reaching the origin.
      cache: "no-store",
      headers: { "User-Agent": "honeymoney-warm/1 (+https://honeymoney.app)" },
      signal: AbortSignal.timeout(KNOCK_TIMEOUT_MS),
    });
    return `${name}: ${res.status} in ${Date.now() - started}ms`;
  } catch (err) {
    return `${name}: ${err && err.name === "TimeoutError" ? "timeout" : "unreachable"} after ${Date.now() - started}ms`;
  }
}

export default {
  async scheduled(_event, env, ctx) {
    // Together, not in series. They are independent hosts, and a slow spawn on
    // one must not eat the other's budget.
    ctx.waitUntil(
      Promise.all([
        knock("app", env.APP_HEALTH),
        knock("pocketbase", env.PB_HEALTH),
      ]).then((lines) => console.log(lines.join("  |  "))),
    );
  },

  // No route is configured for this Worker, so this only answers on its own
  // workers.dev address. It exists so that `curl` can run the same knock the
  // schedule runs — "is the warmer working" should not require reading logs.
  async fetch(_request, env) {
    const lines = await Promise.all([
      knock("app", env.APP_HEALTH),
      knock("pocketbase", env.PB_HEALTH),
    ]);
    return new Response(lines.join("\n") + "\n", {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  },
};
