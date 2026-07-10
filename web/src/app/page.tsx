import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-amber-50 to-white px-6 py-20 text-center dark:from-zinc-950 dark:to-black">
      <span className="mb-4 rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        MAIC Nexus 2026 · Track T3 — Fintech
      </span>
      <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
        🍯 HoneyMoney
      </h1>
      <p className="mt-4 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
        A personal financial wellness app, AI-supported, with no tracking fatigue.
      </p>
      <p className="mt-3 max-w-xl text-xl font-semibold text-amber-700 dark:text-amber-300">
        Happy Wife, Happy Life.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/dashboard"
          className="rounded-full bg-amber-500 px-6 py-3 font-medium text-white transition-colors hover:bg-amber-600"
        >
          Open the demo dashboard →
        </Link>
        <a
          href="https://github.com"
          className="rounded-full border border-zinc-300 px-6 py-3 font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          View the repo
        </a>
      </div>

      {/* accounts */}
      <div className="mt-4 flex items-center gap-3 text-sm">
        <Link href="/login" className="font-medium text-amber-600 hover:underline">Log in</Link>
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        <Link href="/signup" className="font-medium text-amber-600 hover:underline">Create account</Link>
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        <Link href="/admin" className="text-zinc-500 hover:underline">Admin</Link>
      </div>

      <div className="mt-16 grid max-w-3xl gap-6 text-left sm:grid-cols-3">
        <Feature
          title="3-Bucket model"
          body="Fixed non-negotiables, a Future Shield %, and personal wallets where tracking stops — autonomy over surveillance."
        />
        <Feature
          title="Zero-integration capture"
          body="Forward a TNG/MAE/GrabPay screenshot to Telegram; Gemini reads vendor, amount and time automatically."
        />
        <Feature
          title="Knowledge graph"
          body="Money modelled as nodes + edges in Postgres, so Honey warns you when spending velocity threatens a goal."
        />
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
