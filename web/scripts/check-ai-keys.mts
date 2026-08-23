// Does the household AI-key encryption actually protect anything?
//
//   npm run check:aikeys
//
// This exists because "the key is encrypted" is the single claim that makes it
// acceptable to store a live third-party credential next to a family's ledger.
// An untested claim of that kind is worth nothing, and the failure mode is
// invisible: everything works, right up until a backup leaks.
//
// Five things are measured, and each is written so it FAILS against the wrong
// implementation rather than passing vacuously:
//
//   1. A key survives the round trip. The weakest check, and the only one a
//      broken implementation is likely to pass.
//   2. The ciphertext does not contain the key. A "cipher" that base64-encodes
//      would pass (1) and fail here, which is the point.
//   3. A tampered ciphertext REFUSES to open. This is why GCM and not CBC: CBC
//      would hand back garbage that then gets sent to a provider as a key.
//   4. A different master key cannot open it. Proves the key is load-bearing
//      rather than decorative.
//   5. A malformed AI_SECRETS_KEY is rejected, not stretched to fit. A silently
//      padded key is one whose strength nobody can reason about.
//
// Exits non-zero on any finding, so it can gate a release like check:nav.

import { randomBytes } from "node:crypto";

let failures = 0;
function say(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
}

// The module reads AI_SECRETS_KEY at call time, so set it before importing.
const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");
process.env.AI_SECRETS_KEY = KEY_A;

const { __crypto, isSecretsKeyConfigured } = await import("../src/lib/aiKeys.ts");
const { encrypt, decrypt } = __crypto;

// A realistic secret: long, high-entropy, with the prefix a real Groq key has.
const SECRET = "gsk_" + randomBytes(24).toString("base64url");

console.log("AI key encryption\n");

// 1 — round trip
let blob = "";
try {
  blob = encrypt(SECRET);
  say("round trip returns the original key", decrypt(blob) === SECRET);
} catch (e) {
  say("round trip returns the original key", false, String(e));
}

// 2 — the ciphertext must not carry the plaintext, in any obvious encoding
const encodings = [
  SECRET,
  Buffer.from(SECRET).toString("base64"),
  Buffer.from(SECRET).toString("base64url"),
  Buffer.from(SECRET).toString("hex"),
];
say(
  "ciphertext does not contain the key",
  !encodings.some((e) => blob.includes(e)),
  `blob=${blob.slice(0, 24)}…`,
);

// 3 — tampering is detected rather than decrypted
{
  const parts = blob.split(".");
  const ct = Buffer.from(parts[3], "base64url");
  ct[0] = ct[0] ^ 0xff; // flip a byte of ciphertext
  const tampered = [parts[0], parts[1], parts[2], ct.toString("base64url")].join(".");
  let threw = false;
  try {
    decrypt(tampered);
  } catch {
    threw = true;
  }
  say("a tampered ciphertext refuses to open", threw);
}

// 4 — a different master key must not open it
{
  process.env.AI_SECRETS_KEY = KEY_B;
  let threw = false;
  try {
    decrypt(blob);
  } catch {
    threw = true;
  }
  say("a different AI_SECRETS_KEY cannot open it", threw);
  process.env.AI_SECRETS_KEY = KEY_A;
}

// 5 — a malformed master key is rejected, not padded
{
  const bad: [string, string][] = [
    ["too short", Buffer.from("short").toString("base64")],
    ["empty", ""],
    ["not 32 bytes of hex", "abcdef"],
  ];
  for (const [label, value] of bad) {
    process.env.AI_SECRETS_KEY = value;
    let threw = false;
    try {
      encrypt(SECRET);
    } catch {
      threw = true;
    }
    say(`malformed AI_SECRETS_KEY rejected (${label})`, threw);
  }
  process.env.AI_SECRETS_KEY = "";
  say("missing AI_SECRETS_KEY reports unconfigured", isSecretsKeyConfigured() === false);
  process.env.AI_SECRETS_KEY = KEY_A;
  say("valid AI_SECRETS_KEY reports configured", isSecretsKeyConfigured() === true);
}

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} finding(s).`}`);
process.exit(failures === 0 ? 0 : 1);
