"use client";

import { applyRates, type RateTable } from "@/lib/format";

// Ships the server-fetched rate table into the browser bundle's copy of
// format.ts, so client components (capture, charts) convert with the same live
// rates the server rendered with. Renders nothing.
export default function FxRates({ table }: { table: RateTable }) {
  applyRates(table);
  return null;
}
