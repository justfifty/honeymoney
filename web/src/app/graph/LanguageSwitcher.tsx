"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n";

// Language switcher — sets ?lang= while preserving every other query param, so a
// person/lens/mode selection survives a language change. Dependency-free.
export default function LanguageSwitcher({ current }: { current: Locale }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(lang: string) {
    const next = new URLSearchParams(params.toString());
    next.set("lang", lang);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <label className="flex items-center gap-1 text-xs text-zinc-500">
      <span aria-hidden>🌐</span>
      <select
        value={current}
        onChange={(e) => set(e.target.value)}
        aria-label="Language"
        className="rounded-md border border-zinc-300 bg-transparent px-1.5 py-1 text-xs text-inherit outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>{LOCALE_LABEL[l]}</option>
        ))}
      </select>
    </label>
  );
}
