import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";

export default async function Home() {
  const locale = await getLocale();
  const tr = (k: string) => t(locale, k);

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-amber-50 to-white px-6 py-20 text-center dark:from-zinc-950 dark:to-black">
      <span className="mb-4 rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        {tr("home.badge")}
      </span>
      <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
        🍯 HoneyMoney
      </h1>
      <p className="mt-4 max-w-xl text-lg text-zinc-600 dark:text-zinc-400 sm:max-w-none sm:whitespace-nowrap">
        {tr("home.tagline")}
      </p>
      <p className="mt-3 max-w-xl text-xl font-semibold text-amber-700 dark:text-amber-300">
        {tr("home.slogan")}
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/dashboard"
          className="rounded-full bg-amber-500 px-6 py-3 font-medium text-white transition-colors hover:bg-amber-600"
        >
          {tr("home.ctaDemo")} →
        </Link>
        <a
          href="https://github.com/justfifty/honeymoney"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-zinc-300 px-6 py-3 font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {tr("home.ctaRepo")}
        </a>
      </div>

      {/* accounts */}
      <div className="mt-4 flex items-center gap-3 text-sm">
        <Link href="/login" className="font-medium text-amber-600 hover:underline">{tr("auth.login")}</Link>
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        <Link href="/signup" className="font-medium text-amber-600 hover:underline">{tr("auth.createAccount")}</Link>
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        <Link href="/admin" className="text-zinc-500 hover:underline">{tr("auth.admin")}</Link>
      </div>

      <div className="mt-16 grid max-w-3xl gap-6 text-left sm:grid-cols-3">
        <Feature title={tr("home.card1.title")} body={tr("home.card1.body")} />
        <Feature title={tr("home.card2.title")} body={tr("home.card2.body")} />
        <Feature title={tr("home.card3.title")} body={tr("home.card3.body")} />
      </div>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{body}</p>
    </div>
  );
}
