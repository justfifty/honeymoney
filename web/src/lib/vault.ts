// The sealed vault — server side.
//
// This module's whole job is to accept something it cannot read, store it, and
// hand it back. It is written to be boring, and the interesting part is what it
// refuses.
//
// ── THE TRIPWIRE ───────────────────────────────────────────────────────────
//
// `assertOpaque` is not defence against a hostile client — a hostile client can
// post whatever it likes into a field we promise not to read, and no server
// check changes that. It is defence against US: a refactor that reorders two
// awaits, a "temporary" debug path, a future contributor who wires the export
// straight to the backup endpoint because it is one call shorter. Every one of
// those ships a build where the plaintext household export lands in the
// database under a column called `envelope`, and nothing else in the system
// would notice.
//
// The claim on the landing page is "we cannot read your backups". A claim that
// only holds while nobody makes a mistake is a marketing line. This makes the
// mistake fail loudly, at the boundary, with the row unwritten.

import { pbCreate, pbDelete, pbFirst, pbList, pbStr } from "./pocketbase";
import { fromB64, isSealedVault, looksEncrypted, VAULT_FORMAT, type SealedVault } from "./e2ee";

/** Base64 inflates by a third, so this is roughly a 4 MB household export. */
export const MAX_ENVELOPE_BYTES = 6 * 1024 * 1024;
/** Copies kept per user; the oldest beyond this is removed when a new one lands. */
export const KEEP_PER_USER = 5;

export interface VaultRow {
  id: string;
  tenant: string;
  user: string;
  label: string;
  format: string;
  envelope: string;
  bytes: number;
  sealed_at: string;
  created: string;
}

/** What the UI lists: everything except the ciphertext itself. */
export interface VaultSummary {
  id: string;
  label: string;
  bytes: number;
  sealedAt: string;
}

const summarise = (r: VaultRow): VaultSummary => ({
  id: r.id,
  label: r.label ?? "",
  bytes: Number(r.bytes) || 0,
  sealedAt: r.sealed_at || r.created,
});

/**
 * The collection has not been installed on this PocketBase yet.
 *
 * Worth its own error because the raw one — `PocketBase 404 on
 * /api/collections/vaults/records` — reads like the user's backup is missing
 * rather than like the table is. Production runs a different PocketBase from
 * the migrations directory in this repo, so this is a state a deploy can
 * genuinely be in, and the message says what to run.
 */
export class VaultNotInstalled extends Error {
  constructor() {
    super("Sealed backups are not switched on for this deployment yet (npm run vault:install -- --apply).");
    this.name = "VaultNotInstalled";
  }
}

const missingCollection = (err: unknown) =>
  err instanceof Error && /404/.test(err.message) && /collections\/vaults/.test(err.message);

export class NotSealed extends Error {
  constructor(reason: string) {
    super(`Refusing to store this: ${reason}`);
    this.name = "NotSealed";
  }
}

/**
 * Prove, before writing, that what arrived is sealed.
 *
 * Three questions, in ascending order of what they cost to answer and
 * descending order of how likely they are to catch the realistic mistake:
 *
 *   1. Is it the envelope shape at all?
 *   2. Is it within the size we accept?
 *   3. Does the ciphertext actually look like ciphertext? — the one that
 *      catches a correctly-shaped envelope with the plaintext pasted into `ct`,
 *      which is exactly what a wiring bug produces.
 */
export function assertOpaque(payload: unknown): SealedVault {
  if (!isSealedVault(payload)) {
    throw new NotSealed("it is not a sealed HoneyMoney envelope");
  }
  const json = JSON.stringify(payload);
  if (json.length > MAX_ENVELOPE_BYTES) {
    throw new NotSealed(`it is larger than ${Math.round(MAX_ENVELOPE_BYTES / 1024 / 1024)} MB`);
  }
  let bytes: Uint8Array;
  try {
    bytes = fromB64(payload.ct);
  } catch {
    throw new NotSealed("the ciphertext is not valid base64");
  }
  if (!looksEncrypted(bytes)) {
    // The message is deliberately explicit. If this ever fires in production it
    // is a bug in our own code, and the person reading the log needs to know
    // immediately what it means rather than filing it as a validation error.
    throw new NotSealed("the payload is not encrypted — plaintext must never reach this endpoint");
  }
  return payload;
}

export async function listVaults(tenantId: string, userId: string): Promise<VaultSummary[]> {
  try {
    const rows = await pbList<VaultRow>("vaults", {
      filter: `tenant = ${pbStr(tenantId)} && user = ${pbStr(userId)}`,
      sort: "-created",
      perPage: 50,
    });
    return rows.map(summarise);
  } catch (err) {
    // An uninstalled collection is an empty list, not an error: the page should
    // still render its explanation and its "seal a backup" button, which work
    // without a server at all. Only an attempt to STORE one needs to say why.
    if (missingCollection(err)) return [];
    throw err;
  }
}

export async function putVault(
  tenantId: string,
  userId: string,
  payload: unknown,
  label: string,
): Promise<VaultSummary> {
  const sealed = assertOpaque(payload);
  const envelope = JSON.stringify(sealed);
  let row: VaultRow;
  try {
    row = await pbCreate<VaultRow>("vaults", {
      tenant: tenantId,
      user: userId,
      label: label.slice(0, 120),
      format: VAULT_FORMAT,
      envelope,
      bytes: envelope.length,
      sealed_at: sealed.sealedAt,
    });
  } catch (err) {
    if (missingCollection(err)) throw new VaultNotInstalled();
    throw err;
  }

  // Keep the last few and drop the rest. A backup nobody prunes becomes a
  // growing pile of ciphertext we are storing for someone who has forgotten it
  // exists — and every copy is another thing to lose control of, even sealed.
  const rest = await pbList<VaultRow>("vaults", {
    filter: `tenant = ${pbStr(tenantId)} && user = ${pbStr(userId)}`,
    sort: "-created",
    perPage: 100,
  });
  for (const old of rest.slice(KEEP_PER_USER)) {
    await pbDelete("vaults", old.id).catch(() => {});
  }
  return summarise(row);
}

/** The sealed envelope, for a browser that is about to try a passphrase on it. */
export async function getVault(
  id: string,
  tenantId: string,
  userId: string,
): Promise<SealedVault | null> {
  const row = await pbFirst<VaultRow>(
    "vaults",
    `id = ${pbStr(id)} && tenant = ${pbStr(tenantId)} && user = ${pbStr(userId)}`,
  ).catch((err) => {
    if (missingCollection(err)) return null;
    throw err;
  });
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.envelope);
    return isSealedVault(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function removeVault(id: string, tenantId: string, userId: string): Promise<boolean> {
  const row = await pbFirst<VaultRow>(
    "vaults",
    `id = ${pbStr(id)} && tenant = ${pbStr(tenantId)} && user = ${pbStr(userId)}`,
  );
  if (!row) return false;
  await pbDelete("vaults", row.id);
  return true;
}
