import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import Logo from "../Logo";
import DirectoryBrowser from "./DirectoryBrowser";

export const metadata = {
  title: "Directory — licensed Malaysian providers",
  description:
    "A catalogue of licensed Malaysian financial providers by category. Every listing names its regulator and licence. Listed, never ranked, and never a recommendation.",
};

// Public and unauthenticated on purpose: nothing here depends on a household,
// and requiring a login to read a list of regulated providers would be the
// opposite of the point. It also means the catalogue can be linked to from
// outside the app — which is what makes "check the regulator yourself" a real
// instruction rather than a gesture.
export default async function DirectoryPage() {
  const locale = await getLocale();
  const tr = (k: string) => t(locale, k);

  return (
    <main className="mx-auto min-h-full w-full max-w-lg px-4 py-5 sm:px-6">
      <header className="mb-4 flex items-baseline justify-between gap-2">
        <h1 className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
          <Logo size={22} /> {tr("dir.title")}
        </h1>
        <Link href="/more" className="text-xs text-zinc-500 hover:underline">
          {tr("more.title")}
        </Link>
      </header>

      <DirectoryBrowser lang={locale} />
    </main>
  );
}
