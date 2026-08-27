import Link from "next/link";
import type { Metadata } from "next";
import Logo from "../Logo";
import StandaloneApp from "./StandaloneApp";

export const metadata: Metadata = {
  title: "Offline HoneyMoney — no account, no network",
  description:
    "Track your household spending with no account and no connection. Install once where there is signal, then use it anywhere — the records stay on your phone.",
};

// ── STEP 3 OF THE UNIFICATION ──────────────────────────────────────────────
//
// This page used to be a second app, and that was the right criticism of it:
// the main app could not work offline, so /local existed to do what /dashboard
// could not. Now that every write lands on the device first and the views show
// what has not synced, a signed-in household never needs a different app —
// they need THE app, which already behaves this way.
//
// So the duplication is resolved by scope rather than by deletion. Anyone with
// an account is sent to the real thing. What remains here is the only case the
// main app genuinely cannot serve: somebody who has no account, because
// creating one needs a network they do not have.
//
// The redirect is CLIENT-side, in StandaloneApp, not a server redirect. A
// server redirect would need a session, which needs a network, which is exactly
// what this route promises not to need — and it would turn the one page
// guaranteed to load offline into one that cannot.
//
// Deliberately a STATIC page with no auth check and no data fetch.
//
// Every other route in this app calls getContext(), which needs a session,
// which needs the network. This one must render for somebody who has never had
// an account and has no signal, so it renders nothing but the shell and lets
// the client component read the device. That is also what lets the service
// worker cache it usefully: a page whose HTML depends on a session cannot be
// served from a cache to a different session, and this page has none.
export const dynamic = "force-static";

export default function LocalPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
          <Logo size={24} /> HoneyMoney offline
        </h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/" className="text-zinc-500 hover:underline">
            Home
          </Link>
          <Link href="/guide" className="text-zinc-500 hover:underline">
            Guide
          </Link>
        </nav>
      </header>

      <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        <strong>No account. No connection. Nothing sent anywhere.</strong> Record what your household
        spends, see where it goes, and keep the lot on this phone. It works with the aeroplane mode
        on.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">
        Already have an account? The main app works this way too now — everything you record saves
        to your phone first and syncs when it can. Use{" "}
        <Link href="/record" className="font-medium text-amber-600 hover:underline">
          the app you already have
        </Link>
        ; this page is for people who cannot reach a sign-up at all.
      </p>

      {/* The one honest catch, said before they invest any typing in it — not
          discovered later on a road where the signal has gone. */}
      <div className="mt-4 rounded-xl border border-zinc-300 bg-zinc-50 p-4 text-sm leading-relaxed dark:border-zinc-700 dark:bg-zinc-900/60">
        <p className="font-semibold">Do this once, where there is signal</p>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          A web page has to be fetched the first time — there is no way round that, and we would
          rather say so than have you find out on a hill. So while you have a connection, open this
          page and <strong>add HoneyMoney to your home screen</strong> (your browser&rsquo;s menu →
          Add to Home Screen, or Install). That saves the whole app and the receipt reader onto the
          phone.
        </p>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          After that it opens and works with no connection at all, for as long as you keep it
          installed.
        </p>
      </div>

      <div className="mt-10">
        <StandaloneApp />
      </div>

      <section className="mt-12 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold">What this version does and does not do</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
            <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Works</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-emerald-900 dark:text-emerald-200">
              <li>Recording money in and money out, in the three buckets.</li>
              <li>Totals, spending by bucket, and month by month.</li>
              <li>Saving a copy of everything to a file you keep.</li>
              <li>All of it with no account, no sign-in and no connection.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20">
            <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Needs an account and a connection
            </h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              <li>The Money Health Score, forecasts and shortfall warnings.</li>
              <li>Sharing with a partner, and anything they record.</li>
              <li>Ask Honey, and cloud-assisted receipt reading.</li>
              <li>Your records being on more than one device.</li>
              <li>
                Any copy held by us. If this phone is lost and you have no saved file, the records
                are gone — we will not have them.
              </li>
            </ul>
          </div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-zinc-500">
          Because nothing leaves the device, there is nothing for us to collect, so no privacy
          notice applies to what you type here — we never receive it. If you later create an
          account, our{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy notice
          </Link>{" "}
          starts applying from that point, and{" "}
          <Link href="/legal/disclaimer" className="underline underline-offset-2">
            HoneyMoney is an educational tool, not financial advice
          </Link>
          , here as everywhere.
        </p>
      </section>
    </main>
  );
}
