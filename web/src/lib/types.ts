// Shared domain types for the HoneyMoney knowledge graph.

export type NodeKind =
  | "income_source"
  | "bucket"
  | "wallet"
  | "vendor"
  | "obligation"
  | "goal"
  | "asset"
  | "member";

export interface ParsedReceipt {
  vendor: string;
  amount: number;
  currency: string;
  occurredAt: string; // ISO 8601
  confidence: number; // 0..1
}

export interface BucketProjection {
  bucket_id: string;
  bucket_label: string;
  /** 1 = must-paid · 2 = savings · 3 = spendings/personal. Surfaced because the
   *  Record form needs it to default a personal-bucket spend to private
   *  (Task 6), and it was already known here — just not passed on. */
  tier: number;
  allocated: number;
  mtd_spend: number;
  projected_spend: number;
  projected_balance: number;
  status: "on_track" | "at_risk" | "over_budget" | "unfunded";
}

export interface TransactionRow {
  id: string;
  amount: number;
  currency: string;
  occurred_at: string;
  source: string | null;
  parse_confidence: number | null;
  vendor_node: string | null;
  wallet_node: string | null;
}
