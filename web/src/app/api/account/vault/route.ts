import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { requireContext } from "@/lib/household";
import { apiError } from "@/lib/apiError";
import { listVaults, putVault, MAX_ENVELOPE_BYTES, NotSealed, VaultNotInstalled } from "@/lib/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/account/vault — the sealed backup endpoint.
//
// GET  → this user's vault copies, metadata only. No ciphertext: a list is a
//        list, and shipping every blob to render four rows is bandwidth spent
//        moving something nobody asked to open yet.
// POST → store one sealed envelope.
//
// The POST body is ciphertext the server cannot read and does not try to. What
// it DOES do is refuse anything that is not ciphertext — see assertOpaque in
// lib/vault.ts for why that check guards against our own future mistakes rather
// than against the client.
//
// There is deliberately no PATCH. A backup is a point in time; editing one in
// place would produce a file whose label says one thing and whose contents are
// another, and the label is the only part we can read.

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requireContext();
    return NextResponse.json({ ok: true, vaults: await listVaults(ctx.tenant.id, ctx.user.id) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requireContext();

    // Read the body as TEXT first and measure it, rather than parsing a
    // multi-megabyte string into memory and then deciding it was too big.
    const raw = await request.text();
    if (raw.length > MAX_ENVELOPE_BYTES) {
      return NextResponse.json(
        { error: `That backup is larger than ${Math.round(MAX_ENVELOPE_BYTES / 1024 / 1024)} MB.` },
        { status: 413 },
      );
    }
    let body: { vault?: unknown; label?: string };
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const summary = await putVault(
      ctx.tenant.id,
      ctx.user.id,
      body.vault,
      typeof body.label === "string" ? body.label : "",
    );
    return NextResponse.json({ ok: true, vault: summary });
  } catch (err) {
    // A 422 rather than a 500: the payload was understood and rejected, and the
    // reason is safe to show — it says what shape was expected, never anything
    // about what arrived.
    if (err instanceof NotSealed) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    // 503, not 500: the feature is off for this deployment, the user did
    // nothing wrong, and the sealed file they are holding is still perfectly
    // good — they can download it instead.
    if (err instanceof VaultNotInstalled) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return apiError(err);
  }
}
