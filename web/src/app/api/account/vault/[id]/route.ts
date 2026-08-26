import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { requireContext } from "@/lib/household";
import { apiError } from "@/lib/apiError";
import { getVault, removeVault } from "@/lib/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET    /api/account/vault/[id] — hand back one sealed envelope, verbatim.
// DELETE /api/account/vault/[id] — forget it.
//
// "Verbatim" is load-bearing. The envelope's own parameters are bound into the
// cipher as additional authenticated data (lib/e2ee.ts), so a server that
// helpfully re-serialised it — reordered a key, restamped a date, trimmed a
// field it thought was unused — would hand back something that no longer opens.
// It is stored as one string and returned as one string for that reason.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requireContext();
    const { id } = await params;
    // Scoped to the user, not just the household: /api/account/export exports
    // what the VIEWER may see, so a vault is one person's sealed copy of their
    // own view. It would be ciphertext to a partner in any case — this simply
    // does not hand it to them to attempt.
    const vault = await getVault(id, ctx.tenant.id, ctx.user.id);
    if (!vault) return NextResponse.json({ error: "No such backup." }, { status: 404 });
    return NextResponse.json({ ok: true, vault });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requireContext();
    const { id } = await params;
    const gone = await removeVault(id, ctx.tenant.id, ctx.user.id);
    if (!gone) return NextResponse.json({ error: "No such backup." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
