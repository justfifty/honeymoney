"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  parseDelimited,
  sniffDelimiter,
  guessColumns,
  applyMapping,
  inferDateOrder,
  contentKey,
  type ColumnMap,
  type DateOrder,
  type ParsedRow,
} from "@/lib/csv";
import { t as translate, type Locale } from "@/lib/i18n";

// CSV / statement import, entirely on the user's machine until they commit.
//
// The file is read with FileReader, parsed by lib/csv.ts, mapped and reviewed
// here. Nothing is uploaded — not the file, not the columns the user rejected,
// not the balance column. Only the rows they approved are POSTed. That is Task
// 10's hardest rule and it is a structural property of where the code runs, not
// a promise in a privacy policy.
//
// THE BASELINE IS `<input type="file" multiple>`, built first and complete on
// its own, because it works in every browser including iOS Safari. Folder
// selection is an ENHANCEMENT layered on top and feature-detected — for a
// Malaysian consumer PWA, iPhone users are not a rounding error, and gating
// import behind `showDirectoryPicker` would lock out every one of them.

type Stage = "pick" | "map" | "review" | "done";

interface Bucket {
  id: string;
  label: string;
}

interface LoadedFile {
  name: string;
  header: string[];
  rows: string[][];
}

/** A mapping the user has confirmed, remembered per file shape. */
interface RememberedMap extends ColumnMap {
  savedAt: string;
}

const MAP_STORE = "hm.import.maps.v1";

/**
 * Files from the same bank have the same header row, so the header IS the
 * source identity — no need to ask the user which bank it is, and no per-bank
 * list to maintain. Stored in localStorage: a remembered mapping is a
 * convenience, not data worth a server round trip or a schema.
 */
function shapeKey(header: string[]): string {
  return header.map((h) => h.trim().toLowerCase()).join("|").slice(0, 200);
}

function loadRemembered(header: string[]): RememberedMap | null {
  try {
    const all = JSON.parse(localStorage.getItem(MAP_STORE) ?? "{}") as Record<string, RememberedMap>;
    return all[shapeKey(header)] ?? null;
  } catch {
    return null; // private window, cleared storage, corrupt value — all fine
  }
}

function remember(header: string[], map: ColumnMap) {
  try {
    const all = JSON.parse(localStorage.getItem(MAP_STORE) ?? "{}") as Record<string, RememberedMap>;
    all[shapeKey(header)] = { ...map, savedAt: new Date().toISOString() };
    localStorage.setItem(MAP_STORE, JSON.stringify(all));
  } catch {
    /* not remembering is a degraded convenience, never an error */
  }
}

export default function CsvImport({
  buckets,
  defaultBucketId,
  lang = "en",
}: {
  buckets: Bucket[];
  defaultBucketId: string;
  lang?: Locale;
}) {
  // Memoised because readFile is a useCallback that depends on it; a fresh `tr`
  // on every render would rebuild that callback every time for no reason.
  const tr = useCallback(
    (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars),
    [lang],
  );

  const [stage, setStage] = useState<Stage>("pick");
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [dateCertain, setDateCertain] = useState(true);
  const [mapRemembered, setMapRemembered] = useState(false);
  const [bucket, setBucket] = useState(defaultBucketId);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ batch: string; created: number; skipped: number } | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const readFile = useCallback(async (f: File) => {
    setErr(null);
    const text = await f.text();
    const delimiter = sniffDelimiter(text);
    const all = parseDelimited(text, delimiter);
    if (all.length < 2) {
      setErr(tr("imp.csv.tooShort"));
      return;
    }

    // Is the first row a header, or data? A header has no parseable date in the
    // column the data uses — checking that is cheaper and more reliable than
    // asking, and the user can still correct the mapping either way.
    const looksLikeHeader = all[0].some((c) => /[a-z]{3}/i.test(c)) &&
      !all[0].some((c) => /^\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}$/.test(c.trim()));
    const header = looksLikeHeader ? all[0] : all[0].map((_, i) => `${tr("imp.csv.column")} ${i + 1}`);
    const rows = looksLikeHeader ? all.slice(1) : all;

    const saved = loadRemembered(header);
    const guessed = saved ?? guessColumns(header, rows);
    const certainty = inferDateOrder(rows.slice(0, 40).map((r) => r[guessed.date] ?? ""));

    setFile({ name: f.name, header, rows });
    setMap({ ...guessed, dateOrder: saved ? saved.dateOrder : certainty.order });
    // A remembered answer counts as confirmation — the user already told us once.
    setDateCertain(Boolean(saved) || certainty.certain);
    setMapRemembered(Boolean(saved));
    setSkip(new Set());
    setStage("map");
  }, [tr]);

  const parsed: ParsedRow[] = useMemo(
    () => (file && map ? applyMapping(file.rows, map) : []),
    [file, map],
  );

  // Duplicates WITHIN the batch — a statement listing the same charge twice, or
  // an overlapping re-import in one selection. The server re-checks against what
  // is already stored, because this view is a snapshot.
  const dupeIndexes = useMemo(() => {
    const seen = new Map<string, number>();
    const dupes = new Set<number>();
    parsed.forEach((r, i) => {
      if (r.problems.length) return;
      const k = contentKey(r);
      if (seen.has(k)) dupes.add(i);
      else seen.set(k, i);
    });
    return dupes;
  }, [parsed]);

  const badIndexes = useMemo(
    () => new Set(parsed.map((r, i) => (r.problems.length ? i : -1)).filter((i) => i >= 0)),
    [parsed],
  );

  // Probable duplicates default to SKIPPED — re-importing an overlapping date
  // range is the most common thing users do, and the safe default is the one
  // that cannot double a ledger.
  const effectiveSkip = useMemo(() => {
    const s = new Set(skip);
    for (const i of dupeIndexes) s.add(i);
    for (const i of badIndexes) s.add(i);
    return s;
  }, [skip, dupeIndexes, badIndexes]);

  const willImport = parsed.filter((_, i) => !effectiveSkip.has(i));

  async function commit() {
    if (!willImport.length) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: willImport.map((r) => ({
            occurredAt: new Date(`${r.date}T12:00:00`).toISOString(),
            vendorLabel: r.description,
            amount: r.amount,
            direction: r.direction,
            walletNodeId: bucket,
            importKey: contentKey(r),
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || tr("imp.csv.failed"));
      if (file && map) remember(file.header, map);
      setResult({ batch: data.batch, created: data.created, skipped: data.skipped });
      setStage("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr("imp.csv.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function rollback() {
    if (!result) return;
    setBusy(true);
    try {
      const res = await fetch("/api/import", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: result.batch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || tr("imp.csv.failed"));
      setResult(null);
      setFile(null);
      setMap(null);
      setStage("pick");
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr("imp.csv.failed"));
    } finally {
      setBusy(false);
    }
  }

  const field =
    "rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";

  // ── pick ─────────────────────────────────────────────────────────────────
  if (stage === "pick") {
    return (
      <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold">{tr("imp.csv.title")}</h2>
        <p className="mt-1 text-sm text-zinc-500">{tr("imp.csv.subtitle")}</p>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          multiple
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void readFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-4 min-h-11 rounded-full bg-amber-600 px-5 text-sm font-semibold text-white transition hover:bg-amber-700"
        >
          {tr("imp.csv.choose")}
        </button>

        <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          🔒 {tr("imp.csv.privacy")}
        </p>
        {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
      </section>
    );
  }

  // ── map ──────────────────────────────────────────────────────────────────
  if (stage === "map" && file && map) {
    const options = file.header.map((h, i) => (
      <option key={i} value={i}>
        {h || `${tr("imp.csv.column")} ${i + 1}`}
      </option>
    ));

    return (
      <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold">{tr("imp.csv.mapTitle")}</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {tr("imp.csv.mapBody", { file: file.name, n: file.rows.length })}
        </p>
        {mapRemembered && (
          <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
            ✓ {tr("imp.csv.remembered")}
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            {tr("imp.csv.colDate")}
            <select value={map.date} onChange={(e) => setMap({ ...map, date: Number(e.target.value) })} className={field}>
              {options}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            {tr("imp.csv.colDesc")}
            <select
              value={map.description}
              onChange={(e) => setMap({ ...map, description: Number(e.target.value) })}
              className={field}
            >
              {options}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            {tr("imp.csv.colAmount")}
            <select
              value={map.amount ?? -1}
              onChange={(e) => {
                const v = Number(e.target.value);
                // Choosing a signed column clears debit/credit, or every row
                // would be counted twice.
                setMap({ ...map, amount: v === -1 ? null : v, debit: null, credit: null });
              }}
              className={field}
            >
              <option value={-1}>{tr("imp.csv.none")}</option>
              {options}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            {tr("imp.csv.colDebit")}
            <select
              value={map.debit ?? -1}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMap({ ...map, debit: v === -1 ? null : v, amount: null });
              }}
              className={field}
            >
              <option value={-1}>{tr("imp.csv.none")}</option>
              {options}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            {tr("imp.csv.colCredit")}
            <select
              value={map.credit ?? -1}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMap({ ...map, credit: v === -1 ? null : v, amount: null });
              }}
              className={field}
            >
              <option value={-1}>{tr("imp.csv.none")}</option>
              {options}
            </select>
          </label>
        </div>

        {/* The date-order question. Asked, never assumed — when nothing in the
            file distinguishes 03/04 from 04/03, a wrong guess silently lands a
            whole statement in the wrong month. */}
        <div
          className={`mt-4 rounded-xl p-3 ${
            dateCertain
              ? "bg-zinc-50 dark:bg-zinc-900/60"
              : "border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
          }`}
        >
          <p className="text-xs font-medium">
            {dateCertain ? tr("imp.csv.dateKnown") : tr("imp.csv.dateAsk")}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {tr("imp.csv.dateSample", {
              raw: file.rows[0]?.[map.date] ?? "—",
              parsed: applyMapping([file.rows[0] ?? []], map)[0]?.date ?? "—",
            })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["dmy", "mdy", "ymd"] as DateOrder[]).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => {
                  setMap({ ...map, dateOrder: o });
                  setDateCertain(true);
                }}
                className={`min-h-11 rounded-lg border px-3 text-xs font-medium ${
                  map.dateOrder === o
                    ? "border-amber-500 bg-amber-500 text-white"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
              >
                {tr(`imp.csv.order.${o}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setStage("review")}
            className="min-h-11 rounded-full bg-amber-600 px-5 text-sm font-semibold text-white hover:bg-amber-700"
          >
            {tr("imp.csv.preview")} →
          </button>
          <button
            type="button"
            onClick={() => {
              setFile(null);
              setStage("pick");
            }}
            className="min-h-11 rounded-full border border-zinc-300 px-5 text-sm dark:border-zinc-700"
          >
            {tr("imp.csv.back")}
          </button>
        </div>
      </section>
    );
  }

  // ── review ───────────────────────────────────────────────────────────────
  if (stage === "review" && file) {
    return (
      <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold">{tr("imp.csv.reviewTitle")}</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {tr("imp.csv.reviewBody", {
            willImport: willImport.length,
            total: parsed.length,
            dupes: dupeIndexes.size,
            bad: badIndexes.size,
          })}
        </p>

        <label className="mt-3 flex flex-col gap-1 text-xs text-zinc-500 sm:max-w-xs">
          {tr("imp.csv.bucketAll")}
          <select value={bucket} onChange={(e) => setBucket(e.target.value)} className={field}>
            {buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4 max-h-96 overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="p-2">{tr("imp.csv.include")}</th>
                <th className="p-2">{tr("imp.csv.colDate")}</th>
                <th className="p-2">{tr("imp.csv.colDesc")}</th>
                <th className="p-2 text-right">{tr("imp.csv.colAmount")}</th>
              </tr>
            </thead>
            <tbody>
              {parsed.slice(0, 200).map((r, i) => {
                const bad = badIndexes.has(i);
                const dupe = dupeIndexes.has(i);
                return (
                  <tr
                    key={i}
                    className={`border-t border-zinc-100 dark:border-zinc-800 ${
                      bad ? "bg-rose-50 dark:bg-rose-950/20" : dupe ? "bg-amber-50 dark:bg-amber-950/20" : ""
                    }`}
                  >
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={!effectiveSkip.has(i)}
                        disabled={bad}
                        onChange={(e) => {
                          const s = new Set(skip);
                          if (e.target.checked) s.delete(i);
                          else s.add(i);
                          setSkip(s);
                        }}
                        aria-label={tr("imp.csv.include")}
                      />
                    </td>
                    <td className="p-2 tabular-nums">{r.date ?? "—"}</td>
                    <td className="max-w-[16rem] truncate p-2">
                      {r.description || "—"}
                      {dupe && <span className="ml-1 text-amber-700">· {tr("imp.csv.dupe")}</span>}
                      {bad && <span className="ml-1 text-rose-700">· {r.problems.join(", ")}</span>}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {r.amount != null ? `${r.direction === "in" ? "+" : "−"}${r.amount.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {parsed.length > 200 && (
          <p className="mt-2 text-[11px] text-zinc-400">{tr("imp.csv.truncated", { n: parsed.length - 200 })}</p>
        )}

        {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={commit}
            disabled={busy || !willImport.length}
            className="min-h-11 rounded-full bg-amber-600 px-5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? "…" : tr("imp.csv.commit", { n: willImport.length })}
          </button>
          <button
            type="button"
            onClick={() => setStage("map")}
            className="min-h-11 rounded-full border border-zinc-300 px-5 text-sm dark:border-zinc-700"
          >
            {tr("imp.csv.back")}
          </button>
        </div>
      </section>
    );
  }

  // ── done ─────────────────────────────────────────────────────────────────
  if (stage === "done" && result) {
    return (
      <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/30">
        <h2 className="text-base font-semibold text-emerald-900 dark:text-emerald-200">
          {tr("imp.csv.doneTitle", { n: result.created })}
        </h2>
        {result.skipped > 0 && (
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
            {tr("imp.csv.doneSkipped", { n: result.skipped })}
          </p>
        )}
        {/* One action, and it takes the whole batch back — which is what makes
            importing 400 rows a recoverable mistake rather than an evening
            spent unpicking them by hand. */}
        <button
          type="button"
          onClick={rollback}
          disabled={busy}
          className="mt-3 min-h-11 rounded-full border border-emerald-600 px-5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
        >
          {busy ? "…" : tr("imp.csv.undo")}
        </button>
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setFile(null);
            setStage("pick");
          }}
          className="mt-3 ml-2 min-h-11 rounded-full px-5 text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-200"
        >
          {tr("imp.csv.another")}
        </button>
        {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}
      </section>
    );
  }

  return null;
}
