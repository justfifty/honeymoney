import Link from "next/link";
import type { Metadata } from "next";
import { getContext } from "@/lib/household";
import Logo from "../Logo";
import LocalVault from "./LocalVault";

export const metadata: Metadata = {
  title: "Your copy · HoneyMoney",
  description:
    "Keep a complete, current copy of your records in a location you choose — your phone, a drive, anywhere — and read and analyse it with no network at all.",
};

export default async function VaultPage() {
  const ctx = await getContext().catch(() => null);

  if (!ctx) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-3xl font-bold tracking-tight">Your copy</h1>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          <Link href="/login?next=/vault" className="text-amber-600 hover:underline">
            Sign in
          </Link>{" "}
          to keep a copy of your records somewhere you choose.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
          <Logo size={24} /> Your copy
        </h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/setup" className="text-zinc-500 hover:underline">
            Settings
          </Link>
          <Link href="/sharing" className="text-zinc-500 hover:underline">
            Sharing
          </Link>
        </nav>
      </header>

      <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        Keep the whole of your records in a place you choose — a folder on this phone, an SD card, a
        USB stick, or a synced Drive or OneDrive folder. It updates whenever you ask, it reads and
        analyses without any network, and it stays yours whatever happens to us.
      </p>

      <div className="mt-10">
        <LocalVault />
      </div>

      {/* The honest boundary. Without this section the page reads as "your data
          only lives on your device", which is not true and is exactly the
          overclaim this feature was built to start correcting. */}
      <section className="mt-12 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold">What this does and does not change</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
            <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              True now
            </h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-emerald-900 dark:text-emerald-200">
              <li>You hold a complete, current copy, in a location you picked.</li>
              <li>It reads and analyses with the network off, on this device.</li>
              <li>Receipts are read on your device and never uploaded unless you ask.</li>
              <li>Spending you record offline is kept here and sent when you reconnect.</li>
              <li>You can leave whenever you like and take the lot with you.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20">
            <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Not true yet
            </h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              <li>
                Your records are still stored on our server too, in readable form, and we can read
                them. This copy is an addition, not a replacement.
              </li>
              <li>
                Recording a new spend still needs the network. Offline captures queue on the device
                and send later.
              </li>
              <li>
                The H-Score and the forecast are computed on our server. Offline you see the last
                one, dated.
              </li>
            </ul>
          </div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-zinc-500">
          If you want something in HoneyMoney that we genuinely cannot read, that is the{" "}
          <Link href="/setup" className="underline underline-offset-2">
            sealed backup
          </Link>{" "}
          — encrypted in your own browser with a passphrase we never receive. The full position is
          in the{" "}
          <Link href="/privacy#recipients" className="underline underline-offset-2">
            Privacy notice
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
