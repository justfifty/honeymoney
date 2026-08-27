"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { countLocalRecords } from "@/lib/localLedger";

// "This screen is not showing everything."
//
// The dashboard, the graph and the records list are all rendered on the server
// from the server's database. In local-only mode that database has none of the
// household's records, and records typed on this device exist nowhere else — so
// those screens would render totals that are silently, confidently wrong.
//
// Silently wrong is the specific failure worth engineering against. A household
// that entered a week of spending and watched the dashboard stay still would
// either conclude the app was broken, or — far worse — conclude they had
// underspent and act on it. A budgeting app that under-reports spending is not
// a neutral bug.
//
// So every screen that computes a figure from server data carries this. It is
// not an error state: nothing has gone wrong, the household asked for exactly
// this. It is a boundary marker, and it names where the rest of the numbers are.
//
// Renders nothing at all in the normal case — a household in cloud mode has no
// device-only records and never sees it.

export default function DeviceOnlyNotice({ where }: { where?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    countLocalRecords()
      .then((n) => alive && setCount(n))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (count === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      <strong>
        {count} {count === 1 ? "record is" : "records are"} not counted here.
      </strong>{" "}
      Your household keeps its records on its own devices, so {count === 1 ? "it" : "they"} never
      reached our server — and {where ?? "this page"} is built from what the server has.{" "}
      <Link href="/vault" className="font-medium underline underline-offset-2">
        Your copy
      </Link>{" "}
      adds everything up together.
    </div>
  );
}
