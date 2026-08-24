// Graph write path: turn a parsed receipt into graph state
// (vendor node + SPENT_AT edge + transaction event). PocketBase edition.
//
// Every mutation here also appends to the hash-chained ledger (lib/ledger.ts),
// so a transaction can be corrected or voided but its history can never be
// quietly rewritten.

import { pbList, pbFirst, pbCreate, pbUpdate, pbStr, pbUploadFiles } from "./pocketbase";
import { append } from "./ledger";
import type { ParsedReceipt } from "./types";
import type { DecodedAttachment } from "./attachments";
import { kindOf, type Category, type RecordKind } from "./recordKind";
import type { Visibility } from "./attribution";

export interface Actor {
  id: string;
  email: string;
}

interface PBNode {
  id: string;
  label: string;
  kind: string;
  props: Record<string, unknown> | null;
  created: string;
}

interface PBEdge {
  id: string;
}

interface IngestResult {
  transactionId: string;
  walletNodeId: string;
  vendorNodeId: string;
  walletLabel: string;
  /** Filenames PocketBase stored, if any images came with the spend. */
  attachments?: string[];
  /** Set when the spend saved but its image did not — the caller must say so. */
  attachmentError?: string;
}

// Find-or-create the vendor node for this tenant (case-insensitive by label).
async function ensureVendorNode(tenantId: string, vendor: string): Promise<string> {
  const label = vendor.trim() || "Unknown";

  const existing = await pbFirst<PBNode>(
    "nodes",
    `tenant = ${pbStr(tenantId)} && kind = 'vendor' && label ~ ${pbStr(label)}`,
  );
  if (existing) return existing.id;

  const created = await pbCreate<PBNode>("nodes", {
    tenant: tenantId,
    kind: "vendor",
    label,
    props: {},
  });
  return created.id;
}

export async function listBuckets(tenantId: string): Promise<{ id: string; label: string; tier: number }[]> {
  const buckets = await pbList<PBNode>("nodes", {
    filter: `tenant = ${pbStr(tenantId)} && kind = 'bucket'`,
    sort: "created",
  });
  return buckets.map((b) => ({
    id: b.id,
    label: b.label,
    tier: Number((b.props as { bucket?: number } | null)?.bucket ?? 3),
  }));
}

// Resolve which bucket/wallet a forwarded receipt should be attributed to.
// Preference: a bucket flagged props.default_spend = true; else the first bucket.
export async function resolveWalletNode(
  tenantId: string,
): Promise<{ id: string; label: string }> {
  const buckets = await pbList<PBNode>("nodes", {
    filter: `tenant = ${pbStr(tenantId)} && kind = 'bucket'`,
    sort: "created",
  });
  if (buckets.length === 0) {
    throw new Error("No bucket exists for this tenant — run the PocketBase seed first.");
  }
  const def = buckets.find((b) => b.props && b.props.default_spend === true);
  const pick = def ?? buckets[0];
  return { id: pick.id, label: pick.label };
}

// Find-or-create the SPENT_AT edge (wallet -> vendor).
async function ensureSpentAtEdge(
  tenantId: string,
  walletNodeId: string,
  vendorNodeId: string,
): Promise<string> {
  const existing = await pbFirst<PBEdge>(
    "edges",
    `tenant = ${pbStr(tenantId)} && src_node = ${pbStr(walletNodeId)} && dst_node = ${pbStr(vendorNodeId)} && rel = 'SPENT_AT' && valid_to = ''`,
  );
  if (existing) return existing.id;

  const created = await pbCreate<PBEdge>("edges", {
    tenant: tenantId,
    src_node: walletNodeId,
    dst_node: vendorNodeId,
    rel: "SPENT_AT",
  });
  return created.id;
}

export async function ingestReceipt(
  tenantId: string,
  parsed: ParsedReceipt,
  source = "telegram",
): Promise<IngestResult> {
  const vendorNodeId = await ensureVendorNode(tenantId, parsed.vendor);
  const wallet = await resolveWalletNode(tenantId);
  const edgeId = await ensureSpentAtEdge(tenantId, wallet.id, vendorNodeId);

  const body: Record<string, unknown> = {
    tenant: tenantId,
    edge: edgeId,
    wallet_node: wallet.id,
    vendor_node: vendorNodeId,
    amount: parsed.amount,
    currency: parsed.currency,
    occurred_at: parsed.occurredAt,
    source,
    direction: "out", // a scanned receipt is a spend
    voided: false,
    parse_confidence: parsed.confidence,
    raw: parsed as unknown as Record<string, unknown>,
  };
  const tx = await pbCreate<{ id: string }>("transactions", body);

  await append({
    tenantId,
    op: "create",
    collection: "transactions",
    recordId: tx.id,
    after: body,
    actorLabel: source, // e.g. "telegram" — no logged-in actor on that path
  });

  return {
    transactionId: tx.id,
    walletNodeId: wallet.id,
    vendorNodeId,
    walletLabel: wallet.label,
  };
}

// Manual entry from the dashboard form: explicit bucket, typed vendor/amount.
// Optionally attributed to a member (the person lens) and given a subject tag.
//
// `amount` is always in the tenant's base currency (MYR) — the caller converts.
// When the user typed a foreign amount we keep what they actually entered, and
// the rate + source we converted at, in `raw.entered`. Without that, a figure
// reviewed months later is unauditable: you'd see RM 42.10 with no way to know
// it began life as S$ 12.00 at a Bank Negara rate on a particular day.
export async function addManualTransaction(
  tenantId: string,
  input: {
    vendorLabel: string;
    amount: number;
    /**
     * OPTIONAL, and only legitimately absent for an INFLOW.
     *
     * Income does not come from a bucket — it arrives from outside the household
     * and the ALLOCATES edges decide where it goes. This was a required string,
     * so the capture form had to send something, defaulted to buckets[0], and
     * every salary was filed against Must-paid: the graph then showed a
     * household's pay originating inside its own rent bucket, and per-bucket
     * views counted it as bucket activity.
     *
     * A savings deposit still passes one, because it is a TRANSFER into a tier-2
     * bucket rather than an inflow.
     */
    walletNodeId?: string;
    occurredAt?: string;
    memberId?: string;
    source?: string;
    note?: string;
    confidence?: number;
    direction?: "out" | "in"; // "out" = debit/spend (default), "in" = credit/money-in
    entered?: { amount: number; currency: string; perMYR: number; rateSource: string };
    /** Receipt images, already decoded and size-checked by lib/attachments.ts. */
    attachments?: DecodedAttachment[];
    /** Task 1: which button and which category the user chose. */
    category?: Category;
    /** Task 6: who paid. Falls back to `memberId` for callers not yet updated. */
    paidBy?: string;
    /** Task 6: private ⇒ only the payer sees it. Defaults to shared. */
    visibility?: Visibility;
    /** True when a human chose the attribution, false when we defaulted it. */
    attributionAsserted?: boolean;
  },
  actor?: Actor,
): Promise<IngestResult> {
  const vendorNodeId = await ensureVendorNode(tenantId, input.vendorLabel);

  // A bucket is still REQUIRED for anything that leaves a bucket, and still
  // verified to belong to this tenant. It is only optional for money coming in.
  const wallet = input.walletNodeId
    ? await pbFirst<PBNode>(
        "nodes",
        `id = ${pbStr(input.walletNodeId)} && tenant = ${pbStr(tenantId)} && kind = 'bucket'`,
      )
    : null;
  if (input.walletNodeId && !wallet) throw new Error("Unknown bucket for this household.");

  // No SPENT_AT edge for an inflow, and that is the point: SPENT_AT means
  // "this bucket paid this vendor". Income paid nobody, so inventing an edge
  // from a bucket it never came from is what drew salaries as spending.
  const edgeId = wallet ? await ensureSpentAtEdge(tenantId, wallet.id, vendorNodeId) : "";

  const body: Record<string, unknown> = {
    tenant: tenantId,
    ...(edgeId ? { edge: edgeId } : {}),
    ...(wallet ? { wallet_node: wallet.id } : {}),
    vendor_node: vendorNodeId,
    ...(input.memberId ? { member: input.memberId } : {}),
    amount: input.amount,
    currency: "MYR",
    // The THREE kinds behind the two buttons. Derived from the category when the
    // caller supplies one; otherwise inferred from direction, which keeps every
    // existing caller working unchanged. `+ Savings` becomes a TRANSFER here —
    // the one inference that stops a savings deposit reading as money leaving
    // the household.
    kind: (input.category
      ? kindOf(input.category)
      : input.direction === "in"
        ? "inflow"
        : "outflow") as RecordKind,
    ...(input.paidBy || input.memberId ? { paid_by: input.paidBy ?? input.memberId } : {}),
    visibility: input.visibility ?? "shared",
    // Absent ⇒ false ⇒ "nobody said this, we defaulted it", which is exactly
    // what the brief asks migrated attribution to be marked as.
    attribution_asserted: Boolean(input.attributionAsserted),
    occurred_at: input.occurredAt ?? new Date().toISOString().replace("T", " "),
    source: input.source ?? "manual",
    direction: input.direction === "in" ? "in" : "out",
    note: input.note ?? "",
    voided: false,
    parse_confidence: input.confidence ?? 1,
    ...(input.entered && input.entered.currency !== "MYR" ? { raw: { entered: input.entered } } : {}),
  };

  const tx = await pbCreate<{ id: string }>("transactions", body);

  // Images go up AFTER the record exists, because a file field needs something
  // to attach to. That ordering is also why an upload failure must not throw:
  // the spend is already recorded and correct, and losing the amount because a
  // photo failed would be a far worse trade than a record with no picture. The
  // failure is reported in the return value instead, so the caller can say so.
  let attachments: string[] = [];
  let attachmentError: string | undefined;
  if (input.attachments?.length) {
    try {
      attachments = await pbUploadFiles("transactions", tx.id, "attachments", input.attachments);
    } catch (err) {
      attachmentError = err instanceof Error ? err.message : "Attachment upload failed";
    }
  }

  await append({
    tenantId,
    op: "create",
    collection: "transactions",
    recordId: tx.id,
    // The ledger records what was stored, attachments included — "a receipt was
    // attached to this spend" is exactly the kind of fact an audit trail is for.
    after: {
      ...body,
      vendor_label: input.vendorLabel,
      ...(attachments.length ? { attachments } : {}),
    },
    actorId: actor?.id,
  });

  return {
    transactionId: tx.id,
    // Empty for an inflow: there is no bucket, and the caller's success message
    // says "income" rather than naming one. Callers must not assume a label.
    walletNodeId: wallet?.id ?? "",
    vendorNodeId,
    walletLabel: wallet?.label ?? "",
    attachments,
    attachmentError,
  };
}

// ── Correcting and voiding ──────────────────────────────────────────────────

export interface TxnRecord {
  id: string;
  tenant: string;
  amount: number;
  currency: string;
  occurred_at: string;
  source: string;
  note: string;
  voided: boolean;
  member: string;
  wallet_node: string;
  vendor_node: string;
  parse_confidence: number;
  expand?: { vendor_node?: { label: string }; wallet_node?: { label: string } };
}

export async function getTransaction(tenantId: string, id: string): Promise<TxnRecord | null> {
  return pbFirst<TxnRecord>("transactions", `id = ${pbStr(id)} && tenant = ${pbStr(tenantId)}`);
}

// The fields a user is allowed to correct. Everything else (tenant, hashes,
// created) is structural and off-limits.
export interface TxnPatch {
  vendorLabel?: string;
  amount?: number;
  walletNodeId?: string;
  occurredAt?: string;
  memberId?: string | null;
  note?: string;
  entered?: { amount: number; currency: string; perMYR: number; rateSource: string };
}

export async function updateTransaction(
  tenantId: string,
  id: string,
  patch: TxnPatch,
  actor?: Actor,
): Promise<TxnRecord> {
  const before = await getTransaction(tenantId, id);
  if (!before) throw new Error("No such record in this household.");

  const body: Record<string, unknown> = {};

  if (patch.vendorLabel?.trim()) {
    const vendorNodeId = await ensureVendorNode(tenantId, patch.vendorLabel);
    body.vendor_node = vendorNodeId;
  }
  if (patch.walletNodeId) {
    const wallet = await pbFirst<PBNode>(
      "nodes",
      `id = ${pbStr(patch.walletNodeId)} && tenant = ${pbStr(tenantId)} && kind = 'bucket'`,
    );
    if (!wallet) throw new Error("Unknown bucket for this household.");
    body.wallet_node = wallet.id;
  }
  // Moving a spend to a different bucket or vendor changes which SPENT_AT edge
  // it realizes, so re-point it rather than leaving it attached to the old one.
  const nextWallet = (body.wallet_node as string) ?? before.wallet_node;
  const nextVendor = (body.vendor_node as string) ?? before.vendor_node;
  if (nextWallet !== before.wallet_node || nextVendor !== before.vendor_node) {
    body.edge = await ensureSpentAtEdge(tenantId, nextWallet, nextVendor);
  }

  if (patch.amount !== undefined) {
    if (!Number.isFinite(patch.amount) || patch.amount <= 0) {
      throw new Error("Amount must be a positive number.");
    }
    body.amount = patch.amount;
  }
  if (patch.occurredAt) body.occurred_at = patch.occurredAt;
  if (patch.memberId !== undefined) body.member = patch.memberId ?? "";
  if (patch.note !== undefined) body.note = patch.note;
  if (patch.entered) body.raw = { entered: patch.entered };

  if (Object.keys(body).length === 0) return before;

  const after = await pbUpdate<TxnRecord>("transactions", id, body);

  await append({
    tenantId,
    op: "update",
    collection: "transactions",
    recordId: id,
    before: before as unknown as Record<string, unknown>,
    after: after as unknown as Record<string, unknown>,
    actorId: actor?.id,
  });

  return after;
}

// A "delete" that keeps the evidence. The row stays, flagged void, and the act
// of voiding is itself recorded — so a deleted spend is still visible in the
// audit trail, with who removed it and when.
export async function setTransactionVoided(
  tenantId: string,
  id: string,
  voided: boolean,
  actor?: Actor,
  reason?: string,
): Promise<TxnRecord> {
  const before = await getTransaction(tenantId, id);
  if (!before) throw new Error("No such record in this household.");
  if (before.voided === voided) return before;

  const after = await pbUpdate<TxnRecord>("transactions", id, {
    voided,
    ...(reason ? { note: reason } : {}),
  });

  await append({
    tenantId,
    op: voided ? "void" : "restore",
    collection: "transactions",
    recordId: id,
    before: before as unknown as Record<string, unknown>,
    after: after as unknown as Record<string, unknown>,
    actorId: actor?.id,
  });

  return after;
}

// Create a graph node (income source / bucket / goal / obligation …) with a
// flexible props bag — the "subject matter" is just props.subject, no schema
// change. This is how the graph stays flexible across individual/couple/family.
export async function createGraphNode(
  tenantId: string,
  input: { kind: string; label: string; props?: Record<string, unknown> },
): Promise<{ id: string; label: string; kind: string }> {
  const label = input.label.trim();
  if (!label) throw new Error("Label is required.");
  const node = await pbCreate<{ id: string; label: string; kind: string }>("nodes", {
    tenant: tenantId,
    kind: input.kind,
    label,
    props: input.props ?? {},
  });
  return node;
}

// Create an allocation edge (income/bucket -> bucket): fixed RM or percentage.
export async function createAllocationEdge(
  tenantId: string,
  input: { srcNode: string; dstNode: string; rel: string; amount?: number; percentage?: number },
): Promise<{ id: string }> {
  const src = await pbFirst<PBNode>("nodes", `id = ${pbStr(input.srcNode)} && tenant = ${pbStr(tenantId)}`);
  const dst = await pbFirst<PBNode>("nodes", `id = ${pbStr(input.dstNode)} && tenant = ${pbStr(tenantId)}`);
  if (!src || !dst) throw new Error("Both source and destination must belong to this tenant.");
  return pbCreate<{ id: string }>("edges", {
    tenant: tenantId,
    src_node: input.srcNode,
    dst_node: input.dstNode,
    rel: input.rel,
    ...(input.rel === "ALLOCATES_PCT" ? { percentage: input.percentage ?? 0 } : { amount: input.amount ?? 0 }),
    cadence: "monthly",
  });
}

// Resolve a Telegram chat id to a tenant via channel_links.
export async function resolveTenantByChannel(
  channel: string,
  externalId: string,
): Promise<string | null> {
  const link = await pbFirst<{ tenant: string }>(
    "channel_links",
    `channel = ${pbStr(channel)} && external_id = ${pbStr(externalId)}`,
  );
  return link?.tenant ?? null;
}

// Link a channel to a tenant (idempotent — unique index on channel+external_id).
export async function linkChannel(
  tenantId: string,
  channel: string,
  externalId: string,
): Promise<void> {
  const existing = await resolveTenantByChannel(channel, externalId);
  if (existing) return;
  await pbCreate("channel_links", {
    tenant: tenantId,
    channel,
    external_id: externalId,
  });
}
