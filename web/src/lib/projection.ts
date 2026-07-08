// Read path: projection + recent spend + the "Honey" insight (with a
// deterministic fallback so the demo works even without Gemini configured).

import { getServiceClient } from "./supabaseServer";
import { isGeminiConfigured } from "./config";
import { honeyInsight } from "./gemini";
import type { BucketProjection } from "./types";

export async function getBucketProjection(
  tenantId: string,
): Promise<BucketProjection[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("bucket_projection", {
    p_tenant: tenantId,
  });
  if (error) throw new Error(`bucket_projection: ${error.message}`);
  return (data ?? []) as BucketProjection[];
}

export interface RecentSpend {
  id: string;
  amount: number;
  currency: string;
  occurred_at: string;
  vendor: string | null;
  source: string | null;
}

export async function getRecentSpend(
  tenantId: string,
  limit = 8,
): Promise<RecentSpend[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, amount, currency, occurred_at, source, vendor:vendor_node(label)")
    .eq("tenant_id", tenantId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getRecentSpend: ${error.message}`);

  return (data ?? []).map((r) => {
    const vendorField = r.vendor as unknown;
    let vendor: string | null = null;
    if (Array.isArray(vendorField)) {
      vendor = (vendorField[0] as { label?: string })?.label ?? null;
    } else if (vendorField && typeof vendorField === "object") {
      vendor = (vendorField as { label?: string }).label ?? null;
    }
    return {
      id: r.id as string,
      amount: Number(r.amount),
      currency: r.currency as string,
      occurred_at: r.occurred_at as string,
      vendor,
      source: (r.source as string) ?? null,
    };
  });
}

// Build a compact, graph-grounded context string for the AI (or the fallback).
function buildContext(projection: BucketProjection[]): string {
  const lines = projection.map(
    (b) =>
      `- ${b.bucket_label}: allocated RM${b.allocated}, projected spend RM${b.projected_spend}, ` +
      `projected balance RM${b.projected_balance} (${b.status})`,
  );
  return lines.join("\n");
}

// Deterministic, marital-safe fallback insight from the projection alone.
function ruleBasedInsight(projection: BucketProjection[]): string {
  const over = projection.filter((b) => b.status === "over_budget");
  const risk = projection.filter((b) => b.status === "at_risk");

  if (over.length > 0) {
    const b = over[0];
    const gap = Math.abs(b.projected_balance);
    return (
      `Heads up together: at this month's pace, ${b.bucket_label} is trending about ` +
      `RM${gap.toFixed(0)} over its RM${b.allocated} plan. A small tweak now keeps your ` +
      `Future Shield goal right on schedule — want to rebalance?`
    );
  }
  if (risk.length > 0) {
    const b = risk[0];
    return (
      `You're doing well! ${b.bucket_label} is getting close to its RM${b.allocated} limit — ` +
      `worth a gentle glance so nothing nudges your shared goals later.`
    );
  }
  return `Great teamwork this month — every bucket is on track and your Future Shield is funding on schedule. Keep it up!`;
}

export async function getHoneyInsight(
  projection: BucketProjection[],
): Promise<{ text: string; source: "gemini" | "rule-based" }> {
  if (!isGeminiConfigured()) {
    return { text: ruleBasedInsight(projection), source: "rule-based" };
  }
  try {
    const text = await honeyInsight(buildContext(projection));
    return { text, source: "gemini" };
  } catch {
    return { text: ruleBasedInsight(projection), source: "rule-based" };
  }
}
