import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { requirePermission, requireContext } from "@/lib/household";
import { apiError } from "@/lib/apiError";
import { MODES, STORAGE_POLICY_VERSION, isStorageMode, localCopyIsAdequate } from "@/lib/storageMode";
import {
  countTenantRecords,
  getStorageMode,
  purgeTenantRecords,
  recordMode,
} from "@/lib/storageModeStore";
import { logShareEvent } from "@/lib/sharingStore";

export const runtime = "nodejs";

// GET  /api/account/storage-mode — where this household's records live.
// POST /api/account/storage-mode — change it. { mode, localCopy?, confirm? }
//
// This is the one endpoint in the application that deletes a household's
// records on purpose, so the guards are worth stating rather than inferring:
//
//   1. OWNER ONLY. Storage mode is a household-wide fact — a household cannot
//      be half local — so it needs the role that governs the household, not
//      merely a signed-in member. `manage_members` is that role.
//   2. AN EXPLICIT CONFIRMATION STRING. Not a boolean. A stray `true` in a
//      malformed body must not be able to destroy a year of records, and the
//      word being typed is the same word the UI shows.
//   3. A VERIFIED LOCAL COPY FIRST. The client states what it holds and when;
//      the server checks that against its own record count. Deleting a
//      household's only copy in order to honour a privacy preference would be
//      the worst possible way to fail at privacy.
//
// Switching BACK to cloud is deliberately not symmetrical: it needs no
// confirmation and destroys nothing, because it only permits future writes. It
// does not restore what was purged, and the response says so.

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requireContext();
    const [state, records] = await Promise.all([
      getStorageMode(ctx.tenant.id),
      countTenantRecords(ctx.tenant.id),
    ]);
    return NextResponse.json({
      ok: true,
      policyVersion: STORAGE_POLICY_VERSION,
      mode: state.mode,
      since: state.since,
      purgedAt: state.purgedAt,
      purgedRecords: state.purgedRecords,
      serverRecords: records,
      canChange: ctx.accessRole === "owner",
      modes: MODES,
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requirePermission("manage_members");

    let body: {
      mode?: string;
      confirm?: string;
      localCopy?: { at?: string; records?: number };
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!isStorageMode(body.mode)) {
      return NextResponse.json({ error: "Unknown storage mode" }, { status: 400 });
    }

    const current = await getStorageMode(ctx.tenant.id);
    if (current.mode === body.mode) {
      return NextResponse.json({ ok: true, mode: body.mode, unchanged: true });
    }

    // ── back to cloud: permissive, and honest about what it does not do ──
    if (body.mode === "cloud") {
      await recordMode({
        tenantId: ctx.tenant.id,
        memberId: ctx.memberId,
        userId: ctx.user.id,
        mode: "cloud",
      });
      return NextResponse.json({
        ok: true,
        mode: "cloud",
        effect: [
          "New records will be stored on our server again, and the H-Score, forecasts, household sharing and Ask Honey start working from now on.",
          "Records deleted when you switched to local-only are NOT restored — we do not have them. To bring them back, import your local copy from Settings.",
        ],
      });
    }

    // ── to local-only: the destructive path ──
    if (body.confirm !== "DELETE FROM SERVER") {
      return NextResponse.json(
        {
          error:
            "This permanently deletes your records from our server. Send confirm: \"DELETE FROM SERVER\" to proceed.",
          required: "DELETE FROM SERVER",
        },
        { status: 428 },
      );
    }

    const serverRecords = await countTenantRecords(ctx.tenant.id);
    const adequate = localCopyIsAdequate(
      { at: body.localCopy?.at, records: body.localCopy?.records },
      serverRecords,
    );
    if (!adequate.ok) {
      // 409, not 400: the request is well-formed and the caller is entitled to
      // make it — the world is simply not yet in a state where it is safe.
      return NextResponse.json(
        { error: adequate.reason, needsLocalCopy: true, serverRecords },
        { status: 409 },
      );
    }

    const purged = await purgeTenantRecords(ctx.tenant.id);
    const purgedAt = new Date().toISOString();

    await recordMode({
      tenantId: ctx.tenant.id,
      memberId: ctx.memberId,
      userId: ctx.user.id,
      mode: "local_only",
      purgedAt,
      purgedRecords: purged.transactions,
      localCopyAt: body.localCopy?.at,
      localCopyRecords: body.localCopy?.records,
    });

    // Everyone in the household is affected by this, so it belongs in the log
    // they can all read — not only in the owner's own settings screen.
    await logShareEvent({
      tenantId: ctx.tenant.id,
      subjectMemberId: ctx.memberId,
      actorMemberId: ctx.memberId,
      actorLabel: ctx.user.name || ctx.user.email,
      kind: "revoke_all",
      detail: `Switched the household to local-only storage and deleted ${purged.transactions} records from the server.`,
    });

    return NextResponse.json({
      ok: true,
      mode: "local_only",
      purged,
      purgedAt,
      effect: [
        `Deleted from our server: ${purged.transactions} records, ${purged.captures} unconfirmed receipt scans, ${purged.nodes} graph nodes, ${purged.edges} links and ${purged.snapshots} score snapshots. We no longer hold them and cannot get them back.`,
        // Said unprompted, because it is the one thing that makes "you hold
        // nothing of mine" untrue today and nobody would think to ask.
        "One honest exception: our encrypted off-site backups are whole-database snapshots on a rolling 14-day cycle, so copies taken before today still contain your records until they age out. We cannot surgically remove one household from a snapshot. After 14 days no backup contains them either.",
        "Your account, your household and the evidence of your privacy choices remain, because you still need to sign in and we still need to be able to prove we honoured this.",
        "New records are stored on this device only. The server will refuse to write them.",
        "Your H-Score, forecasts, household sharing and Ask Honey are now off. Open Your copy to read and analyse your records.",
      ],
    });
  } catch (err) {
    return apiError(err);
  }
}
