// Roll the demo personas' history forward so "this month" is never empty.
//
// The seeds in pocketbase/pb_migrations/ stamp absolute dates at the moment they
// first run. That is fine on the day, and silently rots afterwards: by August the
// Rahmans' newest transaction was 13 July, so every month-to-date view on the
// public site — the dashboard, the Sankey's red spend ribbons, the budget bars —
// rendered an empty month and reported the household as 100% "Saved / Unspent".
//
// This shifts each demo tenant's transactions forward by a whole number of MONTHS,
// so the newest one lands in the current month. Whole months on purpose: the
// personas' stories are monthly (salary on the 1st, bills on the 6th–9th, the
// groceries drift across four months), and shifting by an arbitrary day count
// would scramble that into noise.
//
// Scoped hard to the demo persona ids. It must never touch a real household —
// those have real dates that mean something.
//
// Idempotent: run it as often as you like. A tenant already in the current month
// has a delta of 0 and is skipped.
//
// Usage:  node scripts/refresh-demo-data.mjs [--dry]
//         (from web/:  node --env-file=.env.local ../scripts/refresh-demo-data.mjs)

const DRY = process.argv.includes("--dry");

const BASE = process.env.POCKETBASE_URL || "http://127.0.0.1:8090";
const EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || "admin@honeymoney.local";
const PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || "honeymoney-local-dev";
const TENANTS = (process.env.DEMO_PERSONA_IDS ?? "psaisha33333333,cprahman2222222,hhrahman1111111")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let token = "";
async function api(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { Authorization: token } : {}), ...init.headers },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}
const q = (filter, extra = "") => `?perPage=500&filter=${encodeURIComponent(filter)}${extra}`;

// PocketBase datetimes are "YYYY-MM-DD HH:MM:SS.sssZ" — parse and re-emit in the
// same shape rather than round-tripping through toISOString(), which would move
// the wall-clock time of every row by the local UTC offset.
function parsePB(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s ?? "");
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5], se: +m[6] };
}
const pad = (n, w = 2) => String(n).padStart(w, "0");
const daysInMonth = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

function addMonths(p, delta) {
  const zero = p.y * 12 + (p.mo - 1) + delta;
  const y = Math.floor(zero / 12);
  const mo = (zero % 12) + 1;
  // The 31st exists in January and not in April — clamp rather than roll over
  // into the next month, which would move a bill out of its own month.
  const d = Math.min(p.d, daysInMonth(y, mo));
  return `${y}-${pad(mo)}-${pad(d)} ${pad(p.h)}:${pad(p.mi)}:${pad(p.se)}Z`;
}

async function main() {
  const auth = await api("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
  });
  token = auth.token;

  const now = new Date();
  const nowMonths = now.getFullYear() * 12 + now.getMonth();

  for (const tenant of TENANTS) {
    const txns = (await api(`/api/collections/transactions/records${q(`tenant='${tenant}'`, "&sort=-occurred_at")}`)).items;
    if (!txns.length) {
      console.log(`${tenant}: no transactions, skipped`);
      continue;
    }

    const newest = parsePB(txns[0].occurred_at);
    if (!newest) {
      console.log(`${tenant}: newest transaction has an unparseable date, skipped`);
      continue;
    }
    const delta = nowMonths - (newest.y * 12 + (newest.mo - 1));
    if (delta <= 0) {
      console.log(`${tenant}: newest is ${txns[0].occurred_at.slice(0, 10)} — already current, skipped`);
      continue;
    }

    console.log(`${tenant}: ${txns.length} transactions, newest ${txns[0].occurred_at.slice(0, 10)} → +${delta} month(s)`);
    if (DRY) continue;

    for (const t of txns) {
      const p = parsePB(t.occurred_at);
      if (!p) continue;
      await api(`/api/collections/transactions/records/${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({ occurred_at: addMonths(p, delta) }),
      });
    }

    // Temporal edges carry the "this allocation used to be RM700" story; shift
    // them by the same delta or they stop lining up with the spend they explain.
    const edges = (await api(`/api/collections/edges/records${q(`tenant='${tenant}'`)}`)).items;
    let moved = 0;
    for (const e of edges) {
      const patch = {};
      for (const field of ["valid_from", "valid_to"]) {
        const p = parsePB(e[field]);
        if (p) patch[field] = addMonths(p, delta);
      }
      if (Object.keys(patch).length) {
        await api(`/api/collections/edges/records/${e.id}`, { method: "PATCH", body: JSON.stringify(patch) });
        moved++;
      }
    }
    console.log(`  ${txns.length} transactions and ${moved} temporal edge(s) shifted`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
