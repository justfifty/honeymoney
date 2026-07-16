import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import Logo from "../Logo";
import MoneyQuiz from "./MoneyQuiz";

export const metadata = {
  title: "Learn — HoneyMoney Academy",
  description: "A friendly money quiz for kids and families — learn to save, spend wisely, and understand the 3 buckets.",
};

// HoneyMoney Academy (v1): a gamified, kid-friendly money-management quiz for
// financial literacy (SDG 4). Educational, not advice; scores learning only,
// stores nothing personal. Open to everyone — no sign-in needed to play.
export default async function LearnPage() {
  const locale = await getLocale();
  const tr = (k: string) => t(locale, k);

  return (
    <main className="mx-auto min-h-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Logo size={24} /> {tr("learn.title")}
        </h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/guide" className="text-zinc-500 hover:underline">{tr("nav.guide")}</Link>
          <Link href="/dashboard" className="text-zinc-500 hover:underline">{tr("nav.dashboard")}</Link>
        </nav>
      </header>
      <p className="mt-2 text-sm text-zinc-500">{tr("learn.subtitle")}</p>

      <div className="mt-6">
        <MoneyQuiz />
      </div>

      <p className="mt-6 text-xs text-zinc-400">{tr("learn.note")}</p>
    </main>
  );
}
