// Per-household AI credentials — stored encrypted, read only at call time.
//
// The objection this module answers: a household needs its own AI key for Ask
// Honey to work without the server owner, but a key is a live billable
// credential sitting next to a family's financial records, and it ends up in
// every backup zip. PocketBase's settings encryption does not cover collection
// fields, so "just put it in a text column" means plaintext at rest.
//
// So the app encrypts before PocketBase ever sees the value, with AES-256-GCM
// under AI_SECRETS_KEY. GCM and not CBC because it authenticates: a tampered
// ciphertext fails to open rather than decrypting to garbage that then gets
// sent to a provider as if it were a key.
//
// ⚠️ If AI_SECRETS_KEY is not set, this module REFUSES TO STORE anything. It
// does not quietly fall back to plaintext. A missing key is a setup step; a
// silent plaintext fallback is a breach that nobody finds until the backup
// leaks — and the fallback would be invisible precisely because everything
// would appear to work.

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { config, type AiProvider } from "./config";
import { pbCreate, pbDelete, pbFirst, pbStr, pbUpdate } from "./pocketbase";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits, the size GCM is specified for

export interface TenantAiCreds {
  provider: AiProvider;
  apiKey?: string;
  url?: string;
  model?: string;
}

export interface TenantAiKeyInfo {
  provider: AiProvider;
  last4: string;
  model: string;
  url: string;
  updated: string;
}

interface KeyRow {
  id: string;
  tenant: string;
  provider: string;
  model: string;
  url: string;
  key_cipher: string;
  key_last4: string;
  updated: string;
}

// ── The master key ──────────────────────────────────────────────────────────

export class SecretsKeyMissing extends Error {
  constructor() {
    super(
      "AI_SECRETS_KEY is not set, so a household AI key cannot be stored encrypted. " +
        "Generate one with:  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
}

// Accepts base64 or hex, because both are what people actually paste. Anything
// that does not decode to exactly 32 bytes is rejected loudly rather than
// stretched or truncated to fit — a key that is silently padded is a key whose
// strength nobody can reason about.
function masterKey(): Buffer {
  const raw = (process.env.AI_SECRETS_KEY ?? "").trim();
  if (!raw) throw new SecretsKeyMissing();

  let buf: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    buf = Buffer.from(raw, "hex");
  } else {
    buf = Buffer.from(raw, "base64");
  }
  if (buf.length !== 32) {
    throw new Error(
      `AI_SECRETS_KEY must decode to 32 bytes (got ${buf.length}). Use 32 random bytes as base64 or 64 hex characters.`,
    );
  }
  return buf;
}

export function isSecretsKeyConfigured(): boolean {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
}

// ── Encrypt / decrypt ───────────────────────────────────────────────────────
// Wire format: v1.<iv>.<tag>.<ciphertext>, all base64url. The version prefix is
// cheap now and is the only thing that makes a future algorithm change
// migratable rather than a flag day.

function encrypt(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

function decrypt(blob: string): string {
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Unrecognised ciphertext format.");
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(ALGO, masterKey(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
}

// Exported for the round-trip check in scripts/check-ai-keys.mts. Proving the
// pair works on real input beats trusting that it must.
export const __crypto = { encrypt, decrypt };

// ── Read ────────────────────────────────────────────────────────────────────

async function row(tenantId: string): Promise<KeyRow | null> {
  if (!tenantId) return null;
  return pbFirst<KeyRow>("tenant_ai_keys", `tenant = ${pbStr(tenantId)}`);
}

// What the UI may see. Never decrypts — showing a key back to a browser is not
// a feature, and the last four characters are enough to answer "is the key I
// think is here the one that is here?".
export async function getTenantAiKeyInfo(tenantId: string): Promise<TenantAiKeyInfo | null> {
  const r = await row(tenantId).catch(() => null);
  if (!r) return null;
  return {
    provider: (r.provider as AiProvider) || "gemini",
    last4: r.key_last4 || "",
    model: r.model || "",
    url: r.url || "",
    updated: r.updated || "",
  };
}

// What an AI call may see. Returns null — never throws — when the household has
// no key, when AI_SECRETS_KEY is absent, or when the ciphertext will not open:
// every one of those means "fall back to the server's own engine", and an
// exception here would take down Ask Honey for a household whose stored key
// merely became unreadable after a host move.
export async function getTenantAiCreds(tenantId: string): Promise<TenantAiCreds | null> {
  const r = await row(tenantId).catch(() => null);
  if (!r) return null;
  const provider = (r.provider as AiProvider) || "gemini";

  // Ollama carries a URL and no secret, so it needs no master key to be usable.
  if (provider === "ollama") {
    if (!r.url) return null;
    return { provider, url: r.url.replace(/\/$/, ""), model: r.model || undefined };
  }

  if (!r.key_cipher) return null;
  try {
    return { provider, apiKey: decrypt(r.key_cipher), model: r.model || undefined };
  } catch {
    return null;
  }
}

// ── Write ───────────────────────────────────────────────────────────────────

export async function setTenantAiKey(
  tenantId: string,
  input: { provider: AiProvider; apiKey?: string; url?: string; model?: string },
): Promise<TenantAiKeyInfo> {
  const { provider } = input;
  const model = (input.model ?? "").trim();
  const url = (input.url ?? "").trim().replace(/\/$/, "");
  const apiKey = (input.apiKey ?? "").trim();

  if (provider === "ollama") {
    if (!url) throw new Error("Ollama needs a URL, e.g. http://localhost:11434");
  } else if (!apiKey) {
    throw new Error("An API key is required for this engine.");
  }

  // masterKey() throws SecretsKeyMissing here rather than at the end, so a
  // misconfigured server fails before anything is written.
  const key_cipher = provider === "ollama" ? "" : encrypt(apiKey);
  const key_last4 = provider === "ollama" ? "" : apiKey.slice(-4);

  const existing = await row(tenantId).catch(() => null);
  const data = { tenant: tenantId, provider, model, url, key_cipher, key_last4 };
  if (existing) await pbUpdate("tenant_ai_keys", existing.id, data);
  else await pbCreate("tenant_ai_keys", data);

  return { provider, last4: key_last4, model, url, updated: new Date().toISOString() };
}

export async function clearTenantAiKey(tenantId: string): Promise<boolean> {
  const existing = await row(tenantId).catch(() => null);
  if (!existing) return false;
  await pbDelete("tenant_ai_keys", existing.id);
  return true;
}

// ── Resolution ──────────────────────────────────────────────────────────────

// The household's own key wins over the server's environment. That ordering is
// the point of the feature: a self-hosted owner keeps working with no key
// stored, and a household that supplies one stops depending on them.
export async function resolveAiCreds(tenantId: string | null | undefined): Promise<TenantAiCreds | null> {
  if (!tenantId) return null;
  return getTenantAiCreds(tenantId);
}

// Whether the server itself has any engine configured, used to tell a household
// "you must supply a key" apart from "you may".
export function serverHasEngine(): boolean {
  return Boolean(config.geminiApiKey || config.groqApiKey || config.ollamaUrl);
}

// Constant-time compare, used by the purge-style guards elsewhere. Kept here so
// nothing in this module reaches for `===` on a secret by habit.
export function secretEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
