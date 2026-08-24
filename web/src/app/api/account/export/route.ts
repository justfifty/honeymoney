import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/config";
import { requireContext } from "@/lib/household";
import { apiError } from "@/lib/apiError";
import { pbList, pbStr } from "@/lib/pocketbase";
import { visibleFilter } from "@/lib/attribution";
import { getConsents, NOTICE_VERSION } from "@/lib/consent";

export const runtime = "nodejs";

// GET /api/account/export — everything this account can see, as one JSON file.
//
// This exists because the 2024 PDPA amendments added a data portability right,
// and because a product whose pitch is "your money, your records" cannot
// reasonably make leaving hard. It is also the cheapest possible answer to a
// judge or a regulator asking what we actually hold: run it, read it.
//
// TWO DECISIONS WORTH KNOWING ABOUT.
//
// 1. It exports what the VIEWER may see, not what the household contains.
//    Portability is a right over your own personal data, and a spouse's records
//    marked private are not that. So the same `visibleFilter` that redacts the
//    screen redacts the file — one boundary, enforced once. Exporting the raw
//    household would turn a privacy feature into a one-click bypass of itself,
//    which is precisely the shape of breach that gets written up.
//
// 2. Credentials are never exported. tenant_ai_keys holds an encrypted
//    third-party API key; it is the household's property but it is not their
//    personal data, and putting recoverable billing credentials into a file
//    that lands in a Downloads folder is a worse outcome than the mild
//    inconvenience of re-entering it. Same reasoning as key_last4 in the
//    migration: displaying a key is not a feature.

interface Row {
  id: string;
  [k: string]: unknown;
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const ctx = await requireContext();
    const tenantFilter = `tenant = ${pbStr(ctx.tenant.id)}`;

    const [nodes, edges, transactions, members, hscoreSnapshots, hscoreState, consents] =
      await Promise.all([
        pbList<Row>("nodes", { filter: tenantFilter, perPage: 1000 }),
        pbList<Row>("edges", { filter: tenantFilter, perPage: 1000 }),
        pbList<Row>("transactions", {
          // The viewer's own visibility boundary, not the household's.
          filter: `${tenantFilter} && (${visibleFilter(ctx.memberId)})`,
          sort: "-occurred_at",
          perPage: 2000,
        }),
        pbList<Row>("members", { filter: tenantFilter, perPage: 200 }),
        pbList<Row>("hscore_snapshots", { filter: tenantFilter, sort: "-created", perPage: 500 }),
        pbList<Row>("hscore_state", { filter: tenantFilter, perPage: 10 }),
        getConsents(ctx.user.id),
      ]);

    const payload = {
      // Stamped so a file found on a disk two years from now can be dated and
      // matched to the notice that governed it.
      exportedAt: new Date().toISOString(),
      noticeVersion: NOTICE_VERSION,
      format: "honeymoney.export.v1",
      account: {
        id: ctx.user.id,
        email: ctx.user.email,
        accessRole: ctx.accessRole,
      },
      household: {
        id: ctx.tenant.id,
        name: ctx.tenant.name,
      },
      // What you agreed to and when — part of your data, and the part you are
      // least able to reconstruct from memory.
      consents,
      counts: {
        nodes: nodes.length,
        edges: edges.length,
        transactions: transactions.length,
        members: members.length,
      },
      nodes,
      edges,
      transactions,
      members,
      hscoreSnapshots,
      hscoreState,
      notes: {
        redaction:
          "Transactions another household member marked private are excluded — this is your view, not the household's.",
        credentials: "API keys and passwords are never included in an export.",
      },
    };

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="honeymoney-export-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
