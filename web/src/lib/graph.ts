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
import { deriveKind, kindOf, SAVINGS_TIER, type Category, type RecordKind } from "./recordKind";
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

// ── income has to become a NODE, not just a row ────────────────────────────
//
// This is the fix for "the dashboard and graph don't tally with the data".
//
// lib/projection.ts and lib/hscoreData.ts read a household's income from ONE
// place: `income_source` nodes and their `props.monthly_amount`. Neither of them
// looks at transactions. So a user who recorded a RM20,000 salary still had an
// income of zero everywhere it mattered — allocations divided nothing, headroom
// was nothing, savings rate was zero over zero, and the H-Score was computed
// from a household that appeared to earn nothing while spending normally.
//
// Recording income now maintains the node the rest of the app already reads, so
// the graph, the dashboard and the score tally by construction rather than by
// three separate calculations agreeing.
//
// `derived: true` marks a source this path created. A source a human declared —
// the seeded demo households, or anything set up on /graph — is NEVER
// overwritten: their monthly_amount is a stated plan, and silently replacing it
// with whatever happened to be logged this month would destroy the distinction
// between what a household expects to earn and what it has so far received.

interface IncomeProps {
  monthly_amount?: number;
  derived?: boolean;
  [k: string]: unknown;
}

/** Find-or-create the income_source node money arrives from. */
async function ensureIncomeSourceNode(tenantId: string, label: string): Promise<PBNode> {
  const clean = label.trim() || "Income";
  const existing = await pbFirst<PBNode>(
    "nodes",
    `tenant = ${pbStr(tenantId)} && kind = 'income_source' && label ~ ${pbStr(clean)}`,
  );
  if (existing) return existing;

  return pbCreate<PBNode>("nodes", {
    tenant: tenantId,
    kind: "income_source",
    label: clean,
    props: { derived: true, monthly_amount: 0 },
  });
}

/**
 * Recompute a derived source's monthly figure from what was actually received.
 *
 * The month with the most recent activity is used rather than a trailing
 * average, because an average over a partial first month reports a household as
 * earning half its salary — and the person looking at the screen has just typed
 * the full amount in. Whole months only, falling back to the current one when
 * that is all there is.
 */
export async function refreshDerivedIncome(tenantId: string, nodeId: string): Promise<void> {
  const node = await pbFirst<PBNode>("nodes", `id = ${pbStr(nodeId)} && tenant = ${pbStr(tenantId)}`);
  if (!node || node.kind !== "income_source") return;

  const props = (node.props ?? {}) as IncomeProps;
  // A declared source is a statement of intent. Leave it alone.
  if (props.derived !== true) return;

  const rows = await pbList<{ amount: number; occurred_at: string; kind?: string; direction?: string; voided?: boolean }>(
    "transactions",
    { filter: `tenant = ${pbStr(tenantId)} && vendor_node = ${pbStr(nodeId)}` },
  );

  const byMonth = new Map<string, number>();
  for (const r of rows) {
    if (r.voided) continue;
    if (r.direction !== "in") continue;
    const m = String(r.occurred_at).slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + Number(r.amount || 0));
  }
  if (!byMonth.size) return;

  const newest = [...byMonth.keys()].sort().pop() as string;
  const monthly = Math.round((byMonth.get(newest) ?? 0) * 100) / 100;

  await pbUpdate("nodes", nodeId, { props: { ...props, derived: true, monthly_amount: monthly } });
}

/**
 * The starting split, created the first time a household records income.
 *
 * A new household is seeded with three buckets and NO allocation edges, so
 * until now the first salary landed in a graph with nowhere to send it: the
 * projection divided the income across nothing, every bucket showed unfunded,
 * and the dashboard stayed empty for a household that had just told it what
 * they earn. The only way out was to open /graph and wire allocations by hand,
 * which is not a step anyone discovers.
 *
 * 50 / 20 / 30 across Must-paid, Savings and Spendings. The savings figure is
 * not a round number chosen for tidiness: lib/hscore.ts scores savings rate on a
 * curve that reaches 26 of 30 points at 20%, so the default the app proposes and
 * the behaviour it rewards are the same number.
 *
 * `derived: true` says the household did not choose this. It is a starting
 * point to adjust on /graph, and it is created ONCE — the moment a real
 * allocation exists, this never fires again and never overwrites anything.
 */
export async function ensureDefaultAllocations(tenantId: string, incomeNodeId: string): Promise<void> {
  // Scoped to THIS source, not to the household.
  //
  // The first version asked "does the household have any allocations?" and
  // stopped if so — which left a second income source with no route at all. A
  // household with a salary and a side income then showed RM21,119 of income
  // against RM8,050 allocated, and the difference was money the app had been
  // told about and had nowhere to put. Every source needs somewhere to go; a
  // plan already made for a DIFFERENT source is not a reason to skip this one.
  const existing = await pbList<PBEdge>("edges", {
    filter: `tenant = ${pbStr(tenantId)} && src_node = ${pbStr(incomeNodeId)} && valid_to = '' && (rel = 'ALLOCATES_PCT' || rel = 'ALLOCATES_FIXED')`,
  });
  if (existing.length) return; // this source is already routed; leave it alone

  const buckets = await listBuckets(tenantId);
  const SPLIT: Record<number, number> = { 1: 50, 2: 20, 3: 30 };

  for (const [tier, pct] of Object.entries(SPLIT)) {
    // The household's own bucket in that tier — the first one, which for a
    // freshly seeded household is the only one.
    const target = buckets.find((b) => b.tier === Number(tier));
    if (!target) continue;
    await pbCreate("edges", {
      tenant: tenantId,
      src_node: incomeNodeId,
      dst_node: target.id,
      rel: "ALLOCATES_PCT",
      percentage: pct,
      props: { derived: true },
    });
  }
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
  source = "scan",
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
    actorLabel: source, // e.g. "scan" — no logged-in actor on that path
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
/**
 * Thrown when a write is attempted against a household that keeps its records
 * on its own devices. Not a failure — the system working as the user asked.
 */
export class LocalOnlyRefused extends Error {
  readonly storageMode = "local_only" as const;
  constructor() {
    super(
      "This household keeps its records on its own devices. Nothing is stored on our server, including this.",
    );
    this.name = "LocalOnlyRefused";
  }
}

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
    /**
     * The payer asked for this to sit outside household totals. Separate from
     * `visibility` because they answer different questions — see the
     * 1756200004_sharing migration.
     */
    excludeFromTotals?: boolean;
    /** True when a human chose the attribution, false when we defaulted it. */
    attributionAsserted?: boolean;
  },
  actor?: Actor,
): Promise<IngestResult> {
  // ── The storage mode, enforced at the FLOOR ────────────────────────────
  //
  // /api/transactions checked this and four other write paths did not:
  // /api/graph, /api/import and /api/statement/commit would all have written
  // happily for a household that had been told the
  // server refuses to store their records. A local-only household importing a
  // CSV would have silently repopulated the database they had just had purged.
  //
  // A per-route guard is the wrong shape for a rule that must hold everywhere:
  // it is enforced by whoever remembers, and the next write path added will be
  // written by someone who does not know this rule exists. Every one of those
  // routes reaches this function, so this is the one place that makes the
  // guarantee true by construction.
  //
  // Throws rather than returning a result, because there is no partially-
  // correct outcome: the caller asked to store something we have promised not
  // to store. Each route turns this into its own 409.
  const { isLocalOnly } = await import("./storageModeStore");
  if (await isLocalOnly(tenantId)) {
    throw new LocalOnlyRefused();
  }


  // ONLY a stated EARNING creates an income source — never a bare direction, and
  // never the money-in catch-all.
  //
  // The `+ Income` button posts category:"income"; a CSV import and a statement
  // commit post direction:"in" with no category, because a bank credit can be a
  // refund, a cashback, a card payment or a transfer between the household's own
  // accounts. Treating every credit as income would have turned "Refund —
  // Shopee" into an income source with a monthly figure, inflating the
  // household's income and every ratio built on it.
  //
  // ⚠️ `income_other` was on this list until 2026-08-26 and should not have
  // been. It is the "Something else" option under `+ Money in` — a refund, a
  // rebate, an ang pow, money back from a friend — which is precisely the set
  // the paragraph above says must not become a salary. The category being
  // STATED does not make the money EARNED: what a human asserted by choosing it
  // is that money came in, not that it recurs monthly. lib/classify.ts now files
  // "refund" and "cashback" here automatically, which turned a latent
  // inconsistency into one that would fire on the first refund anybody typed.
  //
  // An inflow that is not an earning still records correctly as an inflow, still
  // stays out of spend, and still shows in the ledger. It simply does not claim
  // to be a salary.
  const isStatedIncome = input.category === "income";
  const counterparty = isStatedIncome
    ? await ensureIncomeSourceNode(tenantId, input.vendorLabel)
    : null;
  const vendorNodeId = counterparty?.id ?? (await ensureVendorNode(tenantId, input.vendorLabel));

  // A bucket is still REQUIRED for anything that leaves a bucket, and still
  // verified to belong to this tenant. It is only optional for money coming in.
  const wallet = input.walletNodeId
    ? await pbFirst<PBNode>(
        "nodes",
        `id = ${pbStr(input.walletNodeId)} && tenant = ${pbStr(tenantId)} && kind = 'bucket'`,
      )
    : null;
  if (input.walletNodeId && !wallet) throw new Error("Unknown bucket for this household.");

  // Which KIND of record this is. Decided HERE, after the bucket is known,
  // because the destination is part of the answer.
  //
  // It used to be decided from `direction` alone whenever no category was sent
  // — which is every CSV import, every statement commit, and every quick
  // capture. So RM500 moved INTO the Savings bucket with the `−` button became
  // an `outflow`, while the same RM500 via the `+` button became a `transfer`.
  // The recent list then showed "Saving −RM500" and "Saving +RM500" on the same
  // day: one act, two representations, and a household reasonably concluding
  // the app could not make up its mind.
  //
  // The bucket is now authoritative for savings. Anything landing in a
  // savings-tier bucket is a transfer however it was entered, so there is
  // exactly one way for savings to appear.
  //
  // A stated category still wins, and that is what keeps the case the user
  // actually asked about working: money somebody GAVE you for savings is
  // category `income`, which is an inflow, because it really did arrive.
  const bucketTier = wallet
    ? Number((wallet.props as { bucket?: number } | null)?.bucket) || null
    : null;
  const kind: RecordKind = input.category
    ? kindOf(input.category)
    : deriveKind({ direction: input.direction, bucketTier });

  // No SPENT_AT edge for an inflow, and that is the point: SPENT_AT means
  // "this bucket paid this vendor". Income paid nobody, so inventing an edge
  // from a bucket it never came from is what drew salaries as spending.
  //
  // A TRANSFER gets none either, and that was the second half of the same bug.
  // `+ Savings` posts a bucket, so the old condition drew a SPENT_AT edge out of
  // the savings bucket — putting money away rendered as spending it, on the one
  // screen the household looks at to see whether they are saving.
  const edgeId =
    wallet && kind === "outflow" ? await ensureSpentAtEdge(tenantId, wallet.id, vendorNodeId) : "";

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
    kind,
    ...(input.paidBy || input.memberId ? { paid_by: input.paidBy ?? input.memberId } : {}),
    visibility: input.visibility ?? "shared",
    exclude_from_totals: input.excludeFromTotals === true,
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

  // The whole point of the change above: the node the dashboard, the projection
  // and the H-Score all read is updated in the same call that records the money,
  // so the screens tally the moment the user hits save rather than after some
  // separate setup step nobody knew to do.
  if (counterparty) {
    try {
      await refreshDerivedIncome(tenantId, counterparty.id);
      // Income with nowhere to go renders as an empty dashboard, which reads as
      // "the app didn't save it". Give it somewhere on the first pay-in.
      await ensureDefaultAllocations(tenantId, counterparty.id);
    } catch {
      // The income is recorded either way. A stale monthly figure is a wrong
      // dashboard; a failed save is a lost record, and that is the worse one.
    }
  }

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
  /** inflow · outflow · transfer. Absent on rows written before Task 1. */
  kind?: string | null;
  /** "in" | "out". Absent (meaning "out") on the oldest rows. */
  direction?: string | null;
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

    // THE BUCKET DECIDES THE KIND, and moving a record has to move that too.
    //
    // This wrote the new bucket and left `kind` exactly as it was, which made
    // the app's own correction path unable to correct the thing people most
    // need to. A spend mis-filed into Spendings that is really a savings
    // deposit could be dragged into the Savings bucket and would go on
    // rendering as "− RM500" in grey for ever, because every read path resolves
    // a row's kind from its stored value first and only falls back to the tier.
    // The user does the right thing, the screen does not change, and there is
    // nothing else in the UI for them to try.
    //
    // Both directions, so the correction is reversible: into a tier-2 bucket
    // makes it a transfer (a deposit and a withdrawal are both transfers — the
    // household is no richer or poorer for either), and out of one hands it
    // back to whichever side `direction` says.
    const tier = Number((wallet.props as { bucket?: number } | null)?.bucket) || null;
    const wasTier2 = before.kind === "transfer";
    if (tier === SAVINGS_TIER) {
      body.kind = "transfer";
    } else if (wasTier2) {
      body.kind = before.direction === "in" ? "inflow" : "outflow";
    }
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

