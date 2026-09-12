import { NextResponse } from "next/server";
import {
  isSupabaseConfigured,
  isGeminiConfigured,
  config,
} from "@/lib/config";
import { probeLedger } from "@/lib/pocketbase";

export const runtime = "nodejs";
// A readiness probe that can be answered from cache is not a readiness probe.
export const dynamic = "force-dynamic";

/**
 * Readiness probe — and, since 2026-09-13, an HONEST one.
 *
 * It used to report `pocketbase: isPocketBaseConfigured()`, i.e. "are three
 * environment variables set". That answer was true and green for the entire
 * outage in which no page could read a single record, because what had broken
 * was the TLS chain to the ledger and not the configuration of it. A monitor
 * that cannot go red is decoration.
 *
 * `ok` now means what an operator assumes it means: this app can serve a
 * household its records. `integrations.pocketbase` follows the same rule —
 * REACHABLE, not merely configured.
 *
 * ── WHY IT STILL RETURNS HTTP 200 WHEN THE LEDGER IS DOWN ─────────────────
 *
 * Two things read this URL and both key off the status code. The edge worker
 * picks between origins on it, and failing over would be pointless here —
 * both origins read the SAME PocketBase, so a ledger outage is not something a
 * different origin can serve around, and the switch would only spend a second
 * origin's timeout on every request. `honeymoney-warm` knocks every 3 minutes
 * to keep Passenger resident, and a non-2xx would read as "host down" for a
 * host that is up and needs warming as much as ever.
 *
 * So the status code keeps answering "is this app running" and the body
 * answers "can it do its job". Read `ok`, not the status, when you want the
 * second question.
 */
export async function GET() {
  const ledger = await probeLedger();

  return NextResponse.json({
    ok: ledger.reachable,
    service: "honeymoney",
    integrations: {
      // Reachability, not configuration — see the note above.
      pocketbase: ledger.reachable,
      supabase: isSupabaseConfigured(),
      gemini: isGeminiConfigured(),
      demoTenant: Boolean(config.demoTenantId),
    },
    // The diagnosis, not just the verdict. When this goes red the `error`
    // string is the difference between "the ledger is unreachable" and
    // "UNABLE_TO_VERIFY_LEAF_SIGNATURE", which is the whole investigation.
    ledger,
  });
}
