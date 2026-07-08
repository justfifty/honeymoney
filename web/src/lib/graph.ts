// Graph write path: turn a parsed receipt into graph state
// (vendor node + SPENT_AT edge + transaction event). PocketBase edition.

import { pbList, pbFirst, pbCreate, pbStr } from "./pocketbase";
import type { ParsedReceipt } from "./types";

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

// Resolve which bucket/wallet a forwarded receipt should be attributed to.
// Preference: a bucket flagged props.default_spend = true; else the first bucket.
async function resolveWalletNode(
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

  const tx = await pbCreate<{ id: string }>("transactions", {
    tenant: tenantId,
    edge: edgeId,
    wallet_node: wallet.id,
    vendor_node: vendorNodeId,
    amount: parsed.amount,
    currency: parsed.currency,
    occurred_at: parsed.occurredAt,
    source,
    parse_confidence: parsed.confidence,
    raw: parsed as unknown as Record<string, unknown>,
  });

  return {
    transactionId: tx.id,
    walletNodeId: wallet.id,
    vendorNodeId,
    walletLabel: wallet.label,
  };
}

// Manual entry from the dashboard form: explicit bucket, typed vendor/amount.
export async function addManualTransaction(
  tenantId: string,
  input: { vendorLabel: string; amount: number; walletNodeId: string; occurredAt?: string },
): Promise<IngestResult> {
  const vendorNodeId = await ensureVendorNode(tenantId, input.vendorLabel);
  const wallet = await pbFirst<PBNode>(
    "nodes",
    `id = ${pbStr(input.walletNodeId)} && tenant = ${pbStr(tenantId)} && kind = 'bucket'`,
  );
  if (!wallet) throw new Error("Unknown bucket for this household.");
  const edgeId = await ensureSpentAtEdge(tenantId, wallet.id, vendorNodeId);

  const tx = await pbCreate<{ id: string }>("transactions", {
    tenant: tenantId,
    edge: edgeId,
    wallet_node: wallet.id,
    vendor_node: vendorNodeId,
    amount: input.amount,
    currency: "MYR",
    occurred_at: input.occurredAt ?? new Date().toISOString().replace("T", " "),
    source: "manual",
    parse_confidence: 1,
  });

  return {
    transactionId: tx.id,
    walletNodeId: wallet.id,
    vendorNodeId,
    walletLabel: wallet.label,
  };
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
