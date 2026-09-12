// Can the APP reach the ledger — using the app's own TLS stack?
//
// ── THE FAILURE THIS CATCHES ───────────────────────────────────────────────
//
// On 2026-09-13 /graph and /goals rendered as empty tabs. Nothing in this repo
// had changed: the last commit touching lib/pocketbase.ts was two weeks old.
// What changed was the certificate chain of somebody else's server.
//
// honeymoney-pb.domcloud.dev serves its LEAF CERTIFICATE ONLY — no
// intermediate — and Let's Encrypt now issues domcloud.dev out of a hierarchy
// (YR2 -> ISRG Root YR) whose root is not in Node's bundled Mozilla list. So
// every fetch from the app died in the handshake with
// UNABLE_TO_VERIFY_LEAF_SIGNATURE, before a single request was sent.
//
// ── WHY NOTHING NOTICED FOR HOURS ─────────────────────────────────────────
//
// Every monitor we had was looking down a different road than the app:
//
//   curl https://honeymoney-pb.domcloud.dev/api/health   ->  200 in 43ms
//   honeymoney-warm cron knock on the same URL           ->  200, logged green
//   honeymoney.app/api/health                            ->  {"pocketbase":true}
//
// All three were honest and all three were irrelevant. Windows curl is built
// on Schannel, which chases the AIA extension to fetch the missing
// intermediate; Cloudflare Workers complete the chain too; and /api/health was
// reporting that three environment variables were set. The one stack that
// could not build the chain was Node's — which is the only stack that renders
// the pages.
//
// So this check is deliberately narrow: it makes the app's own call, with
// Node's own fetch, and reports the CAUSE rather than the symptom. It is the
// question "can a household see their records", asked the way the app asks it.
//
//   npm run check:ledger                     # against POCKETBASE_URL
//   npm run check:ledger -- https://other…   # or anywhere else
//
// Exit 1 when the ledger cannot be reached, so it can gate a deploy.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// The env file is read directly rather than via --env-file so that the script
// runs the same way from a scheduled task, a deploy hook and a shell.
function envFromFile() {
  try {
    const text = readFileSync(join(here, "..", ".env.local"), "utf8");
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const fileEnv = envFromFile();
const arg = process.argv.slice(2).find((a) => a.startsWith("http"));
const URL_ = (arg || process.env.POCKETBASE_URL || fileEnv.POCKETBASE_URL || "").replace(/\/$/, "");

if (!URL_) {
  console.log("No POCKETBASE_URL to check — set it in web/.env.local or pass one as an argument.");
  process.exit(1);
}

// Install the app's own chain fix, from the same single source of truth the
// server and the deploy scripts use. If web/src/lib/tlsChain.ts ever stops
// covering the issuer in play, this check fails — which is the point.
const { installLedgerCertificateChain } = await import("../../scripts/lib/ledger-tls.mjs");
installLedgerCertificateChain();

const TIMEOUT = 15000;

function causeChain(err) {
  const out = [];
  let c = err;
  while (c && out.length < 5) {
    const bit = [c.name, c.code, c.message].filter(Boolean).join(" ");
    if (bit) out.push(bit);
    c = c.cause;
  }
  return out;
}

const started = Date.now();
let res;
try {
  res = await fetch(`${URL_}/api/health`, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT),
  });
} catch (err) {
  const lines = causeChain(err);
  const tlsProblem = lines.some((l) => /CERT|SIGNATURE|ISSUER|SELF_SIGNED/i.test(l));
  console.log(
    `\nThe app CANNOT reach the ledger at ${URL_}\n\n` +
      lines.map((l) => `  ${l}`).join("\n") +
      `\n\n` +
      (tlsProblem
        ? `This is a certificate-chain failure, not an outage — the host is very\n` +
          `probably answering curl and every browser right now. Node will not chase\n` +
          `a missing intermediate the way Schannel and Cloudflare do.\n\n` +
          `See what the host actually sends:\n` +
          `  echo | openssl s_client -connect ${URL_.replace(/^https?:\/\//, "")}:443 \\n` +
          `    -servername ${URL_.replace(/^https?:\/\//, "")} 2>/dev/null | grep "^ [0-9] s:"\n\n` +
          `One line means it is sending a leaf and no issuer. The missing links are\n` +
          `carried in web/src/lib/tlsChain.ts — if the issuer named there is not the\n` +
          `issuer above, that file needs the new one.\n`
        : `The host is not answering this process at all. Check whether it is up,\n` +
          `and whether this is the blackhole signature (conn 0.000000, code 000):\n` +
          `  curl -m 20 -w '%{time_connect} %{http_code}\n' -o /dev/null ${URL_}/api/health\n`),
  );
  process.exit(1);
}

const ms = Date.now() - started;
if (!res.ok) {
  console.log(`\nLedger at ${URL_} answered HTTP ${res.status} in ${ms}ms — expected 200.\n`);
  process.exit(1);
}

console.log(`\nLedger reachable from Node — ${URL_} answered 200 in ${ms}ms.\n`);
process.exit(0);
