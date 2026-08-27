"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listLocalRecords, syncLedger, type LocalRecord } from "@/lib/localLedger";

// Step 2 of the unification: the server-rendered screens stop being the whole
// truth and start saying so, with the local half beside them.
//
// ── WHY AN OVERLAY AND NOT A REWRITE ───────────────────────────────────────
//
// The honest end state is that /dashboard, /records and /graph render from the
// merged local source. Getting there means converting four server components
// that do real work — bucket projection, the money view, the graph layout —
// into client components that read IndexedDB. That is a rewrite of the parts of
// this app most likely to be wrong in a way nobody notices, immediately before
// a deadline.
//
// So the merge arrives in two moves. This is the first: the server keeps
// rendering what it has, and this puts the records it does not have on top,
// with their totals. Nothing that works today can break, because nothing that
// works today is touched — and the screens stop under-reporting, which was the
// actual defect.
//
// The second move replaces the server-rendered figures with merged ones. It is
// safe to do incrementally, one view at a time, once these numbers have been
// watched agreeing with the server's on a real device.
//
// ── WHAT COUNTS AS "NOT ON THE SERVER" ─────────────────────────────────────
//
// A record with no `syncedAt`. That covers three different situations that all
// look identical to the user and should: recorded offline and not yet sent;
// recorded in local-only mode and never to be sent; and sent but not yet
// acknowledged. The distinction matters to the sync code and to nobody else.

function fmt(n: number, currency = "MYR"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function LocalOverlay({ where }: { where?: string }) {
  const [rows, setRows] = useState<LocalRecord[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      // Try to drain first, so a record that CAN reach the server does, and
      // this box shows only what genuinely is not there. Without it the
      // overlay would announce records that were about to sync a second later
      // and train people to ignore it.
      await syncLedger().catch(() => undefined);
      const all = await listLocalRecords().catch(() => []);
      if (alive) setRows(all.filter((r) => !r.syncedAt));
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!rows || rows.length === 0) return null;

  const out = rows.filter((r) => r.direction === "out").reduce((s, r) => s + r.amount, 0);
  const inn = rows.filter((r) => r.direction === "in").reduce((s, r) => s + r.amount, 0);
  const currency = rows[0]?.currency ?? "MYR";
  const localOnly = rows.some((r) => r.origin === "local_only");

  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-amber-900 dark:text-amber-200">
          {rows.length} {rows.length === 1 ? "record is" : "records are"} on this device and not in{" "}
          {where ?? "these figures"}
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium text-amber-800 underline underline-offset-2 dark:text-amber-300"
        >
          {open ? "Hide" : "Show them"}
        </button>
      </div>

      <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
        {out > 0 && <>Out {fmt(out, currency)}. </>}
        {inn > 0 && <>In {fmt(inn, currency)}. </>}
        {localOnly
          ? "Your household keeps its records on its own devices, so these stay here."
          : "They will fold into the figures above once they sync."}{" "}
        <Link href="/vault" className="font-medium underline underline-offset-2">
          See everything added up
        </Link>
      </p>

      {open && (
        <ul className="mt-3 space-y-1 border-t border-amber-300/60 pt-2 dark:border-amber-800/60">
          {rows.slice(0, 20).map((r) => (
            <li
              key={r.id}
              className="flex items-baseline justify-between gap-3 text-xs text-amber-900 dark:text-amber-200"
            >
              <span className="min-w-0 flex-1 truncate">
                {r.vendorLabel || "(no name)"}
                <span className="ml-2 opacity-70">{r.occurred_at.slice(0, 10)}</span>
              </span>
              <span className="tabular-nums">
                {r.direction === "in" ? "+" : "−"}
                {fmt(r.amount, r.currency)}
              </span>
            </li>
          ))}
          {rows.length > 20 && (
            <li className="text-xs opacity-70">…and {rows.length - 20} more.</li>
          )}
        </ul>
      )}
    </div>
  );
}
