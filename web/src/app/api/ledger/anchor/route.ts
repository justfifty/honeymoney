import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { requirePermission, requireContext } from "@/lib/household";
import { anchorHead, listAnchors } from "@/lib/ledger";
import { apiError } from "@/lib/apiError";
import { pbFirst, pbStr } from "@/lib/pocketbase";

export const runtime = "nodejs";

// POST /api/ledger/anchor — submit the ledger's head hash to OpenTimestamps,
// which batches it into the Bitcoin blockchain.
//
// Only a 32-byte hash leaves the device. It reveals nothing about the spending
// it commits to, but it makes the history impossible to rewrite after the fact:
// to fake a different past you would have to also rewrite Bitcoin.
export async function POST() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requirePermission("manage_graph");
    const anchor = await anchorHead(ctx.tenant.id);
    return NextResponse.json({
      ok: anchor.status !== "failed",
      anchor: {
        id: anchor.id,
        rootHash: anchor.root_hash,
        fromSeq: anchor.from_seq,
        toSeq: anchor.to_seq,
        status: anchor.status,
        detail: anchor.detail,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}

// GET /api/ledger/anchor?id=… — download the .ots proof for an anchor.
//
// This file is the whole point of anchoring: it is verifiable *without us*.
// Run `ots verify` on it, or drop it at opentimestamps.org, and you get an
// independent answer about when that hash existed.
export async function GET(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requireContext();
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    const anchors = await listAnchors(ctx.tenant.id, 1);
    const target = id
      ? await pbFirst<{ id: string; root_hash: string; proof_b64: string }>(
          "ledger_anchors",
          `id = ${pbStr(id)} && tenant = ${pbStr(ctx.tenant.id)}`,
        )
      : anchors[0]
        ? { id: anchors[0].id, root_hash: anchors[0].root_hash, proof_b64: anchors[0].proof_b64 }
        : null;

    if (!target?.proof_b64) {
      return NextResponse.json({ error: "No proof available for that anchor." }, { status: 404 });
    }

    const bytes = Buffer.from(target.proof_b64, "base64");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="honeymoney-${target.root_hash.slice(0, 12)}.ots"`,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
