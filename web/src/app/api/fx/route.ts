import { NextResponse } from "next/server";
import { getRates, SOURCE_LABEL } from "@/lib/fx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/fx        — the live rate table, with the source of every rate.
// GET /api/fx?force=1 — bypass the 6h cache and re-poll the central banks.
//
// Exposed so the rates are auditable: anyone (a judge, a user, us) can see
// exactly which rate was applied, where it came from, and when it was published.
export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("force") === "1";
  try {
    const { table, fetchedAt, sources, live } = await getRates({ force });
    return NextResponse.json({
      base: "MYR",
      live,
      fetchedAt,
      sources: sources.map((s) => ({ id: s, label: SOURCE_LABEL[s] })),
      rates: Object.fromEntries(
        Object.entries(table).map(([code, r]) => [
          code,
          {
            perMYR: r.perMYR,
            source: r.source,
            sourceLabel: SOURCE_LABEL[r.source],
            sourceUrl: r.sourceUrl,
            asOf: r.asOf,
            ...(r.staleFrom ? { originallyFrom: r.staleFrom } : {}),
          },
        ]),
      ),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "FX lookup failed" },
      { status: 502 },
    );
  }
}
