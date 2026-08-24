import Link from "next/link";
import { isDatabaseConfigured } from "@/lib/config";
import { getSessionUser } from "@/lib/auth";
import { getAnalytics } from "@/lib/analytics";
import LogoutButton from "./LogoutButton";

export const dynamic = "force-dynamic";

function fmtDur(ms: number): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function flag(cc: string): string {
  if (!cc || cc.length !== 2) return "🏳️";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
}

function Gate({ msg, login }: { msg: string; login?: boolean }) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold tracking-tight">🔐 Admin</h1>
        <p className="mt-2 text-sm text-zinc-500">{msg}</p>
        <div className="mt-5 flex justify-center gap-3">
          {login && (
            <Link href="/login" className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600">
              Log in
            </Link>
          )}
          <Link href="/" className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            ← Home
          </Link>
        </div>
      </div>
    </main>
  );
}

export default async function AdminPage() {
  if (!isDatabaseConfigured()) return <Gate msg="Database not configured." />;
  const user = await getSessionUser();
  if (!user) return <Gate msg="Please log in to view site performance." login />;
  if (user.role !== "admin") return <Gate msg="This area is for administrators only." />;

  const a = await getAnalytics();
  const usd = (n: number) => `$${n.toFixed(2)}`;

  return (
    <main className="mx-auto min-h-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">🔐 Admin · site performance</h1>
          <p className="text-sm text-zinc-500">Signed in as {user.email}</p>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/records" className="text-zinc-500 hover:underline">🧾 Records</Link>
          <Link href="/graph" className="text-zinc-500 hover:underline">🕸️ Graph</Link>
          <Link href="/" className="text-zinc-500 hover:underline">← Home</Link>
          <LogoutButton />
        </nav>
      </header>

      {/* overview */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total visits" value={String(a.totalVisits)} />
        <Stat label="Unique visitors" value={String(a.uniqueVisitors)} />
        <Stat label="Countries" value={String(a.countries)} />
        <Stat label="Avg duration" value={fmtDur(a.avgDurationMs)} />
        <Stat label="AI tokens" value={a.ai.total.toLocaleString()} />
        <Stat label="Spend to date" value={usd(a.totalSpendUsd)} tone="spend" />
      </section>

      {/* cost ledger */}
      <Section title="💵 Cost monitoring (development + infra)">
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <Th>Item</Th><Th>Category</Th><Th>Vendor</Th><Th>Date</Th><Th right>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {a.costs.map((c) => (
                <tr key={c.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <Td>{c.label}</Td>
                  <Td><span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">{c.category || "—"}</span></Td>
                  <Td>{c.vendor || "—"}</Td>
                  <Td>{c.incurred_on ? fmtTime(c.incurred_on) : "—"}</Td>
                  <Td right>{c.amount.toFixed(2)} {c.currency || "USD"}</Td>
                </tr>
              ))}
              <tr className="border-t border-zinc-200 dark:border-zinc-700">
                <Td>AI development tokens ({a.ai.total.toLocaleString()} tok)</Td>
                <Td><span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">ai</span></Td>
                <Td>Google Gemini</Td>
                <Td>start-to-date</Td>
                <Td right>≈ {usd(a.ai.estUsd)}</Td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 bg-zinc-50 font-semibold dark:border-zinc-700 dark:bg-zinc-900">
                <Td>Total (USD items + AI est.)</Td><Td /><Td /><Td />
                <Td right>{usd(a.totalSpendUsd)}</Td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          AI cost is an estimate at gemini-2.0-flash rates ($0.10/$0.40 per 1M in/out tokens).
          {a.ai.total === 0 && " Currently 0 tokens — no Gemini key configured, so runtime AI spend is genuinely nil."}
          {a.costByCurrency.filter((c) => c.currency !== "USD").map((c) => ` · ${c.total.toFixed(2)} ${c.currency} in non-USD items`)}
        </p>
      </Section>

      {/* traffic */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Section title="📄 Top pages">
          <List
            rows={a.topPages.map((p) => ({ left: p.path, mid: fmtDur(p.avgMs), right: String(p.count) }))}
            headers={["Page", "Avg time", "Visits"]}
            empty="No page views yet."
          />
        </Section>
        <Section title="🌍 Top countries">
          <List
            rows={a.topCountries.map((c) => ({ left: `${flag(c.country)} ${c.country || "Unknown"}`, right: String(c.count) }))}
            headers={["Country", "Visits"]}
            empty="No country data yet (comes from Cloudflare on live visits)."
          />
        </Section>
        {/* The Visitor IPs card is gone because the data is: /api/track no
            longer stores IPs, user-agents, or account ids. An admin screen
            showing per-person rows was itself a disclosure surface. */}
        <Section title="🤖 AI usage by function">
          <List
            rows={a.ai.byFn.map((f) => ({ left: f.fn, mid: `${f.calls} calls`, right: f.total.toLocaleString() }))}
            headers={["Function", "Calls", "Tokens"]}
            empty="No AI calls yet (set a Gemini/Groq key to start logging)."
          />
        </Section>
      </div>

      {/* recent visits */}
      <Section title="🕘 Recent visits">
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr><Th>When</Th><Th>Page</Th><Th>Country</Th><Th right>Duration</Th></tr>
            </thead>
            <tbody>
              {a.recent.length === 0 && (
                <tr><Td>—</Td><Td colSpan={3}>No visits recorded yet.</Td></tr>
              )}
              {a.recent.map((v) => (
                <tr key={v.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <Td>{fmtTime(v.created)}</Td>
                  <Td>{v.path}</Td>
                  <Td>{flag(v.country)} {v.country || "—"}</Td>
                  <Td right>{fmtDur(Number(v.duration_ms) || 0)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <p className="mt-8 text-xs text-zinc-400">
        Analytics are first-party (stored in your own PocketBase) — no third-party trackers.
        IP + country come from Cloudflare edge headers on live visits.
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "spend" }) {
  return (
    <div className={`rounded-xl border bg-white p-3 dark:bg-zinc-900 ${tone === "spend" ? "border-rose-300 dark:border-rose-900" : "border-zinc-200 dark:border-zinc-800"}`}>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function List({
  rows,
  headers,
  empty,
}: {
  rows: { left: string; mid?: string; right: string }[];
  headers: string[];
  empty: string;
}) {
  if (rows.length === 0) return <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-xs text-zinc-500 dark:border-zinc-700">{empty}</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
          <tr>{headers.map((h, i) => <Th key={h} right={i === headers.length - 1 && headers.length > 1}>{h}</Th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
              <Td>{r.left}</Td>
              {r.mid !== undefined && <Td>{r.mid}</Td>}
              <Td right>{r.right}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2 font-medium ${right ? "text-right" : ""}`}>{children}</th>;
}

function Td({ children, right, colSpan }: { children?: React.ReactNode; right?: boolean; colSpan?: number }) {
  return <td colSpan={colSpan} className={`px-3 py-2 ${right ? "text-right tabular-nums" : ""}`}>{children}</td>;
}
