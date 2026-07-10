// Server-side locale resolution. The chosen language is stored in a cookie so
// EVERY server component — including the root layout's header/footer, which never
// receive `searchParams` — can render in the right language. The LanguageSwitcher
// (client) writes this cookie and calls router.refresh().
import { cookies } from "next/headers";
import { normalizeLocale, type Locale } from "./i18n";

export const LOCALE_COOKIE = "hm_lang";

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  return normalizeLocale(jar.get(LOCALE_COOKIE)?.value);
}
