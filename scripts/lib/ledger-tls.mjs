// Teach a Node SCRIPT the same certificate chain the app carries.
//
// ── WHY A SCRIPT NEEDS THIS TOO ────────────────────────────────────────────
//
// The 2026-09-13 outage had a second victim nobody noticed at first: the
// deploy toolchain. `scripts/build-static-site.mjs` renders the public
// snapshot by fetching pages FROM the origin, over the same domcloud.dev
// certificate whose issuer is never sent. So the moment the app broke, the
// command that republishes the edge snapshot broke with it — and said:
//
//     ❌ Can't reach https://honeymoney-app.domcloud.dev.
//        Start the production app first: cd web && npm run start
//
// The app was running. It had answered curl 40ms earlier. A TLS failure had
// been reported as "your server is down", which is the most expensive kind of
// wrong error message: it sends you to restart a healthy process.
//
// ── ONE SOURCE OF TRUTH ───────────────────────────────────────────────────
//
// The certificates are NOT duplicated here. They are read out of
// web/src/lib/tlsChain.ts, which is the file a human maintains and the file
// the server actually uses. If that file is ever updated for a new issuer,
// every script picks the change up without anyone remembering they exist.
//
// Reading TypeScript as text rather than importing it is deliberate: these
// scripts run on bare `node`, with no bundler and no loader, and they should
// keep doing so.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import tls from "node:tls";

const CHAIN_SOURCE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "web",
  "src",
  "lib",
  "tlsChain.ts",
);

let installed = false;

/**
 * Extend this process's default CA set with the chain in tlsChain.ts.
 *
 * Never throws. A script that cannot read the file is a script running from
 * somewhere unexpected, and it should fail on its actual job with its actual
 * error rather than here.
 *
 * @returns how many certificates were added (0 if none, for logging).
 */
export function installLedgerCertificateChain() {
  if (installed) return 0;
  installed = true;

  if (
    typeof tls.setDefaultCACertificates !== "function" ||
    typeof tls.getCACertificates !== "function"
  ) {
    return 0;
  }

  try {
    const src = readFileSync(CHAIN_SOURCE, "utf8");
    const pems =
      src.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
    if (!pems.length) return 0;
    tls.setDefaultCACertificates([...tls.getCACertificates(), ...pems]);
    return pems.length;
  } catch {
    return 0;
  }
}
