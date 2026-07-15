"use client";

import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_LABEL, LOCALE_SHORT, type Locale } from "@/lib/i18n";

// Language switcher — writes the `hm_lang` cookie (kept in sync with
// lib/locale.ts LOCALE_COOKIE) and refreshes, so the choice applies to EVERY
// page (header/footer included), not just the current URL. Dependency-free.
export default function LanguageSwitcher({ current, label = "Language" }: { current: Locale; label?: string }) {
  const router = useRouter();

  function set(lang: string) {
    document.cookie = `hm_lang=${lang}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <label className="flex items-center gap-1 text-xs text-zinc-500">
      <span aria-hidden className="hidden sm:inline">🌐</span>
      <select
        value={current}
        onChange={(e) => set(e.target.value)}
        aria-label={label}
        className="rounded-md border border-zinc-300 bg-transparent px-1 py-0.5 text-xs text-inherit outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} title={LOCALE_LABEL[l]}>{LOCALE_SHORT[l]}</option>
        ))}
      </select>
    </label>
  );
}
