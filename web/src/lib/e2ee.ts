// End-to-end encryption — the envelope, and the only place a key is derived.
//
// ── WHAT THIS IS FOR ───────────────────────────────────────────────────────
//
// HoneyMoney is sold as software, not as a place to keep your money records.
// The distinction is only worth anything if it is enforced somewhere, and this
// is where: a household's backup is sealed ON THE DEVICE with a key derived
// from a passphrase the device never sends. What reaches the server — and
// therefore what reaches a subpoena, a misconfigured bucket, a future owner of
// the company, or an employee with database access — is ciphertext and a salt.
//
// "We don't look at your data" is a promise. This is a property.
//
// ── THE THREAT MODEL, STATED PLAINLY ───────────────────────────────────────
//
// Defends against: the operator (us), the host, the backup bucket, anyone who
// obtains the database, and anyone who intercepts the upload. None of them hold
// the passphrase, and none of the material we store is enough to derive it.
//
// Does NOT defend against: a compromised browser or device — the plaintext
// exists there by necessity while you are sealing it — nor against a weak
// passphrase, which is why `passphraseStrength` gates the UI rather than
// decorating it. And it is not an amnesty for the live app: the app's own
// database still holds household records in the clear so the server can compute
// an H-Score. docs/ZERO_KNOWLEDGE.md draws that line exactly; this file is one
// side of it.
//
// ── THE TRAP AN ENCRYPTED BACKUP MUST NOT BECOME ───────────────────────────
//
// deploy/backup-vault.mjs already says it about the operator's own backups and
// it is truer here, where the user holds the only key: **an encrypted backup
// you cannot decrypt is not a backup, it is a tidy way to lose everything.**
// So every seal is verified by opening it again before it is offered to the
// user, in `sealVerified` — never on the assumption that decryption would have
// worked. Losing the passphrase is unrecoverable BY DESIGN, and the UI has to
// say so in those words.

export const VAULT_FORMAT = "honeymoney.vault.v1";

/**
 * PBKDF2, not Argon2id.
 *
 * Argon2id is the better KDF and it is not in WebCrypto, so shipping it means
 * shipping a WASM blob to the one screen whose entire claim is "nothing here
 * needs to be trusted". PBKDF2-HMAC-SHA256 is native, auditable from the
 * browser's own devtools, and at 600,000 iterations meets the current OWASP
 * floor. The iteration count travels INSIDE the envelope, so raising it later
 * does not strand a single existing backup.
 */
export const KDF_NAME = "PBKDF2-HMAC-SHA256";
export const KDF_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12; // 96 bits, the size AES-GCM is specified for

export interface SealedVault {
  format: typeof VAULT_FORMAT;
  cipher: "AES-256-GCM";
  kdf: { name: string; iterations: number; salt: string };
  /** "gzip" when the plaintext was compressed before sealing, else "none". */
  z: "gzip" | "none";
  iv: string;
  ct: string;
  sealedAt: string;
}

/** Thrown when the passphrase is wrong — which is indistinguishable from tampering, and should be. */
export class WrongPassphrase extends Error {
  constructor() {
    super("That passphrase does not open this backup.");
    this.name = "WrongPassphrase";
  }
}

// ── base64, without a dependency and without Buffer ────────────────────────
//
// btoa/atob exist in every browser and in Node 18+, so the same code runs in
// the page and in scripts/check-vault.mts. Chunked, because a 6 MB backup
// applied through String.fromCharCode(...bytes) in one call overflows the
// argument stack and fails only on large households — the ones with most to
// lose.

export function toB64(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(out);
}

export function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

// ── compression ────────────────────────────────────────────────────────────
//
// A household export is JSON, and JSON of repeated record shapes compresses by
// roughly 8:1. Worth doing BEFORE the cipher (afterwards there is nothing left
// to compress) and worth doing natively: CompressionStream ships in every
// current browser and in Node. Where it does not exist the envelope says
// "none" and everything still works — the format carries the answer rather than
// the reader having to guess.

async function gzip(bytes: Uint8Array): Promise<{ bytes: Uint8Array; z: "gzip" | "none" }> {
  if (typeof CompressionStream === "undefined") return { bytes, z: "none" };
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
  return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), z: "gzip" };
}

async function gunzip(bytes: Uint8Array, z: "gzip" | "none"): Promise<Uint8Array> {
  if (z !== "gzip") return bytes;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ── the key, and the header it is bound to ─────────────────────────────────

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", utf8.encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * The envelope's own parameters, fed to AES-GCM as additional authenticated
 * data.
 *
 * Without this the header is unprotected: an attacker who can edit the stored
 * row can drop `iterations` from 600,000 to 1 and hand the file back, and a
 * client that trusts the envelope will happily derive the weakened key itself.
 * Bound as AAD, any such edit makes the tag fail and the backup refuses to open
 * — which is the correct outcome, because it is no longer the backup that was
 * sealed.
 */
function header(v: Omit<SealedVault, "ct">): Uint8Array {
  return utf8.encode(
    [v.format, v.cipher, v.kdf.name, v.kdf.iterations, v.kdf.salt, v.z, v.iv, v.sealedAt].join("|"),
  );
}

// ── seal / open ────────────────────────────────────────────────────────────

export async function seal(
  plaintext: string,
  passphrase: string,
  opts: { now?: Date } = {},
): Promise<SealedVault> {
  if (!passphrase) throw new Error("A passphrase is required.");
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const { bytes, z } = await gzip(utf8.encode(plaintext));

  const meta: Omit<SealedVault, "ct"> = {
    format: VAULT_FORMAT,
    cipher: "AES-256-GCM",
    kdf: { name: KDF_NAME, iterations: KDF_ITERATIONS, salt: toB64(salt) },
    z,
    iv: toB64(iv),
    sealedAt: (opts.now ?? new Date()).toISOString(),
  };

  const key = await deriveKey(passphrase, salt, KDF_ITERATIONS);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: header(meta) as BufferSource },
    key,
    bytes as BufferSource,
  );
  return { ...meta, ct: toB64(new Uint8Array(ct)) };
}

export async function open(vault: SealedVault, passphrase: string): Promise<string> {
  if (!isSealedVault(vault)) throw new Error("That file is not a HoneyMoney backup.");
  const salt = fromB64(vault.kdf.salt);
  const iv = fromB64(vault.iv);
  const key = await deriveKey(passphrase, salt, vault.kdf.iterations);
  // The header is every field EXCEPT the ciphertext, which is what it protects.
  const meta: Omit<SealedVault, "ct"> = {
    format: vault.format,
    cipher: vault.cipher,
    kdf: vault.kdf,
    z: vault.z,
    iv: vault.iv,
    sealedAt: vault.sealedAt,
  };
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource, additionalData: header(meta) as BufferSource },
      key,
      fromB64(vault.ct) as BufferSource,
    );
  } catch {
    // AES-GCM cannot tell "wrong key" from "edited ciphertext", and neither can
    // we. Saying so honestly is also the right security answer: a message that
    // distinguished them would be an oracle.
    throw new WrongPassphrase();
  }
  return fromUtf8.decode(await gunzip(new Uint8Array(plain), vault.z));
}

/**
 * Seal, then immediately open what was sealed.
 *
 * The rule deploy/backup-vault.mjs learned first: a backup is never shipped on
 * the assumption that decryption would have worked. The cost is one extra
 * key derivation on the user's own device; the alternative is discovering the
 * problem on the day they need the file.
 */
export async function sealVerified(plaintext: string, passphrase: string): Promise<SealedVault> {
  const vault = await seal(plaintext, passphrase);
  const roundTrip = await open(vault, passphrase);
  if (roundTrip !== plaintext) {
    throw new Error("The backup did not survive its own round trip and was not saved.");
  }
  return vault;
}

// ── shape and opacity ──────────────────────────────────────────────────────

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function isSealedVault(x: unknown): x is SealedVault {
  if (!x || typeof x !== "object") return false;
  const v = x as Record<string, unknown>;
  const kdf = v.kdf as Record<string, unknown> | undefined;
  return (
    v.format === VAULT_FORMAT &&
    v.cipher === "AES-256-GCM" &&
    (v.z === "gzip" || v.z === "none") &&
    typeof v.iv === "string" &&
    B64.test(v.iv) &&
    typeof v.ct === "string" &&
    B64.test(v.ct) &&
    typeof v.sealedAt === "string" &&
    !!kdf &&
    typeof kdf.name === "string" &&
    typeof kdf.iterations === "number" &&
    kdf.iterations >= 100_000 &&
    typeof kdf.salt === "string" &&
    B64.test(kdf.salt as string)
  );
}

/**
 * Does this actually look like ciphertext?
 *
 * The server's last line of defence, and the reason it is statistical rather
 * than a substring search: a bug that posts the plaintext export into the
 * backup field would produce a perfectly well-formed envelope, and the shape
 * check above would pass it. AES-GCM output is indistinguishable from random —
 * ~7.99 bits of entropy per byte, ~37% of bytes landing in printable ASCII.
 * JSON is around 4.5 bits and ~100% printable. Nothing in between is close.
 *
 * A naive "no long ASCII runs" test would be wrong in the other direction:
 * across a megabyte of genuinely random bytes, runs of eight printable
 * characters occur hundreds of times, so it would reject real ciphertext.
 */
export function looksEncrypted(bytes: Uint8Array): boolean {
  if (bytes.length < 64) return true; // too short to measure; the shape check stands alone
  const counts = new Uint32Array(256);
  let printable = 0;
  for (const b of bytes) {
    counts[b]++;
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127)) printable++;
  }
  let entropy = 0;
  for (const c of counts) {
    if (!c) continue;
    const p = c / bytes.length;
    entropy -= p * Math.log2(p);
  }
  return entropy >= 6 && printable / bytes.length <= 0.75;
}

// ── passphrase strength ────────────────────────────────────────────────────

/**
 * Enough entropy to be worth 600,000 PBKDF2 iterations.
 *
 * Deliberately NOT a character-class rule ("one capital, one symbol"): those
 * push people towards Passw0rd! — memorable to a cracking dictionary and to
 * nobody else. Length is what defeats an offline attack on a file the attacker
 * already holds, so length is what is measured, with a small credit for variety
 * and a hard floor no wording can talk the user past.
 */
export function passphraseStrength(p: string): { bits: number; ok: boolean; level: "weak" | "fair" | "strong" } {
  const classes =
    (/[a-z]/.test(p) ? 26 : 0) +
    (/[A-Z]/.test(p) ? 26 : 0) +
    (/[0-9]/.test(p) ? 10 : 0) +
    (/[^A-Za-z0-9]/.test(p) ? 33 : 0);
  const words = p.trim().split(/\s+/).filter(Boolean).length;
  // Whichever model is kinder to the user: four words beats eight symbols, and
  // a passphrase should not be punished for being sayable.
  const bits = Math.max(
    classes > 1 ? Math.round(p.length * Math.log2(classes)) : p.length * 4,
    words >= 3 ? words * 12 : 0,
  );
  const level = bits >= 80 ? "strong" : bits >= 60 ? "fair" : "weak";
  return { bits, ok: bits >= 60 && p.length >= 12, level };
}
