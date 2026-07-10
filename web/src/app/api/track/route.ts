import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { pbCreate, pbFirst, pbUpdate, pbStr } from "@/lib/pocketbase";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/track — one page-view row per navigation, plus a duration update on
// leave. IP + country come from Cloudflare's edge headers (set by the tunnel).
// Always returns 200 — analytics must never disrupt the visitor.
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: false });

  let body: { path?: string; session?: string; referrer?: string; duration_ms?: number; close?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false });
  }

  const path = typeof body.path === "string" ? body.path.slice(0, 200) : "";
  const session = typeof body.session === "string" ? body.session.slice(0, 64) : "";
  if (!path) return NextResponse.json({ ok: false });

  try {
    // duration update on page leave
    if (body.close) {
      const dur = Math.max(0, Math.min(6 * 60 * 60 * 1000, Number(body.duration_ms) || 0));
      if (session) {
        const row = await pbFirst<{ id: string }>(
          "page_views",
          `session = ${pbStr(session)} && path = ${pbStr(path)}`,
          { sort: "-created" },
        );
        if (row) await pbUpdate("page_views", row.id, { duration_ms: dur });
      }
      return NextResponse.json({ ok: true });
    }

    // new page view
    const h = request.headers;
    const ip =
      h.get("cf-connecting-ip") ||
      (h.get("x-forwarded-for") || "").split(",")[0].trim() ||
      "";
    const country = h.get("cf-ipcountry") || "";
    const ua = (h.get("user-agent") || "").slice(0, 300);
    const referrer = typeof body.referrer === "string" ? body.referrer.slice(0, 300) : "";
    const user = await getSessionUser().catch(() => null);

    await pbCreate("page_views", {
      path,
      referrer,
      ip,
      country,
      ua,
      session,
      user: user?.id ?? "",
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
