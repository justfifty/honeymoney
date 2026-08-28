// Server-side locale resolution. The chosen language is stored in a cookie so
// EVERY server component — including the root layout's header/footer, which never
// receive `searchParams` — can render in the right language. The LanguageSwitcher
// (client) writes this cookie and calls router.refresh().
import { cache } from "react";
import { cookies } from "next/headers";
import { normalizeLocale, type Locale } from "./i18n";

export const LOCALE_COOKIE = "hm_lang";

// Memoized per request: the layout, the header, the footer, the bottom nav and
// the page each ask for the language independently, and every one of those was
// its own async cookie read.
export const getLocale = cache(async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  return normalizeLocale(jar.get(LOCALE_COOKIE)?.value);
});
