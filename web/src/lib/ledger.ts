// Tamper-evident audit ledger — "records can be changed, but every change is
// recorded".
//
// Every create / edit / void of a transaction appends one row to `ledger`.
// Each row's hash covers the previous row's hash:
//
//   hash(n) = SHA-256( canonical({ seq, prev_hash, op, collection, record_id,
//                                  before, after, actor, at }) )
//
// So the head hash commits to the entire history. Change any past row — amount,
// date, who did it — and every hash after it fails to reproduce. You cannot
// quietly rewrite the books; you can only append a correction, which is exactly
// the behaviour asked for.
//
// Nothing is ever destroyed: a "delete" is an append with op="void" that flips
// transactions.voided, and it can be reversed with op="restore". The row, and
// its whole history, stays.
//
// A local hash chain proves *internal* consistency, but on its own it can't
// prove the whole chain wasn't rebuilt from scratch last night — whoever holds
// the database could recompute every hash. Anchoring fixes that: we submit the
// head hash to OpenTimestamps, which batches it into the Bitcoin blockchain.
// After that, the chain provably existed at that time and no rewrite is
// possible without also rewriting Bitcoin. Financial data never leaves the
// device — only a 32-byte hash, which reveals nothing.
//
// Server-only.

import { createHash } from "node:crypto";
import { pbCreate, pbFirst, pbList, pbStr } from "./pocketbase";
import { isPocketBaseConfigured } from "./config";

export type LedgerOp = "create" | "update" | "void" | "restore";

export interface LedgerEntry {
  id: string;
  tenant: string;
  seq: number;
  prev_hash: string;
  hash: string;
  op: LedgerOp;
  collection: string;
  record_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor: string;
  actor_email: string;
  at: string;
  created: string;
}

export const GENESIS = "0".repeat(64);

// Stable stringify — key order must not affect the hash, or verification would
// depend on whatever order the JSON engine happened to serialise in.
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

interface HashInput {
  seq: number;
  prev_hash: string;
  op: LedgerOp;
  collection: string;
  record_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor: string;
  at: string;
}

export function hashEntry(input: HashInput): string {
  return createHash("sha256").update(canonical(input), "utf8").digest("hex");
}

async function head(tenantId: string): Promise<LedgerEntry | null> {
  return pbFirst<LedgerEntry>("ledger", `tenant = ${pbStr(tenantId)}`, { sort: "-seq" });
}

export interface AppendInput {
  tenantId: string;
  op: LedgerOp;
  collection: string;
  recordId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  actorId?: string;
  actorEmail?: string;
}

// Append one entry. The (tenant, seq) unique index is what makes this safe under
// concurrency: two simultaneous writers computing the same seq will collide, and
// the loser retries against the new head rather than forking the chain.
export async function append(input: AppendInput): Promise<LedgerEntry | null> {
  if (!isPocketBaseConfigured()) return null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const prev = await head(input.tenantId);
    const seq = (prev?.seq ?? 0) + 1;
    const prevHash = prev?.hash ?? GENESIS;
    const at = new Date().toISOString().replace("T", " ");

    const hash = hashEntry({
      seq,
      prev_hash: prevHash,
      op: input.op,
      collection: input.collection,
      record_id: input.recordId,
      before: input.before ?? null,
      after: input.after ?? null,
      actor: input.actorId ?? "",
      at,
    });

    try {
      return await pbCreate<LedgerEntry>("ledger", {
        tenant: input.tenantId,
        seq,
        prev_hash: prevHash,
        hash,
        op: input.op,
        collection: input.collection,
        record_id: input.recordId,
        before: input.before ?? null,
        after: input.after ?? null,
        actor: input.actorId ?? "",
        actor_email: input.actorEmail ?? "",
        at,
      });
    } catch (err) {
      // Unique-index collision on (tenant, seq) → someone else appended first.
      const msg = err instanceof Error ? err.message : "";
      if (!/seq|unique|constraint/i.test(msg) || attempt === 4) throw err;
    }
  }
  return null;
}

// ── Verification ────────────────────────────────────────────────────────────

export interface ChainStatus {
  ok: boolean;
  length: number;
  headHash: string | null;
  /** seq of the first entry whose hash doesn't reproduce — the tamper point. */
  brokenAt: number | null;
  reason?: string;
}

// Recompute every hash from genesis. This is the check that catches a rewrite.
export async function verifyChain(tenantId: string): Promise<ChainStatus> {
  const entries = await pbList<LedgerEntry>("ledger", {
    filter: `tenant = ${pbStr(tenantId)}`,
    sort: "seq",
    perPage: 1000,
  });
  if (entries.length === 0) {
    return { ok: true, length: 0, headHash: null, brokenAt: null };
  }

  let expectedPrev = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.seq !== i + 1) {
      return { ok: false, length: entries.length, headHash: null, brokenAt: e.seq, reason: "A ledger entry is missing — the sequence has a gap." };
    }
    if (e.prev_hash !== expectedPrev) {
      return { ok: false, length: entries.length, headHash: null, brokenAt: e.seq, reason: "An entry does not link to the one before it." };
    }
    const recomputed = hashEntry({
      seq: e.seq,
      prev_hash: e.prev_hash,
      op: e.op,
      collection: e.collection,
      record_id: e.record_id,
      before: e.before ?? null,
      after: e.after ?? null,
      actor: e.actor ?? "",
      at: e.at,
    });
    if (recomputed !== e.hash) {
      return { ok: false, length: entries.length, headHash: null, brokenAt: e.seq, reason: "An entry's contents no longer match its hash — it was altered after the fact." };
    }
    expectedPrev = e.hash;
  }

  return { ok: true, length: entries.length, headHash: expectedPrev, brokenAt: null };
}

// Full change history for one record — what the "history" view renders.
export async function historyFor(tenantId: string, recordId: string): Promise<LedgerEntry[]> {
  return pbList<LedgerEntry>("ledger", {
    filter: `tenant = ${pbStr(tenantId)} && record_id = ${pbStr(recordId)}`,
    sort: "seq",
  });
}

export async function recentEntries(tenantId: string, limit = 100): Promise<LedgerEntry[]> {
  return pbList<LedgerEntry>("ledger", {
    filter: `tenant = ${pbStr(tenantId)}`,
    sort: "-seq",
    perPage: limit,
  });
}

// ── Public anchoring (OpenTimestamps → Bitcoin) ─────────────────────────────

// OpenTimestamps calendars accept a raw 32-byte digest and return a serialized
// timestamp proof for it. Prepending the standard .ots header + the SHA-256 op
// tag + the digest turns that response into a real detached .ots file, which
// `ots verify` (or opentimestamps.org) can check independently of us.
const OTS_MAGIC = Buffer.from([
  0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x73, 0x00,
  0x00, 0x50, 0x72, 0x6f, 0x6f, 0x66, 0x00, 0xbf, 0x89, 0xe2, 0xe8, 0x84, 0xe8, 0x92, 0x94,
]);
const OTS_VERSION = 0x01;
const OP_SHA256 = 0x08;

const CALENDARS = [
  "https://a.pool.opentimestamps.org",
  "https://b.pool.opentimestamps.org",
  "https://alice.btc.calendar.opentimestamps.org",
];

export interface Anchor {
  id: string;
  tenant: string;
  root_hash: string;
  from_seq: number;
  to_seq: number;
  provider: string;
  status: string;
  proof_b64: string;
  detail: string;
  created: string;
}

async function submitToCalendar(url: string, digest: Buffer): Promise<Buffer> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(`${url}/digest`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/vnd.opentimestamps.v1" },
      body: new Uint8Array(digest),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

// Anchor the current head hash. Because it's a hash chain, timestamping the head
// timestamps everything before it — one 32-byte submission covers the whole
// history to date.
export async function anchorHead(tenantId: string): Promise<Anchor> {
  const chain = await verifyChain(tenantId);
  if (!chain.ok) throw new Error(`Refusing to anchor a broken chain: ${chain.reason}`);
  if (!chain.headHash) throw new Error("Nothing to anchor — the ledger is empty.");

  const last = await pbFirst<Anchor>("ledger_anchors", `tenant = ${pbStr(tenantId)}`, { sort: "-created" });
  if (last?.root_hash === chain.headHash) {
    return last; // nothing has changed since the last anchor
  }

  const digest = Buffer.from(chain.headHash, "hex");
  const errors: string[] = [];
  let proof: Buffer | null = null;
  let usedCalendar = "";

  for (const cal of CALENDARS) {
    try {
      const body = await submitToCalendar(cal, digest);
      proof = Buffer.concat([
        OTS_MAGIC,
        Buffer.from([OTS_VERSION, OP_SHA256]),
        digest,
        body,
      ]);
      usedCalendar = cal;
      break;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return pbCreate<Anchor>("ledger_anchors", {
    tenant: tenantId,
    root_hash: chain.headHash,
    from_seq: (last?.to_seq ?? 0) + 1,
    to_seq: chain.length,
    provider: "opentimestamps",
    // Bitcoin confirmation takes a few hours; the calendar has committed to
    // including it, so "pending" here means "submitted, awaiting a block".
    status: proof ? "pending" : "failed",
    proof_b64: proof ? proof.toString("base64") : "",
    detail: proof ? `Submitted to ${usedCalendar}` : `All calendars failed: ${errors.join("; ")}`,
  });
}

export async function listAnchors(tenantId: string, limit = 20): Promise<Anchor[]> {
  return pbList<Anchor>("ledger_anchors", {
    filter: `tenant = ${pbStr(tenantId)}`,
    sort: "-created",
    perPage: limit,
  });
}
