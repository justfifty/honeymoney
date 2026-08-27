"use client";

import Link from "next/link";
// A directory, not a recommendation engine — and the component is written so
// that it could not become one without someone deliberately changing its
// signature. It takes a category and a sort order. It is never handed a score,
// a band, or a household, so there is nothing here that could rank by merit even
// by accident. Every listing names its regulator and licence reference so the
// user can verify it against the BNM FSP directory or the SC public register
// rather than trusting us.
//
// This is also why the demo ships the directory identically across all four
// personas: a visitor can switch from Building to Thriving and watch the
// catalogue not change, which demonstrates the claim better than a paragraph
// promising it.

import { useState } from "react";
import {
  getListings,
  CATEGORIES,
  VOUCHERS,
  DISCLAIMER_KEY,
  type SortOrder,
} from "@/lib/directory";

type Tr = (k: string, vars?: Record<string, string | number>) => string;

export default function DirectoryView({
  category,
  onBack,
  tr,
}: {
  category: string;
  onBack: () => void;
  tr: Tr;
}) {
  const [sort, setSort] = useState<SortOrder>("alphabetical");
  const def = CATEGORIES.find((c) => c.key === category);
  const listings = getListings(category, sort);

  return (
    <div className="pb-4">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 flex items-center gap-1 rounded-lg px-1 py-1 text-sm text-amber-600 hover:underline"
      >
        <span aria-hidden>‹</span> {tr("dir.back")}
      </button>

      <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">
        {def ? tr(def.labelKey) : tr("dir.title")}
      </h2>
      <p className="mt-1 text-sm text-zinc-500">{tr("dir.intro")}</p>

      <div className="mt-4 flex items-center gap-2 text-xs">
        <span className="text-zinc-400">{tr("dir.sort")}</span>
        {(["alphabetical", "provider"] as SortOrder[]).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setSort(o)}
            aria-pressed={sort === o}
            className={`rounded-full px-2.5 py-1 font-medium transition ${
              sort === o
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {tr(`dir.sort.${o}`)}
          </button>
        ))}
      </div>

      {listings.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800">
          {tr("dir.empty")}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {listings.map((l) => (
            <li key={l.id} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold">{l.provider}</h3>
                {/* `noopener noreferrer` is doing privacy work here, not only
                    the usual tab-hijack prevention: without noreferrer the
                    provider's server learns which HoneyMoney page the visitor
                    came from, and the directory routes from a weak sub-score.
                    A referrer header saying /hscore is a small disclosure about
                    someone's finances made to a bank, by us, on their behalf. */}
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Opens the provider's own site. HoneyMoney sends them nothing about you."
                  className="shrink-0 text-xs text-amber-600 hover:underline"
                >
                  {new URL(l.url).hostname.replace(/^www\./, "")} ↗
                </a>
              </div>
              <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">{tr(l.descKey)}</p>
              <dl className="mt-3 space-y-1 text-xs text-zinc-500">
                <div className="flex gap-1.5">
                  <dt className="text-zinc-400">{tr("dir.regulator")}:</dt>
                  <dd>{tr(`dir.regulator.${l.regulator}`)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="sr-only">Licence</dt>
                  <dd className="text-zinc-400">{l.licenceRef}</dd>
                </div>
              </dl>
              <p className="mt-2 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-800">
                {tr(`dir.commercial.${l.commercial}`)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* Merchant deals live in their own section, structurally apart from
          money products — and are equally score-free. */}
      <section className="mt-8">
        <h3 className="text-sm font-semibold">{tr("dir.vouchers.title")}</h3>
        <p className="mt-1 text-xs text-zinc-500">{tr("dir.vouchers.hint")}</p>
        {VOUCHERS.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">{tr("dir.vouchers.empty")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {VOUCHERS.map((v) => (
              <li key={v.id} className="rounded-2xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                <span className="font-medium">{v.merchant}</span>
                <span className="ml-2 text-zinc-500">{tr(v.descKey)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-3 text-xs text-zinc-400">{tr("dir.commercial.note")}</p>

      {/* Persistent, not dismissible, on every directory page. */}
      <footer className="sticky bottom-0 -mx-4 mt-6 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <p className="text-[11px] leading-relaxed text-zinc-500">{tr(DISCLAIMER_KEY)}</p>
        {/* The leaving notice, in the persistent footer rather than as an
            interstitial on the link. An interstitial that appears on every
            outbound tap is dismissed unread within a week, and it would also be
            the only thing standing between a user and a regulator's own
            register — which is a link we WANT people to follow. Stated once,
            always visible, never in the way. */}
        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
          Following any link here takes you to that organisation&apos;s own site, where their terms
          and privacy notice apply instead of ours. HoneyMoney does not send them your records, your
          H-Score, or anything else about you, and this list is not personalised — it is the same
          for everyone.{" "}
          <Link href="/legal/sponsors" className="underline underline-offset-2">
            Sponsors, partners and referrals
          </Link>
        </p>
      </footer>
    </div>
  );
}
