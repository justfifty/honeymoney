"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// The shape comes from lib/goals.ts rather than being restated here. This was a
// second declaration of the same interface, and it silently went stale the
// moment progress stopped being one number — a duplicate type is a drift waiting
// for a reason. `import type` is erased at compile time, so no server-only code
// follows it into the client bundle.
import type { Goal } from "@/lib/goals";
interface Category {
  key: string;
  emoji: string;
  label: string;
}
/** A roster entry, so a goal can say whose it is. */
export interface GoalMember {
  id: string;
  name: string;
}

const rm = (n: number) => `RM${Math.round(n).toLocaleString()}`;

// Months between now and a YYYY-MM-DD(-ish) date; null if unparseable/past.
function monthsUntil(dateStr: string): number | null {
  const d = new Date(dateStr.replace(" ", "T"));
  if (isNaN(d.getTime())) return null;
  const months = (d.getTime() - Date.now()) / (30 * 86_400_000);
  return months > 0 ? months : null;
}

export default function GoalsManager({
  goals,
  canWrite,
  categories,
  members = [],
}: {
  goals: Goal[];
  canWrite: boolean;
  categories: Category[];
  /** Empty for a household of one — the owner picker then has nothing to ask. */
  members?: GoalMember[];
}) {
  const [adding, setAdding] = useState(false);

  const active = goals.filter((g) => g.pct < 100);
  const achieved = goals.filter((g) => g.pct >= 100);

  return (
    <div className="mt-6 space-y-4">
      {canWrite && (
        <div>
          {adding ? (
            <NewGoalForm
              categories={categories}
              members={members}
              onClose={() => setAdding(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-600"
            >
              ＋ New goal
            </button>
          )}
        </div>
      )}

      {goals.length === 0 && (
        <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-center text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20">
          No goals yet. {canWrite ? "Set your first target — a trip, a study fund, a gift, an emergency cushion." : "Sign in to set your own targets."}
        </p>
      )}

      {active.map((g) => (
        <GoalCard key={g.id} goal={g} canWrite={canWrite} />
      ))}

      {/* Achievements — a record of the targets you've reached */}
      {achieved.length > 0 && (
        <div className="pt-2">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            🏆 Achievements <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">{achieved.length}</span>
          </h2>
          <div className="space-y-2">
            {achieved.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/30"
              >
                <span className="flex items-center gap-2">
                  <span className="text-xl" aria-hidden="true">{g.emoji}</span>
                  <span className="font-medium">{g.name}</span>
                </span>
                <span className="font-medium text-emerald-700 dark:text-emerald-300">{rm(g.target)} ✅</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GoalCard({ goal, canWrite }: { goal: Goal; canWrite: boolean }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const done = goal.pct >= 100;

  const monthsLeft = goal.targetDate ? monthsUntil(goal.targetDate) : null;
  const neededPerMonth = monthsLeft && goal.remaining > 0 ? goal.remaining / monthsLeft : null;
  const dateLabel = goal.targetDate
    ? new Date(goal.targetDate.replace(" ", "T")).toLocaleDateString(undefined, { year: "numeric", month: "short" })
    : null;

  async function contribute() {
    const add = parseFloat(amount);
    if (!(add > 0)) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId: goal.id, manualDelta: add }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn’t add that.");
      setAmount("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t add that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        "rounded-2xl border p-5 " +
        (done
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">{goal.emoji}</span>
          <div>
            <p className="flex flex-wrap items-center gap-1.5 font-semibold">
              {goal.name}
              {/* Whose it is, said on the card rather than only in the form.
                  A household goal carries no badge: the absence IS the label,
                  and stamping "🏠 Household" on every goal in a house of one
                  would be noise on every screen. */}
              {goal.ownerName && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {goal.ownerName}
                </span>
              )}
            </p>
            <p className="text-xs text-zinc-500">
              {rm(goal.current)} of {rm(goal.target)}
              {dateLabel && <> · target {dateLabel}</>}
            </p>
          </div>
        </div>
        {/* pctRaw, not pct. The bar clamps so it cannot draw past its container;
            the NUMBER must not, because 120% of a goal is an achievement and
            rounding it to 100% quietly takes it from whoever earned it. */}
        <span className={"text-lg font-bold " + (done ? "text-emerald-600" : "text-amber-600")}>
          {goal.pctRaw}%
        </span>
      </div>

      {/* progress bar with 25/50/75 milestone ticks */}
      <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={"h-full " + (done ? "bg-emerald-500" : "bg-amber-500")}
          style={{ width: `${goal.pct}%` }}
        />
        {[25, 50, 75].map((m) => (
          <span key={m} className="absolute top-0 h-full w-px bg-white/70 dark:bg-black/40" style={{ left: `${m}%` }} />
        ))}
      </div>

      {/* The reconciliation line. "RM8,000 tracked + RM2,000 you added manually"
          is a sentence a household can check against their own ledger; a single
          RM10,000 is one they have to take on trust. Shown whenever BOTH halves
          exist — a goal funded entirely one way needs no breakdown. */}
      {goal.tracked > 0 && goal.manual > 0 && (
        <p className="mt-2 text-xs text-zinc-500">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{rm(goal.tracked)}</span>{" "}
          tracked from your records +{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{rm(goal.manual)}</span>{" "}
          you added manually
        </p>
      )}
      {goal.tracked === 0 && goal.manual > 0 && (
        <p className="mt-2 text-xs text-zinc-500">
          All {rm(goal.manual)} added manually — no records are linked to this goal yet.
          {goal.manualMigrated && (
            <span className="text-zinc-400"> (carried over from before goals tracked records)</span>
          )}
        </p>
      )}

      {done ? (
        <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          🎉 You did it — target reached. You earned this by saving.
          {goal.pctRaw > 100 && <> You are {goal.pctRaw - 100}% past it.</>}
        </p>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">
          {rm(goal.remaining)} to go
          {neededPerMonth != null && <> · about {rm(neededPerMonth)}/mo to reach it by {dateLabel}</>}
        </p>
      )}

      {/* Adding here is explicitly the MANUAL half, and the control says so.
          The old label was "Add RM…", which gave a user no way to know their
          number would sit beside tracked progress and be indistinguishable from
          it. Note this stays available after the target is reached — passing a
          goal is a success state, not a reason to disable the controls. */}
      {canWrite && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="RM…"
              aria-label={`Add savings you made outside the app toward ${goal.name}`}
              className="w-28 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <button
              type="button"
              onClick={contribute}
              disabled={busy || !(parseFloat(amount) > 0)}
              className="min-h-11 rounded-lg bg-amber-500 px-3 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {busy ? "…" : "Add manually"}
            </button>
            {err && <span className="text-xs text-red-600">{err}</span>}
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">
            For savings that happened outside HoneyMoney. Money you record against this goal is
            counted automatically.
          </p>
        </div>
      )}
    </div>
  );
}

function NewGoalForm({
  categories,
  members,
  onClose,
}: {
  categories: Category[];
  members: GoalMember[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [category, setCategory] = useState("custom");
  const [date, setDate] = useState("");
  // Defaults to the household, which is what every goal was before this and the
  // right default for two people saving toward the same thing.
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          target: parseFloat(target),
          category,
          targetDate: date || undefined,
          owner: owner || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn’t create the goal.");
      onClose();
      router.refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn’t create the goal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-2xl border border-amber-200 bg-white p-5 dark:border-amber-900/50 dark:bg-zinc-900">
      <p className="mb-3 text-sm font-semibold">New goal — your target, your time</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Japan trip"
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
        </label>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Target (RM)
          <input type="number" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="3000"
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
        </label>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950">
            {categories.map((c) => (
              <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Target date (optional)
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" />
        </label>
        {/* Only asked of a household that HAS more than one person. For someone
            saving alone, "whose goal is this?" has one answer and asking it is
            a field to skip on every goal they ever create. */}
        {members.length > 1 && (
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Whose goal
            <select value={owner} onChange={(e) => setOwner(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950">
              <option value="">🏠 The household</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {members.length > 1 && (
        <p className="mt-2 text-xs text-zinc-500">
          A personal goal still shows on the household&rsquo;s dashboard — it says whose it is, it
          does not hide it.
        </p>
      )}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy} className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
          {busy ? "Saving…" : "Create goal"}
        </button>
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700">
          Cancel
        </button>
      </div>
    </form>
  );
}
