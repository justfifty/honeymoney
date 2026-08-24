import Link from "next/link";
import { redirect } from "next/navigation";
import { isDatabaseConfigured } from "@/lib/config";
import { getContext, can } from "@/lib/household";
import { listAnchors, recentEntries, verifyChain, actorLabels } from "@/lib/ledger";
import AnchorButton from "./AnchorButton";

export const dynamic = "force-dynamic";

const OP_LABEL: Record<string, string> = {
  create: "Added",
  update: "Corrected",
  void: "Removed",
  restore: "Restored",
};

const OP_STYLE: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  update: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  void: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  restore: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
};

export default async function LedgerPage() {
  if (!isDatabaseConfigured()) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm">PocketBase isn&apos;t running — start it with <code>npm run pb:start</code>.</p>
      </main>
    );
  }

  const ctx = await getContext();
  if (!ctx) redirect("/login?next=/ledger");

  // Verified on every page load, not read from a stored flag — the whole point
  // is that this recomputes the hashes and would catch a database edit made
  // behind the app's back.
  const [chain, entries, anchors, labels] = await Promise.all([
    verifyChain(ctx.tenant.id),
    recentEntries(ctx.tenant.id, 200),
    listAnchors(ctx.tenant.id, 10),
    // Names come from the household roster now, not from an email stored on the
    // entry. Same information on screen, no global identifier at rest.
    actorLabels(ctx.tenant.id),
  ]);

  const latestAnchor = anchors[0];

  return (
    <main className="mx-auto min-h-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">🔗 Audit trail</h1>
          <p className="text-sm text-zinc-500">
            Every change to {ctx.tenant.name}&apos;s records, in the order it happened.
          </p>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/records" className="text-zinc-500 hover:underline">🧾 Records</Link>
          <Link href="/household" className="text-zinc-500 hover:underline">👥 Household</Link>
        </nav>
      </header>

      {/* Integrity */}
      <section
        className={`mt-6 rounded-2xl border p-5 ${
          chain.ok
            ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20"
            : "border-rose-400 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/20"
        }`}
      >
        <h2 className="flex items-center gap-2 font-semibold">
          {chain.ok ? "✅ The chain is intact" : "🚨 The chain is broken"}
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {chain.ok ? (
            <>
              All {chain.length} {chain.length === 1 ? "entry" : "entries"} were re-hashed just now and
              each one still links to the one before it. Nothing in this history has been altered.
            </>
          ) : (
            <>
              {chain.reason} The break is at entry #{chain.brokenAt}. Everything up to that point is
              still trustworthy; everything after it should be treated as suspect.
            </>
          )}
        </p>
        {chain.headHash && (
          <p className="mt-2 break-all font-mono text-[11px] text-zinc-500">
            head: {chain.headHash}
          </p>
        )}
      </section>

      {/* Public anchoring */}
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-semibold">⛓️ Anchored to Bitcoin</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          A hash chain proves nothing was changed <em>within</em> this database — but whoever holds the
          database could, in principle, rebuild the whole chain from scratch. Anchoring closes that
          gap: we publish the head hash to OpenTimestamps, which commits it into the Bitcoin
          blockchain. After that, this history provably existed at that moment, and rewriting it
          would mean rewriting Bitcoin.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Only a 32-byte hash ever leaves this machine. It reveals nothing about what you spent, where,
          or with whom — your financial data stays local.
        </p>

        {latestAnchor ? (
          <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
            <p className="text-xs text-zinc-500">
              Last anchored{" "}
              <span className="font-medium">
                {new Date(latestAnchor.created).toLocaleString("en-MY", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>{" "}
              · entries {latestAnchor.from_seq}–{latestAnchor.to_seq} ·{" "}
              <span
                className={
                  latestAnchor.status === "failed" ? "text-rose-600" : "text-emerald-600 dark:text-emerald-400"
                }
              >
                {latestAnchor.status === "pending"
                  ? "submitted — awaiting a Bitcoin block"
                  : latestAnchor.status}
              </span>
            </p>
            <p className="mt-1 break-all font-mono text-[11px] text-zinc-400">{latestAnchor.root_hash}</p>
            {latestAnchor.detail && (
              <p className="mt-1 text-[11px] text-zinc-400">{latestAnchor.detail}</p>
            )}
            {latestAnchor.proof_b64 && (
              <p className="mt-2 text-xs">
                <a
                  href={`/api/ledger/anchor?id=${latestAnchor.id}`}
                  className="text-amber-600 hover:underline"
                >
                  ⬇️ Download the .ots proof
                </a>
                <span className="text-zinc-400">
                  {" "}
                  — verify it yourself with <code>ots verify</code>, or at{" "}
                  <a
                    href="https://opentimestamps.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-zinc-600"
                  >
                    opentimestamps.org
                  </a>
                  . It does not depend on us being honest, or even online.
                </span>
              </p>
            )}
          </div>
        ) : (
          <p className="mt-4 text-xs text-zinc-400">Not anchored yet.</p>
        )}

        {can(ctx.accessRole, "manage_graph") && chain.length > 0 && (
          <AnchorButton disabled={!chain.ok} />
        )}
      </section>

      {/* The trail */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Every change ({chain.length})
        </h2>

        {entries.length === 0 ? (
          <p className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            Nothing has been recorded yet. Add a spend and it will appear here.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            {entries.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center gap-2 border-b border-zinc-50 px-4 py-2.5 text-sm last:border-0 dark:border-zinc-800/60"
              >
                <span className="w-10 shrink-0 font-mono text-xs text-zinc-400">#{e.seq}</span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${OP_STYLE[e.op] ?? ""}`}
                >
                  {OP_LABEL[e.op] ?? e.op}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">
                  {describe(e.after ?? e.before)}
                </span>
                <span className="shrink-0 text-xs text-zinc-400">{labels.get(e.actor) || e.actor_email || "system"}</span>
                <span className="shrink-0 text-xs text-zinc-400">
                  {new Date(e.at).toLocaleString("en-MY", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <span
                  className="shrink-0 font-mono text-[10px] text-zinc-300 dark:text-zinc-600"
                  title={`hash ${e.hash}\nprevious ${e.prev_hash}`}
                >
                  {e.hash.slice(0, 8)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function describe(payload: Record<string, unknown> | null): string {
  if (!payload) return "—";
  const amount = payload.amount;
  const when = payload.occurred_at;
  const bits: string[] = [];
  if (typeof amount === "number") bits.push(`RM ${amount.toFixed(2)}`);
  if (typeof when === "string" && when) {
    bits.push(new Date(when).toLocaleDateString("en-MY", { day: "numeric", month: "short" }));
  }
  if (typeof payload.source === "string" && payload.source) bits.push(String(payload.source));
  return bits.join(" · ") || "—";
}
