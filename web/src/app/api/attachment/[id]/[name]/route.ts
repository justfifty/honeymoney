import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireContext } from "@/lib/household";
import { pbFirst, pbList, pbStr, pbFileResponse } from "@/lib/pocketbase";
import { isDatabaseConfigured } from "@/lib/config";
import { isRedacted, privateBucketIds } from "@/lib/privacy";
import { apiError } from "@/lib/apiError";

export const runtime = "nodejs";

// GET /api/attachment/<transactionId>/<filename>[?thumb=100x100]
//
// The `transactions` collection is superuser-only, so its files have no
// browser-reachable URL — the superuser token is what opens them and it never
// leaves the server. This route is that door, and it is the ONLY one. Four
// things are checked before a byte is returned, in this order because each is
// cheaper than the next:
//
//  1. Signed in at all. Attachments are never public — the demo household has
//     none, and a signed-out visitor has no household to read.
//  2. The record belongs to the caller's tenant. Without this, a transaction id
//     from another household would serve that household's receipt.
//  3. The filename is one this record actually holds. PocketBase would refuse an
//     unrelated name anyway, but checking here means a caller cannot use the
//     response to probe which filenames exist.
//  4. The row is not another member's private-bucket spend. This is the check
//     with teeth: lib/privacy.ts empties `attachments` in the list payload, but
//     that only stops the UI from OFFERING the image. A partner who kept an old
//     URL, or who guessed one, is stopped here and nowhere else.
//
// Thumbnails come from PocketBase's own `?thumb=` — the brief is explicit that
// they are not generated client-side — and only from a fixed set, so the query
// string cannot be used to make the origin render arbitrary sizes on demand.
const ALLOWED_THUMBS = new Set(["100x100", "400x0"]);

interface TxnRow {
  id: string;
  tenant: string;
  member?: string | null;
  wallet_node?: string | null;
  attachments?: string[] | string | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; name: string }> },
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const ctx = await requireContext(); // 1 — throws 401 when signed out
    const { id, name } = await params;
    const filename = decodeURIComponent(name);

    const txn = await pbFirst<TxnRow>(
      "transactions",
      `id = ${pbStr(id)} && tenant = ${pbStr(ctx.tenant.id)}`, // 2
    );
    // Deliberately the same 404 as a genuinely missing file: a distinct 403 here
    // would confirm that a given transaction id exists in someone else's books.
    if (!txn) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const held = Array.isArray(txn.attachments)
      ? txn.attachments
      : txn.attachments
        ? [txn.attachments]
        : [];
    if (!held.includes(filename)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 }); // 3
    }

    // 4 — the tier-3 promise, enforced on the bytes rather than on the markup.
    const buckets = await pbList<{ id: string; kind: string; props: Record<string, unknown> | null }>(
      "nodes",
      { filter: `tenant = ${pbStr(ctx.tenant.id)} && kind = 'bucket'` },
    );
    const redacted = isRedacted(
      { bucketId: txn.wallet_node ?? null, memberId: txn.member ?? null },
      { privateIds: privateBucketIds(buckets), viewerMemberId: ctx.memberId, enabled: true },
    );
    if (redacted) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const thumbParam = request.nextUrl.searchParams.get("thumb");
    const thumb = thumbParam && ALLOWED_THUMBS.has(thumbParam) ? thumbParam : undefined;

    let upstream = await pbFileResponse("transactions", id, filename, { thumb });

    // A thumb can fail where the original is perfectly fine — HEIC is the one
    // that bites, since iPhones shoot it by default and the resizer cannot read
    // it. Falling back to the full image costs bandwidth on that row and shows
    // the user their receipt; refusing shows them a broken frame and no reason.
    if (thumb && !upstream.ok) {
      upstream = await pbFileResponse("transactions", id, filename);
    }
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "Attachment unavailable" }, { status: 502 });
    }

    // `private` matters: this is one household's receipt, and a shared cache in
    // front of the tunnel must never hand it to the next person asking for the
    // same URL. immutable is safe alongside it — PocketBase filenames carry a
    // random suffix, so a given name's bytes never change.
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
