// Proactive Honey agent: scan every active household's projection and, when a
// bucket is heading over/at-risk this month, send a marital-safe, forward-looking
// nudge to the household's linked Telegram chat — BEFORE the shortfall, not after.
// Meant to run on a schedule (see /api/insight/nudge).

import { pbList, pbStr } from "./pocketbase";
import { getBucketProjection } from "./projection";
import { isTelegramConfigured } from "./config";
import { sendMessage } from "./telegram";
import type { BucketProjection } from "./types";

interface TenantRow {
  id: string;
  name: string;
  deleted_at?: string;
}
interface ChannelLink {
  external_id: string;
}

export async function runProactiveNudges(): Promise<{ scanned: number; nudged: number; households: string[] }> {
  if (!isTelegramConfigured()) return { scanned: 0, nudged: 0, households: [] };

  // List all tenants and skip soft-deleted ones by field, so this works whether
  // or not the soft-delete migration has been applied yet.
  const tenants = (await pbList<TenantRow>("tenants", { perPage: 500 })).filter((t) => !t.deleted_at);

  let nudged = 0;
  const names: string[] = [];
  for (const t of tenants) {
    let projection: BucketProjection[];
    try {
      projection = await getBucketProjection(t.id);
    } catch {
      continue; // a broken household never blocks the rest of the sweep
    }
    const flagged = projection.filter((b) => b.status === "over_budget" || b.status === "at_risk");
    if (!flagged.length) continue;

    const links = await pbList<ChannelLink>("channel_links", {
      filter: `tenant = ${pbStr(t.id)} && channel = 'telegram'`,
    });
    if (!links.length) continue;

    const msg = composeNudge(flagged);
    let sent = false;
    for (const l of links) {
      try {
        await sendMessage(l.external_id, msg);
        sent = true;
      } catch {
        /* one bad chat id doesn't stop the others */
      }
    }
    if (sent) {
      nudged++;
      names.push(t.name);
    }
  }
  return { scanned: tenants.length, nudged, households: names };
}

// Forward-looking and blame-free — talk about the plan, never the person, and
// never itemise spending. A nudge, not a scolding.
function composeNudge(flagged: BucketProjection[]): string {
  const over = flagged.find((b) => b.status === "over_budget");
  if (over) {
    const gap = Math.round(Math.abs(over.projected_balance));
    return `🍯 Heads up — at this month's pace, ${over.bucket_label} is heading about RM${gap} over plan. Nothing's wrong yet — want to rebalance together before month-end? Open HoneyMoney when you two have a minute.`;
  }
  const b = flagged[0];
  return `🍯 Gentle nudge — ${b.bucket_label} is on track to run close to its limit this month. A small tweak now keeps your Savings safe. No rush — just a friendly heads-up from Honey.`;
}
