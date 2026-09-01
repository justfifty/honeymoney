"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { t as translate, type Locale } from "@/lib/i18n";

// Import a credit-card or bank statement.
//
// The rule this screen exists to enforce: NOTHING is saved until the user has
// seen every row and ticked it. A statement is 40–90 transactions; an importer
// that swallows them silently is one that quietly corrupts a household's books,
// and they would find out months later, if ever.
//
// So the table shows everything it found — including the rows it does NOT intend
// to import, and why. The two it un-ticks by default:
//   • rows already in the books (arithmetic, not a guess — see lib/dedupe.ts)
//   • money coming *in* (a card payment, a refund) — importing those as spends
//     would double-count the month.
// Both can be overridden. It is a proposal, not a verdict.

interface Bucket {
  id: string;
  label: string;
  tier: number;
}
interface Member {
  id: string;
  label: string;
}

type RowType = "purchase" | "fee" | "interest" | "payment" | "refund" | "cashback";

interface Duplicate {
  id: string;
  vendor: string;
  amount: number;
  occurredAt: string;
  why: string;
  certainty: "exact" | "likely";
}

interface Row {
  index: number;
  date: string;
  description: string;
  vendor: string;
  amount: number;
  type: RowType;
  foreign: { amount: number; currency: string } | null;
  bucket: { nodeId: string; label: string; reason: string } | null;
  duplicate: Duplicate | null;
  include: boolean;
}

interface Meta {
  issuer: string;
  cardLast4: string;
  statementDate: string;
  dueDate: string;
  currency: string;
  previousBalance: number | null;
  newBalance: number | null;
  minimumPayment: number | null;
}

interface Reconciliation {
  ok: boolean;
  outflow: number;
  inflow: number;
  expectedMovement: number | null;
  foundMovement: number;
  discrepancy: number | null;
  note: string;
}

interface Result {
  meta: Meta;
  rows: Row[];
  reconciliation: Reconciliation;
  pageCount: number;
  scanned: boolean;
  degraded?: string;
}

const MONEY_IN: RowType[] = ["payment", "refund", "cashback"];

const TYPE_STYLE: Record<RowType, string> = {
  purchase: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  fee: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  interest: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  payment: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  refund: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  cashback: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
};

/**
 * ISO datetime -> the "YYYY-MM-DD" an <input type="date"> requires.
 *
 * Deliberately NOT `new Date(x).toISOString().slice(0,10)`: that converts to
 * UTC, and a Malaysian row stored at midnight local time (UTC+8) comes back as
 * the previous day. Editing one row's date would then silently move every OTHER
 * row's displayed date back a day the moment it re-rendered.
 */
function isoDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function StatementImport({
  lang = "en",
  buckets,
  members,
}: {
  lang?: Locale;
  buckets: Bucket[];
  members: Member[];
}) {
  const tr = (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [result, setResult] = useState<Result | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [member, setMember] = useState("");
  const [done, setDone] = useState<{ saved: number; skipped: number; total: number } | null>(null);

  const selected = useMemo(() => rows.filter((r) => r.include), [rows]);
  const selectedTotal = useMemo(
    () => selected.reduce((n, r) => n + (MONEY_IN.includes(r.type) ? 0 : r.amount), 0),
    [selected],
  );
  const dupeCount = useMemo(() => rows.filter((r) => r.duplicate).length, [rows]);

  async function parse(f: File, pwd: string) {
    setBusy(true);
    setError(null);
    setDone(null);
    setStatus(tr("imp.reading"));
    try {
      const fileBase64 = await toBase64(f);
      const res = await fetch("/api/statement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64, mimeType: f.type, ...(pwd ? { password: pwd } : {}) }),
      });
      const data = await res.json();

      if (res.status === 401 && data.error === "password_required") {
        setNeedsPassword(true);
        setStatus(null);
        // A wrong password and a missing one are different problems, and telling
        // them apart saves the user from re-typing something that was right.
        setError(data.needsPassword ? tr("imp.passwordNeeded") : tr("imp.passwordWrong"));
        return;
      }
      if (!res.ok) throw new Error(data.message ?? data.error ?? tr("imp.readFail"));

      setNeedsPassword(false);
      setResult(data as Result);
      setRows((data as Result).rows);
      setStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("imp.readFail"));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  function pick(f: File) {
    if (f.type !== "application/pdf" && !f.type.startsWith("image/")) {
      setError(tr("imp.notAPdf"));
      return;
    }
    setFile(f);
    setResult(null);
    setRows([]);
    setDone(null);
    setError(null);
    void parse(f, password);
  }

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.index === i ? { ...r, ...patch } : r)));
  }

  /**
   * A blank row for something the parser did not find.
   *
   * Its index continues past the highest one the parser used rather than being
   * `rows.length`: rows can be added after others have been edited, and an index
   * that collides with an existing row would make `setRow` patch two rows at
   * once. It is a React identity and a patch target, not a position.
   *
   * It arrives unticked with no bucket, so it cannot be committed by accident
   * before the user has said what it is -- the commit already refuses a ticked
   * row with no bucket.
   */
  function addRow() {
    setRows((rs) => {
      const index = rs.reduce((max, r) => Math.max(max, r.index), -1) + 1;
      return [
        ...rs,
        {
          index,
          date: new Date().toISOString(),
          description: "",
          vendor: "",
          amount: 0,
          type: "purchase",
          foreign: null,
          bucket: null,
          duplicate: null,
          include: false,
        },
      ];
    });
  }

  function selectAll(include: boolean) {
    setRows((rs) => rs.map((r) => ({ ...r, include })));
  }

  function selectSpendsOnly() {
    setRows((rs) =>
      rs.map((r) => ({
        ...r,
        include: !MONEY_IN.includes(r.type) && r.duplicate?.certainty !== "exact",
      })),
    );
  }

  async function commit() {
    if (!result || !selected.length) return;
    // Rows are editable now, and one of them may be a blank the user added and
    // then ticked before filling in. Checked here rather than left to the API,
    // which would reject the whole batch on the first bad row and report it as a
    // failed import rather than as a field to finish.
    const incomplete = selected.filter((r) => !r.vendor.trim() || !(r.amount > 0));
    if (incomplete.length) {
      setError(tr("imp.needRowDetail", { n: incomplete.length }));
      return;
    }
    const missing = selected.filter((r) => !r.bucket?.nodeId);
    if (missing.length) {
      setError(tr("imp.needBuckets", { n: missing.length }));
      return;
    }

    setBusy(true);
    setError(null);
    setStatus(tr("imp.saving", { n: selected.length }));
    try {
      const res = await fetch("/api/statement/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement: {
            issuer: result.meta.issuer,
            cardLast4: result.meta.cardLast4,
            statementDate: result.meta.statementDate,
          },
          rows: selected.map((r) => ({
            vendor: r.vendor,
            description: r.description,
            amount: r.amount,
            occurredAt: r.date,
            walletNodeId: r.bucket!.nodeId,
            memberId: member || undefined,
            foreign: r.foreign,
            // They saw the duplicate warning and ticked it anyway. Honour that —
            // but only for the rows they actually overrode.
            force: Boolean(r.duplicate),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? tr("imp.saveFail"));

      setDone({ saved: data.saved, skipped: data.skipped, total: data.total });
      setResult(null);
      setRows([]);
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("imp.saveFail"));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  const field =
    "rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-xs text-inherit outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900";

  // ── Done ─────────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="mt-8 rounded-2xl border border-emerald-300 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950/30">
        <h2 className="text-lg font-semibold text-emerald-800 dark:text-emerald-200">
          ✅ {tr("imp.doneTitle", { n: done.saved })}
        </h2>
        <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
          {tr("imp.doneBody", { total: done.total.toFixed(2) })}
          {done.skipped > 0 && ` ${tr("imp.doneSkipped", { n: done.skipped })}`}
        </p>
        <div className="mt-4 flex gap-2">
          <a
            href="/records"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            {tr("imp.viewRecords")}
          </a>
          <button
            type="button"
            onClick={() => setDone(null)}
            className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-300"
          >
            {tr("imp.importAnother")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {/* ── Drop zone ─────────────────────────────────────────────────────── */}
      {!result && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) pick(f);
          }}
          className={`rounded-2xl border-2 border-dashed p-10 text-center transition ${
            dragging
              ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
              : "border-zinc-300 dark:border-zinc-700"
          }`}
        >
          <p className="text-4xl">📄</p>
          <p className="mt-3 text-sm font-medium">{tr("imp.dropTitle")}</p>
          <p className="mt-1 text-xs text-zinc-500">{tr("imp.dropHint")}</p>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="mt-4 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {busy ? "…" : tr("imp.choose")}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pick(f);
              e.target.value = "";
            }}
          />

          {file && <p className="mt-3 text-xs text-zinc-500">{file.name}</p>}

          {/* Most Malaysian bank statements are locked with an IC number or a
              date of birth. Asking for it is the normal path, not an error. */}
          {needsPassword && (
            <div className="mx-auto mt-5 flex max-w-sm items-end gap-2">
              <label className="flex flex-1 flex-col gap-1 text-left text-xs text-zinc-500">
                {tr("imp.passwordLabel")}
                <input
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && file && password) void parse(file, password);
                  }}
                  placeholder={tr("imp.passwordPlaceholder")}
                  className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
              <button
                type="button"
                disabled={busy || !password || !file}
                onClick={() => file && void parse(file, password)}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {tr("imp.unlock")}
              </button>
            </div>
          )}
        </div>
      )}

      {status && <p className="mt-3 animate-pulse text-sm text-amber-600">{status}</p>}
      {error && (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          ⚠️ {error}
        </p>
      )}

      {/* ── Review ────────────────────────────────────────────────────────── */}
      {result && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {result.meta.issuer || tr("imp.statement")}
              {result.meta.cardLast4 && (
                <span className="ml-2 text-sm font-normal text-zinc-500">••{result.meta.cardLast4}</span>
              )}
            </h2>
            <p className="text-xs text-zinc-500">
              {tr("imp.foundRows", { n: rows.length, pages: result.pageCount })}
            </p>
          </div>

          {/* Reconciliation: do our rows add up to what the bank says happened?
              This is the difference between "the AI read your statement" and
              something you can actually rely on. */}
          <div
            className={`mt-3 rounded-xl border p-3 text-xs ${
              result.reconciliation.ok
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                : "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
            }`}
          >
            <span className="mr-1">{result.reconciliation.ok ? "✅" : "⚠️"}</span>
            {result.reconciliation.note}
          </div>

          {result.scanned && result.degraded && (
            <div className="mt-2 rounded-xl border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              👁️ {result.degraded}
            </div>
          )}

          {dupeCount > 0 && (
            <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              🔁 {tr("imp.dupeSummary", { n: dupeCount })}
            </div>
          )}

          {/* Controls */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={selectSpendsOnly} className={`${field} font-medium`}>
              {tr("imp.selectSuggested")}
            </button>
            <button type="button" onClick={() => selectAll(true)} className={field}>
              {tr("imp.selectAll")}
            </button>
            <button type="button" onClick={() => selectAll(false)} className={field}>
              {tr("imp.selectNone")}
            </button>

            {members.length > 0 && (
              <label className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
                {tr("imp.attributeTo")}
                <select value={member} onChange={(e) => setMember(e.target.value)} className={field}>
                  <option value="">{tr("imp.nobody")}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* Table. Scrolls on its own so the page never scrolls sideways. */}
          <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2 font-medium">{tr("imp.col.date")}</th>
                  <th className="px-3 py-2 font-medium">{tr("imp.col.merchant")}</th>
                  <th className="px-3 py-2 text-right font-medium">{tr("imp.col.amount")}</th>
                  <th className="px-3 py-2 font-medium">{tr("imp.col.bucket")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const moneyIn = MONEY_IN.includes(r.type);
                  return (
                    <tr
                      key={r.index}
                      className={`border-t border-zinc-100 align-top dark:border-zinc-800 ${
                        r.include ? "" : "opacity-55"
                      }`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={r.include}
                          onChange={(e) => setRow(r.index, { include: e.target.checked })}
                          className="mt-1 h-4 w-4 accent-amber-500"
                        />
                      </td>

                      {/* EDITABLE, like the merchant beside it. A statement
                          prints "03/07" and the year has to be inferred from the
                          statement date -- which is a guess, and it is wrong for
                          exactly the rows that matter most, the December ones on
                          a January statement. The importer's own rule says so.
                          Leaving the one field the parser is known to get wrong
                          as read-only text meant the only fix was to import it
                          and then go and correct it in /records. */}
                      <td className="whitespace-nowrap px-2 py-2">
                        <input
                          type="date"
                          value={isoDay(r.date)}
                          onChange={(e) =>
                            e.target.value && setRow(r.index, { date: `${e.target.value}T12:00:00.000Z` })
                          }
                          className="w-32 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-zinc-500 outline-none hover:border-zinc-300 focus:border-amber-500 dark:hover:border-zinc-700"
                        />
                      </td>

                      <td className="px-3 py-2">
                        <input
                          value={r.vendor}
                          onChange={(e) => setRow(r.index, { vendor: e.target.value })}
                          className="w-full max-w-56 rounded border border-transparent bg-transparent px-1 py-0.5 font-medium outline-none hover:border-zinc-300 focus:border-amber-500 dark:hover:border-zinc-700"
                        />
                        {/* The raw descriptor is the evidence. Keep it visible —
                            it's how you tell "GRAB* 4Y2K" from "GRABMART". */}
                        {r.description && r.description !== r.vendor && (
                          <div className="truncate text-[10px] text-zinc-400" title={r.description}>
                            {r.description}
                          </div>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] ${TYPE_STYLE[r.type]}`}>
                            {tr(`imp.type.${r.type}`)}
                          </span>
                          {r.duplicate && (
                            <span
                              title={r.duplicate.why}
                              className={`rounded px-1.5 py-0.5 text-[10px] ${
                                r.duplicate.certainty === "exact"
                                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                                  : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                              }`}
                            >
                              🔁{" "}
                              {r.duplicate.certainty === "exact"
                                ? tr("imp.alreadyHave")
                                : tr("imp.maybeDupe")}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Also editable. A scanned statement -- one with no text
                          layer -- goes through vision OCR, which the importer is
                          explicit about, and OCR misreads digits. The figure a
                          household is least willing to accept on trust was the
                          one field they could not touch. */}
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          {moneyIn && <span className="text-emerald-600">+</span>}
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            value={r.amount ? String(r.amount) : ""}
                            onChange={(e) =>
                              setRow(r.index, { amount: Math.abs(Number(e.target.value)) || 0 })
                            }
                            className={`w-24 rounded border border-transparent bg-transparent px-1 py-0.5 text-right tabular-nums outline-none hover:border-zinc-300 focus:border-amber-500 dark:hover:border-zinc-700 ${
                              moneyIn ? "text-emerald-600" : "font-medium"
                            }`}
                          />
                        </div>
                        {r.foreign && (
                          <div className="pr-1 text-[10px] text-zinc-400">
                            {r.foreign.currency} {r.foreign.amount.toFixed(2)}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-2">
                        {moneyIn ? (
                          <span className="text-[11px] text-zinc-400">{tr("imp.notASpend")}</span>
                        ) : (
                          <>
                            <select
                              value={r.bucket?.nodeId ?? ""}
                              onChange={(e) => {
                                const b = buckets.find((x) => x.id === e.target.value);
                                setRow(r.index, {
                                  bucket: b
                                    ? { nodeId: b.id, label: b.label, reason: tr("imp.youChose") }
                                    : null,
                                });
                              }}
                              className={`${field} w-full max-w-44`}
                            >
                              <option value="">{tr("imp.pickBucket")}</option>
                              {buckets.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.label}
                                </option>
                              ))}
                            </select>
                            {r.bucket?.reason && (
                              <div className="mt-0.5 max-w-44 text-[10px] text-zinc-400">
                                {r.bucket.reason}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── THE ROW THE PARSER MISSED ──────────────────────────────────
              The reconciliation banner above already tells a household when the
              rows do not add up to the balance the bank itself printed -- which
              is the importer's best feature and, until now, a dead end. It could
              say "three rows are missing" and offer no way to put them back
              except abandoning the import and typing the month in by hand.
              A statement is evidence the user is holding; if they can see the
              row, they can enter it. */}
          <button
            type="button"
            onClick={addRow}
            className="mt-2 rounded-lg border border-dashed border-zinc-300 px-3 py-1.5 text-xs text-zinc-500 hover:border-amber-400 hover:text-amber-700 dark:border-zinc-700"
          >
            + {tr("imp.addRow")}
          </button>

          {/* Commit bar */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-sm">
              <span className="font-semibold">{tr("imp.willImport", { n: selected.length })}</span>
              <span className="ml-2 text-zinc-500">RM {selectedTotal.toFixed(2)}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setRows([]);
                  setFile(null);
                }}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {tr("imp.cancel")}
              </button>
              <button
                type="button"
                disabled={busy || !selected.length}
                onClick={commit}
                className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {busy ? "…" : tr("imp.import", { n: selected.length })}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;base64,/, ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}
