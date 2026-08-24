import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { requireContext } from "@/lib/household";
import { listAnchors, recentEntries, verifyChain , actorLabels } from "@/lib/ledger";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ledger — the household's audit trail, plus a live integrity check.
//
// `chain.ok` is not a stored flag: every hash is recomputed from genesis on each
// call. If someone edited the database underneath the app, this is where it
// shows up.
export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requireContext();
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100);

    const [chain, entries, anchors, labels] = await Promise.all([
      verifyChain(ctx.tenant.id),
      recentEntries(ctx.tenant.id, Number.isFinite(limit) ? limit : 100),
      listAnchors(ctx.tenant.id),
      actorLabels(ctx.tenant.id),
    ]);

    return NextResponse.json({
      chain,
      entries: entries.map((e) => ({
        seq: e.seq,
        op: e.op,
        collection: e.collection,
        recordId: e.record_id,
        hash: e.hash,
        prevHash: e.prev_hash,
        actor: labels.get(e.actor) || e.actor_email || "system",
        at: e.at,
        before: e.before,
        after: e.after,
      })),
      anchors: anchors.map((a) => ({
        id: a.id,
        rootHash: a.root_hash,
        fromSeq: a.from_seq,
        toSeq: a.to_seq,
        provider: a.provider,
        status: a.status,
        detail: a.detail,
        createdAt: a.created,
        hasProof: Boolean(a.proof_b64),
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}
