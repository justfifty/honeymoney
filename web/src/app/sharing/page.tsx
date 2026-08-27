import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/household";
import Logo from "../Logo";
import SharingControls from "./SharingControls";
import ShareLog from "./ShareLog";

export const metadata: Metadata = {
  title: "Sharing · HoneyMoney",
  description:
    "Choose, per kind of data, what your household can see — and see who has looked. Almost everything is private until you say otherwise.",
};

export default async function SharingPage() {
  const ctx = await getContext().catch(() => null);

  if (!ctx) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-3xl font-bold tracking-tight">Sharing</h1>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          <Link href="/login?next=/sharing" className="text-amber-600 hover:underline">
            Sign in
          </Link>{" "}
          to choose what your household can see.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
          <Logo size={24} /> Sharing
        </h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/setup" className="text-zinc-500 hover:underline">
            Settings
          </Link>
          <Link href="/privacy" className="text-zinc-500 hover:underline">
            Privacy
          </Link>
        </nav>
      </header>

      {/* The headline claim, stated before the controls rather than after. A
          user who arrives here worried needs the answer in the first sentence,
          not at the bottom of eight toggles. */}
      <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        <strong>Your individual transactions are private by default</strong>, and so are your
        receipts, goals, score and forecast. What your household sees by default is what it needs to
        run: the bills that must be paid, and the total each person put in. Everything else is off
        until you switch it on.
      </p>

      <div className="mt-10">
        <SharingControls />
      </div>

      <section className="mt-12 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold">Who has looked</h2>
        <div className="mt-3">
          <ShareLog />
        </div>
      </section>

      <footer className="mt-12 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">
        <p>
          How all of this is described in law:{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy notice
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="underline underline-offset-2">
            Terms
          </Link>{" "}
          ·{" "}
          <Link href="/sharing/leave" className="underline underline-offset-2">
            Leaving and safety
          </Link>
        </p>
      </footer>
    </main>
  );
}
