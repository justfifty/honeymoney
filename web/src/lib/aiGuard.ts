// The boundary every AI call crosses, and the two questions asked at it.
//
//   1. May this household's data be processed by a model at all?  → consent
//   2. May THIS data reach THAT provider?                          → data class
//
// Both were previously answered by nobody. `hasConsent()` existed in
// lib/consent.ts and had no callers anywhere in the application: signup wrote
// the answer, the settings screen rendered it, the append-only ledger stored it,
// and every AI call site ignored it. A consent you record and do not honour is
// worse than one you never asked for — the ledger is documentary evidence that
// you identified AI as a purpose requiring consent and then processed anyway.
//
// The second question had no answer either. lib/ai.ts routes on AI_PROVIDER
// alone, so a receipt image and a placeholder-only phrasing prompt took the same
// path to the same cloud endpoint. They are not the same thing and must not.

import { hasConsent } from "./consent";
import { isProviderConfigured, activeAiProvider, type AiProvider } from "./config";

// ── data classes ────────────────────────────────────────────────────────────
//
// The class describes WHAT IS IN THE PAYLOAD, not how sensitive the feature
// feels. Getting this wrong in the permissive direction is silent, so when a
// call site is ambiguous it is class 2.

export type DataClass =
  /** Nothing from any household. Health probes, static prompts. */
  | 0
  /** Derived and de-identified: intent enums, placeholder NAMES, ordinals.
   *  No figures, no user-authored text, no identifiers. See toWire(). */
  | 1
  /** Household data: figures, user-authored labels, notes, vendor strings,
   *  receipt and statement documents. */
  | 2;

export const CLASS_LABEL: Record<DataClass, string> = {
  0: "no household data",
  1: "de-identified",
  2: "household data",
};

/** Providers that run on hardware the household or operator controls. */
export function isLocalProvider(p: AiProvider): boolean {
  return p === "ollama";
}

/**
 * The strictest class permitted to leave for a cloud provider.
 *
 * Default 2 preserves today's behaviour, because tightening it to 1 without a
 * local provider provisioned would stop statement import working rather than
 * make it private — a change that reads as a bug and gets reverted. Set
 * AI_CLOUD_MAX_CLASS=1 once Ollama is running to make the strict posture
 * structural. That single environment variable is the difference between "we
 * intend not to send household data to a cloud model" and "we cannot".
 */
export function cloudMaxClass(): DataClass {
  const raw = Number(process.env.AI_CLOUD_MAX_CLASS);
  return raw === 0 || raw === 1 ? (raw as DataClass) : 2;
}

export class DataClassRefused extends Error {
  constructor(cls: DataClass, provider: AiProvider) {
    super(
      `Refused: ${CLASS_LABEL[cls]} (class ${cls}) may not be sent to ${provider}, ` +
        `which is a cloud provider, while AI_CLOUD_MAX_CLASS=${cloudMaxClass()}. ` +
        `Configure OLLAMA_URL to process this locally.`,
    );
    this.name = "DataClassRefused";
  }
}

export class AiConsentMissing extends Error {
  constructor() {
    super(
      "This household has not consented to AI processing. " +
        "Turn it on under Settings → Privacy, or use the deterministic path.",
    );
    this.name = "AiConsentMissing";
  }
}

/**
 * Which provider should carry a payload of this class.
 *
 * Class 2 PREFERS a local provider whenever one is configured, even when
 * AI_PROVIDER names a cloud engine. Preference rather than prohibition is
 * deliberate: it means provisioning Ollama is what achieves the private
 * posture, rather than an environment variable somebody has to remember to
 * set. Nothing breaks for a household that has not provisioned one; their
 * traffic simply keeps going where it already went, and the egress ledger
 * records that it did.
 */
export function providerForClass(cls: DataClass, requested?: AiProvider): AiProvider {
  const want = requested ?? activeAiProvider();
  if (cls < 2) return want;
  if (isLocalProvider(want)) return want;
  return isProviderConfigured("ollama") ? "ollama" : want;
}

/** Throws unless a payload of this class may go to this provider. */
export function assertClassAllowed(cls: DataClass, provider: AiProvider): void {
  if (isLocalProvider(provider)) return; // never leaves the machine
  if (cls > cloudMaxClass()) throw new DataClassRefused(cls, provider);
}

// ── consent ─────────────────────────────────────────────────────────────────

/**
 * Has this user agreed to AI processing?
 *
 * Fails CLOSED. A PocketBase read that throws returns false rather than
 * defaulting to permitted, because the failure mode of the alternative is
 * processing without consent during exactly the incident you are least able to
 * notice it. Every caller has a correct non-AI path to fall back to; none of
 * them needs this to be optimistic.
 *
 * `null` userId — an unauthenticated visitor on the public demo — is treated as
 * consented, because the demo personas are fictional and there is no data
 * subject whose consent could be missing.
 */
export async function aiConsentGiven(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return true;
  try {
    return await hasConsent(userId, "ai_processing");
  } catch {
    return false;
  }
}

/** The same check, as a guard. Use where the caller has no graceful fallback. */
export async function requireAiConsent(userId: string | null | undefined): Promise<void> {
  if (!(await aiConsentGiven(userId))) throw new AiConsentMissing();
}
