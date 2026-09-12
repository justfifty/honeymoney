import tls from "node:tls";

/**
 * THE MISSING HALF OF A CERTIFICATE CHAIN, CARRIED IN THE REPO.
 *
 * ── WHAT BROKE, 2026-09-13 ────────────────────────────────────────────────
 *
 * /graph and /goals stopped rendering — a blank tab, no error a reader could
 * act on. Neither page had changed, and lib/pocketbase.ts had not been touched
 * since 2026-08-31. What changed was somebody else's TLS configuration.
 *
 * Every read of the ledger failed at the transport, before any request was
 * even made:
 *
 *     PocketBaseUnreachable: PocketBase at https://honeymoney-pb.domcloud.dev
 *     could not be reached on auth: fetch failed
 *       cause: UNABLE_TO_VERIFY_LEAF_SIGNATURE
 *
 * The host serves its LEAF CERTIFICATE AND NOTHING ELSE — measured:
 *
 *     Certificate chain
 *      0 s:CN=domcloud.dev
 *        i:C=US, O=Let's Encrypt, CN=YR2        <- issuer never sent
 *
 * and Let's Encrypt now issues domcloud.dev out of its NEW hierarchy:
 * leaf -> YR2 -> ISRG Root YR. Node 22/24 ship the Mozilla root list, which
 * carries ISRG Root X1 and X2 and NOT Root YR — so the chain could not be
 * built from either end, and nothing on our side could have made it work.
 *
 * ── WHY curl INSISTED THE HOST WAS FINE ───────────────────────────────────
 *
 * This is why it looked like an app bug for as long as it did. On Windows curl
 * is built against Schannel, which chases the AIA extension to fetch a missing
 * intermediate and quietly auto-updates its roots; it answered 200 in 43ms
 * throughout the outage. Node's TLS does NEITHER. "The database is up" and
 * "the app can read the database" were two different facts, and only the
 * second one was load-bearing.
 *
 *     DIAGNOSING THE NEXT ONE: do not conclude anything from curl. Use
 *       node -e "fetch(URL).catch(e => console.log(e.cause))"
 *     which fails the way the app fails.
 *
 * ── WHY THE FIX IS TWO CERTIFICATES AND NOT AN EXEMPTION ──────────────────
 *
 * The tempting one-liner is NODE_TLS_REJECT_UNAUTHORIZED=0, and it would turn
 * a household's bank balances into something any network between here and
 * Singapore is free to read and rewrite. Not a trade worth making, ever.
 *
 * The honest fix is to hand Node the two links the server omits. Neither is a
 * new trust decision: yr.i.lencr.org publishes Root YR CROSS-SIGNED BY ISRG
 * ROOT X1, which is already in Node's bundle — so the completed path ends at a
 * root Node trusted before this file existed. Verified with node:crypto rather
 * than assumed:
 *
 *     Root YR signed by Node-bundled ISRG Root X1 : true
 *     YR2     signed by Root YR                   : true
 *
 * SHA-256 fingerprints, so a later reader can confirm these are what they say:
 *   ISRG Root YR (cross-signed by ISRG Root X1)
 *     07:26:39:D0:B1:40:D5:BF:FA:E1:6A:D9:C3:F6:CC:
 *     60:86:04:06:21:F5:1E:E6:1A:6D:46:A8:91:5C:07:CF:76
 *   Let's Encrypt YR2
 *     23:8B:85:A0:09:9C:65:B9:70:47:7D:57:24:F1:A1:D4:
 *     75:CE:50:58:CF:FE:4E:FA:87:33:89:9B:DB:86:3C:47
 *
 * ── WHY IN THE REPO AND NOT IN AN ENV VAR ─────────────────────────────────
 *
 * NODE_EXTRA_CA_CERTS would also work, and would have to be set correctly on
 * BOTH origins — the Windows laptop that serves most reads, and the DOM Cloud
 * box — plus on every future host, or the site half-works in a way nobody
 * notices until a tab is blank again. Certificates are public documents and
 * cost a few KB; shipping them means the fix travels with the code that needs
 * it.
 *
 * ── WHEN TO DELETE THIS FILE ──────────────────────────────────────────────
 *
 * The moment DOM Cloud serves its own intermediate this becomes dead weight
 * that does no harm. Check with:
 *
 *     echo | openssl s_client -connect honeymoney-pb.domcloud.dev:443 \
 *       -servername honeymoney-pb.domcloud.dev 2>/dev/null | grep "^ [0-9] s:"
 *
 * Two or more lines means the chain is complete and this file can go. The
 * cross-sign expires 2032-09-02 and YR2 in 2028 — both long after that.
 */

// Let's Encrypt YR2 — the intermediate honeymoney-pb.domcloud.dev omits.
const LE_YR2 = `
-----BEGIN CERTIFICATE-----
MIIE2jCCAsKgAwIBAgIQTr0klH4k05SALYSlL9WzGTANBgkqhkiG9w0BAQsFADAu
MQswCQYDVQQGEwJVUzENMAsGA1UEChMESVNSRzEQMA4GA1UEAxMHUm9vdCBZUjAe
Fw0yNTA5MDMwMDAwMDBaFw0yODA5MDIyMzU5NTlaMDMxCzAJBgNVBAYTAlVTMRYw
FAYDVQQKEw1MZXQncyBFbmNyeXB0MQwwCgYDVQQDEwNZUjIwggEiMA0GCSqGSIb3
DQEBAQUAA4IBDwAwggEKAoIBAQDZ0LxwBppqh84luqMerV/eeL/fXQ7mLQQv1Lnp
WKZbyvGpx6wh6AfnslAnF6ewTkcHA+gSOoBvm3Dfm06AuGiF+KRut4fAcowqnAQQ
CW98+QPP/eOv/wug7Iyk4NkOxf2I6g2f55T6nJoOTLFcukeRq80JGQEYan+dPFr9
OGUgQK2hGKgNkW87pappsOAuUJcroYhRt5uUis4qaZireiseu32gzDJNBAiKtsvd
6HX4v25bpkRNcS/B/Gtc9kVbUpD+2PLPxdei3Tim55k4tfAEXwD2qyiPTxrTNq6l
N+AMr5g2c1dNqkOTwjxeV6L5lpP1rGiYvLnRaPlOqyZRPW+5AgMBAAGjge4wgesw
DgYDVR0PAQH/BAQDAgGGMBMGA1UdJQQMMAoGCCsGAQUFBwMBMBIGA1UdEwEB/wQI
MAYBAf8CAQAwHQYDVR0OBBYEFEAVLSZ57TIgnt+ach3WMh+BDIEMMB8GA1UdIwQY
MBaAFN7nW2DQIm1AKH0/DQH+pLVStFGUMDIGCCsGAQUFBwEBBCYwJDAiBggrBgEF
BQcwAoYWaHR0cDovL3lyLmkubGVuY3Iub3JnLzATBgNVHSAEDDAKMAgGBmeBDAEC
ATAnBgNVHR8EIDAeMBygGqAYhhZodHRwOi8veXIuYy5sZW5jci5vcmcvMA0GCSqG
SIb3DQEBCwUAA4ICAQB0ZUQWZ9/Yn9COEpo+JfecMnB0h0vwDm/M66IqXqw3LoaL
mx9lZvRTeDIS67PUeI3yCA2W6PKRD0/FE/G57lOmS+Xy5AaaL00ICGOqjNcCaMWW
8o8nevHOd4i4lqgtznE/28QwlcdJyF8yBiWHpnyjhEpmNWJURgOCOg2xpwRMBCsj
MScqYPtOhBeuYQvSwAEeTML2Ukh6uGuX4E14q65Ja8cdjF5bAldnP1eE4FBaAwsZ
G2fOqqrKV03Y85Nw2btedP1AtliQuJZs/Jo/gXxXdc7LrH3McgnpnbTiAncX7yES
hP6kzQejllqMCIt52HOjxDGWafS7Xw+DKwqmH+Eqy8dcbOuag/1AYlQoKNVK3F5q
Hh6tEDiMqQcLIibGKteE6iHo4A/bIScbzrhXUYuism42ZYzmc48FMVIH3qy4L84E
TdAH2gtxw0PAhvRVXp8HP7wfngpzsN/8xOTpeRSbM4+Qbc56G6+Bifmv6sk1ieQb
NA3wJdl4DDUuQSV8hBgx6zoI1ZSGORprDFux7c6rhc77QZMSRrEgomBeklervEve
86ylWmZ3WWHV6RLMi8xNvjd71r4EPIGgY7BZU/VPBkq+uA7Gb6mbJnFgV43uh3xy
LRFgxIAphIukwTGSMZZR+AI+Qnp0BYTWovHXozOf3H8r6hozEoT02JHn0AeTfA==
-----END CERTIFICATE-----
`;

// ISRG Root YR, cross-signed by ISRG Root X1. This is the link that lets the
// path terminate inside Node's own bundle instead of in a root we had to add.
const ISRG_ROOT_YR_CROSS_SIGNED = `
-----BEGIN CERTIFICATE-----
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
-----END CERTIFICATE-----
`;

/**
 * `tls.getCACertificates` / `tls.setDefaultCACertificates` landed in Node 22.15
 * and this repo is on `@types/node@^20`, which has never heard of them. Both
 * origins run 22.21 and 24.19, so the functions are there at runtime; only the
 * types are behind.
 *
 * Declared here rather than by bumping @types/node, because that bump is a
 * whole-project change with its own fallout and this is an outage fix. Both
 * members stay OPTIONAL, which is not ceremony — it is the same uncertainty the
 * runtime check below acts on, kept honest in the type.
 */
type CACertificateApi = {
  getCACertificates?: (type?: "default" | "system" | "bundled" | "extra") => string[];
  setDefaultCACertificates?: (certs: ReadonlyArray<string | Uint8Array>) => void;
};
const tlsCa = tls as typeof tls & CACertificateApi;

let installed = false;

/**
 * Extend this process's default CA set with the two certificates above.
 *
 * Idempotent, and deliberately incapable of taking the app down: if the
 * runtime has no tls.setDefaultCACertificates (added in Node 22.15 — both
 * origins are past it, a future one might not be) or rejects the PEMs, we log
 * and leave the default set alone. What follows is then the ordinary "ledger
 * unreachable" screen, which every page now renders properly, rather than a
 * throw at import time that would take down routes never touching PocketBase.
 */
export function installLedgerCertificateChain(): void {
  if (installed) return;
  installed = true;

  const setDefault = tlsCa.setDefaultCACertificates;
  const getCurrent = tlsCa.getCACertificates;
  if (typeof setDefault !== "function" || typeof getCurrent !== "function") return;

  try {
    setDefault([
      ...getCurrent(),
      LE_YR2,
      ISRG_ROOT_YR_CROSS_SIGNED,
    ]);
  } catch (err) {
    console.error(
      "[tlsChain] could not install the Let's Encrypt YR chain; TLS to PocketBase may fail:",
      err,
    );
  }
}
