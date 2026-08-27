// One set of records, assembled from every place they can be.
//
// A household's records can now sit in three places at once, and no screen is
// correct until it reads all three:
//
//   1. THE SERVER          — everything, while the household is in cloud mode.
//   2. THE VAULT SNAPSHOT  — the last copy pulled to this device. It is what
//                            makes analysis work with no network, and in
//                            local-only mode it is the archive of everything
//                            that existed before the switch.
//   3. THE LOCAL LEDGER    — records typed on this device in local-only mode.
//                            These exist NOWHERE else. Omitting them does not
//                            make a total slightly stale, it makes it wrong.
//
// ── WHY THIS MODULE EXISTS AT ALL ──────────────────────────────────────────
//
// Because a dashboard that quietly leaves out the third source is the exact
// failure this codebase has spent the day removing from its own notices: a
// number presented as complete that is not. A household in local-only mode
// entering a week of spending would watch their dashboard stay still and
// conclude the app was broken — or worse, conclude they had underspent.
//
// So the merge is a shared function rather than something each screen does for
// itself, and the result carries `sources` so the UI can say where the figures
// came from instead of implying a completeness it cannot always deliver.

import { listLocalRecords, asAnalysable } from "./localLedger";
import { loadLocal } from "./localVault";

export interface UnifiedResult {
  /** Every record, deduplicated, newest first. */
  records: Record<string, unknown>[];
  sources: {
    snapshot: number;
    local: number;
    snapshotAt: string | null;
  };
  /** True when at least one record exists only on this device. */
  hasDeviceOnly: boolean;
}

/**
 * Merge what this device knows.
 *
 * Deduplicated by id, with the LOCAL ledger winning. A record can legitimately
 * appear in both when a household switches from local-only back to cloud and
 * later imports its file: the imported copy carries the same id, and the local
 * one is the version the user has been looking at.
 *
 * Deliberately does NOT fetch from the server. Every caller is a client
 * component that either already has server data from its own page or is
 * offline, and adding a fetch here would make the one function screens rely on
 * for correctness also the one that fails when the network does.
 */
export async function unifiedRecords(): Promise<UnifiedResult> {
  const [snapshot, local] = await Promise.all([
    loadLocal().catch(() => null),
    listLocalRecords().catch(() => []),
  ]);

  const fromSnapshot = Array.isArray(snapshot?.transactions)
    ? (snapshot!.transactions as Record<string, unknown>[])
    : [];
  const fromLocal = asAnalysable(local);

  const byId = new Map<string, Record<string, unknown>>();
  for (const r of fromSnapshot) {
    const id = String(r.id ?? "");
    if (id) byId.set(id, r);
  }
  // Second, so a local row overwrites a snapshot row of the same id.
  for (const r of fromLocal) {
    const id = String(r.id ?? "");
    if (id) byId.set(id, r);
  }

  const records = [...byId.values()].sort((a, b) =>
    String(b.occurred_at ?? "").localeCompare(String(a.occurred_at ?? "")),
  );

  return {
    records,
    sources: {
      snapshot: fromSnapshot.length,
      local: fromLocal.length,
      snapshotAt: (snapshot?.exportedAt as string | undefined) ?? null,
    },
    hasDeviceOnly: fromLocal.length > 0,
  };
}

/**
 * A snapshot object shaped for lib/localAnalysis.ts, carrying the merge.
 *
 * The analysis module takes "something with a transactions array", so handing
 * it the merged set means every figure it computes — totals, buckets, months,
 * merchants — covers the device-only records without the analysis module
 * needing to know they exist.
 */
export async function unifiedSnapshot(): Promise<{
  snapshot: {
    exportedAt?: string;
    transactions: Record<string, unknown>[];
    nodes: unknown[];
    hscoreSnapshots: unknown[];
  };
  sources: UnifiedResult["sources"];
  hasDeviceOnly: boolean;
}> {
  const [merged, snapshot] = await Promise.all([unifiedRecords(), loadLocal().catch(() => null)]);
  return {
    snapshot: {
      exportedAt: (snapshot?.exportedAt as string | undefined) ?? undefined,
      transactions: merged.records,
      // Labels for buckets and merchants come from the graph in the snapshot.
      // A device-only record references a bucket id that the snapshot can name,
      // which is why the nodes are carried through rather than dropped.
      nodes: Array.isArray(snapshot?.nodes) ? (snapshot!.nodes as unknown[]) : [],
      hscoreSnapshots: Array.isArray(snapshot?.hscoreSnapshots)
        ? (snapshot!.hscoreSnapshots as unknown[])
        : [],
    },
    sources: merged.sources,
    hasDeviceOnly: merged.hasDeviceOnly,
  };
}
