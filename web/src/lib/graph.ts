// Graph write path: turn a parsed receipt into graph state
// (vendor node + SPENT_AT edge + transaction event).

import { getServiceClient } from "./supabaseServer";
import type { ParsedReceipt } from "./types";

interface IngestResult {
  transactionId: string;
  walletNodeId: string;
  vendorNodeId: string;
  walletLabel: string;
}

// Find-or-create the vendor node for this tenant (case-insensitive by label).
async function ensureVendorNode(tenantId: string, vendor: string): Promise<string> {
  const supabase = getServiceClient();
  const label = vendor.trim() || "Unknown";

  const { data: existing } = await supabase
    .from("nodes")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("kind", "vendor")
    .ilike("label", label)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("nodes")
    .insert({ tenant_id: tenantId, kind: "vendor", label })
    .select("id")
    .single();
  if (error) throw new Error(`ensureVendorNode: ${error.message}`);
  return data.id as string;
}

// Resolve which bucket/wallet a forwarded receipt should be attributed to.
// Preference: a bucket flagged props.default_spend = true; else the first bucket.
async function resolveWalletNode(
  tenantId: string,
): Promise<{ id: string; label: string }> {
  const supabase = getServiceClient();

  const { data: def } = await supabase
    .from("nodes")
    .select("id, label")
    .eq("tenant_id", tenantId)
    .eq("kind", "bucket")
    .eq("props->>default_spend", "true")
    .limit(1)
    .maybeSingle();
  if (def?.id) return { id: def.id as string, label: def.label as string };

  const { data: first, error } = await supabase
    .from("nodes")
    .select("id, label")
    .eq("tenant_id", tenantId)
    .eq("kind", "bucket")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`resolveWalletNode: ${error.message}`);
  if (!first?.id) throw new Error("No bucket exists for this tenant — seed it first.");
  return { id: first.id as string, label: first.label as string };
}

// Find-or-create the SPENT_AT edge (wallet -> vendor).
async function ensureSpentAtEdge(
  tenantId: string,
  walletNodeId: string,
  vendorNodeId: string,
): Promise<string> {
  const supabase = getServiceClient();

  const { data: existing } = await supabase
    .from("edges")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("src_node", walletNodeId)
    .eq("dst_node", vendorNodeId)
    .eq("rel", "SPENT_AT")
    .is("valid_to", null)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("edges")
    .insert({
      tenant_id: tenantId,
      src_node: walletNodeId,
      dst_node: vendorNodeId,
      rel: "SPENT_AT",
    })
    .select("id")
    .single();
  if (error) throw new Error(`ensureSpentAtEdge: ${error.message}`);
  return data.id as string;
}

export async function ingestReceipt(
  tenantId: string,
  parsed: ParsedReceipt,
  source = "telegram",
): Promise<IngestResult> {
  const supabase = getServiceClient();

  const vendorNodeId = await ensureVendorNode(tenantId, parsed.vendor);
  const wallet = await resolveWalletNode(tenantId);
  const edgeId = await ensureSpentAtEdge(tenantId, wallet.id, vendorNodeId);

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      tenant_id: tenantId,
      edge_id: edgeId,
      wallet_node: wallet.id,
      vendor_node: vendorNodeId,
      amount: parsed.amount,
      currency: parsed.currency,
      occurred_at: parsed.occurredAt,
      source,
      parse_confidence: parsed.confidence,
      raw: parsed as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();
  if (error) throw new Error(`ingestReceipt: ${error.message}`);

  return {
    transactionId: data.id as string,
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
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("channel_links")
    .select("tenant_id")
    .eq("channel", channel)
    .eq("external_id", externalId)
    .maybeSingle();
  return (data?.tenant_id as string) ?? null;
}
