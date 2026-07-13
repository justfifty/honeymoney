import { getRates, SOURCE_LABEL } from "@/lib/fx";
import { rateFor } from "@/lib/format";

// Names the source of the number the user is looking at. A converted figure
// with no provenance is just a rumour, so anywhere we show non-MYR money we
// show where the rate came from and when it was published.
export default async function RatesNote({ ccy }: { ccy: string }) {
  if (ccy === "MYR") return null;
  const { fetchedAt } = await getRates();
  const rate = rateFor(ccy);

  const when = rate.asOf
    ? new Date(rate.asOf).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })
    : new Date(fetchedAt).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });

  const label =
    rate.source === "cache" && rate.staleFrom
      ? `${SOURCE_LABEL[rate.staleFrom]} (cached — offline)`
      : SOURCE_LABEL[rate.source];

  const isLive = rate.source === "bnm" || rate.source === "ecb";

  return (
    <p className="mt-2 text-[11px] text-zinc-400">
      <span className={isLive ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
        {isLive ? "●" : "▲"}
      </span>{" "}
      1 MYR = {rate.perMYR.toFixed(4)} {ccy} ·{" "}
      {rate.sourceUrl ? (
        <a href={rate.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-600">
          {label}
        </a>
      ) : (
        label
      )}{" "}
      · {when}
      {!isLive && " · figures are approximate"}
    </p>
  );
}
