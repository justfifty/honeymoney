"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CURRENCIES } from "@/lib/format";

// Display-currency switcher — sets ?ccy= while preserving every other param.
// Converts all shown amounts from the base (MYR) at an approximate rate.
export default function CurrencySwitcher({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(ccy: string) {
    const next = new URLSearchParams(params.toString());
    next.set("ccy", ccy);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <label className="flex items-center gap-1 text-xs text-zinc-500">
      <span aria-hidden>💱</span>
      <select
        value={current}
        onChange={(e) => set(e.target.value)}
        aria-label="Display currency"
        className="rounded-md border border-zinc-300 bg-transparent px-1.5 py-1 text-xs text-inherit outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900"
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
        ))}
      </select>
    </label>
  );
}
