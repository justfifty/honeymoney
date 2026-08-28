import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { pbCreate, pbFirst, pbUpdate, pbStr } from "@/lib/pocketbase";

export const runtime = "nodejs";

// POST /api/track — one page-view row per navigation, plus a duration update on
// leave. IP + country come from Cloudflare's edge headers (set by the tunnel).
// Always returns 200 — analytics must never disrupt the visitor.
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false });

  let body: {
    path?: string;
    session?: string;
    referrer?: string;
    duration_ms?: number;
    close?: boolean;
    /** The row this view created, handed back so the leave needs no lookup. */
    viewId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false });
  }

  const path = typeof body.path === "string" ? body.path.slice(0, 200) : "";
  const session = typeof body.session === "string" ? body.session.slice(0, 64) : "";
  if (!path) return NextResponse.json({ ok: false });

  try {
    // Duration update on page leave.
    //
    // This used to look the row up by (session, path) before writing to it,
    // which cost a whole extra round trip to a database in Singapore. Measured:
    // 21 ms to create the row, 67 ms to find it again, 9 ms to write the
    // duration — 97 ms of database work per page view, and the most expensive
    // leg of it was re-deriving an id we had already been handed.
    //
    // The create returns the id now and the browser sends it back, so a leave
    // is one write. The lookup survives only as a fallback for a page that was
    // already open when this shipped and has no id to send.
    if (body.close) {
      const dur = Math.max(0, Math.min(6 * 60 * 60 * 1000, Number(body.duration_ms) || 0));
      const id = typeof body.viewId === "string" ? body.viewId.slice(0, 32) : "";
      if (id) {
        await pbUpdate("page_views", id, { duration_ms: dur }).catch(() => undefined);
      } else if (session) {
        const row = await pbFirst<{ id: string }>(
          "page_views",
          `session = ${pbStr(session)} && path = ${pbStr(path)}`,
          { sort: "-created" },
        );
        if (row) await pbUpdate("page_views", row.id, { duration_ms: dur });
      }
      return NextResponse.json({ ok: true });
    }

    // New page view — COUNTS, NOT PROFILES. This used to store the visitor's
    // IP, full user-agent, and (when signed in) their account id, which is a
    // per-person browsing history of a finance app: which household looked at
    // /records, when, from where. The privacy notice now promises counts that
    // identify nobody, so the row holds only what a count needs: the page, the
    // country (Cloudflare's coarse header, no IP retained to derive it from),
    // and a random per-visit session id for dedup and duration matching that
    // is minted client-side and linked to no account.
    //
    // The referrer is kept for "where do visitors come from", but only its
    // origin + path: query strings carry tokens and search terms, which are
    // someone else's data leaking into ours.
    const country = request.headers.get("cf-ipcountry") || "";
    let referrer = "";
    if (typeof body.referrer === "string" && body.referrer) {
      try {
        const u = new URL(body.referrer);
        referrer = (u.origin + u.pathname).slice(0, 300);
      } catch {
        /* not a URL — drop it rather than store free text */
      }
    }

    const created = await pbCreate<{ id: string }>("page_views", {
      path,
      referrer,
      country,
      session,
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
