import Link from "next/link";

export const metadata = {
  title: "HoneyMoney — Guide, Disclaimer & Privacy",
};

// In-app guide: how to use + the disclaimer + the privacy promise, in plain
// language. Linked from every screen so a first-time user (or a judge) can find
// "what is this, is my data safe, how do I use it" without leaving the app.
export default function GuidePage() {
  return (
    <main className="mx-auto min-h-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">🍯 HoneyMoney — Guide</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/graph" className="text-amber-600 hover:underline">🕸️ Graph</Link>
          <Link href="/dashboard" className="text-zinc-500 hover:underline">Dashboard</Link>
        </nav>
      </header>
      <p className="mt-2 text-sm text-zinc-500">
        Funding transparency, spending autonomy — one money engine for personal, family and business.
      </p>

      {/* How to use */}
      <Section title="📖 How to use it" tone="plain">
        <ol className="list-decimal space-y-2 pl-5">
          <li><b>Pick a persona</b> — the switcher at the top of <Link className="text-amber-600 hover:underline" href="/graph">/graph</Link> flips between a household, a business, or a solo person. Same engine, different labels.</li>
          <li><b>Read the money as a picture</b> — six views over the same data: <i>Sankey</i> (flow of every ringgit), <i>Treemap</i> (where the budget sits), <i>Tree</i>, <i>Organic</i> network, <i>Budget</i> bars, and <i>Flow</i>.</li>
          <li><b>Focus a lens</b> — slice everything by an income stream, a bucket/expense, a category, or a <b>person</b> (their spend only). One click to clear.</li>
          <li><b>Add anything</b> — the <b>➕ Add to the graph</b> panel adds a spend, an income stream, a bucket/department, or an allocation. For a spend you can <b>type it, 🎤 speak it, or 📷 scan a receipt</b> — the last two run on your device, free, with no AI tokens.</li>
          <li><b>The 3 buckets</b> — money splits into <i>Needs &amp; Fixed</i>, <i>Savings &amp; Goals</i> (your Future Shield), and <i>Personal</i> — the personal wallet is <b>not itemized</b>, by design.</li>
        </ol>
      </Section>

      {/* Privacy */}
      <Section title="🔒 Your privacy" tone="good">
        <ul className="list-disc space-y-2 pl-5">
          <li><b>Local-first by default.</b> The demo runs on a local database on the operator&apos;s machine — your household data does not need to leave it.</li>
          <li><b>Screenshots are read, not kept.</b> When a receipt is parsed, we store the structured fields (vendor, amount, date) — <b>not</b> the raw image.</li>
          <li><b>On-device capture sends nothing.</b> Voice and receipt scanning run in your browser; that audio/image never leaves your device.</li>
          <li><b>Personal wallets stay private.</b> Bucket-3 spending is not itemized — autonomy over surveillance.</li>
          <li><b>You control the data.</b> Add or remove people any time; removing someone keeps past spend but un-attributes it. No ads. We do not sell your data.</li>
          <li><b>Optional AI is minimal.</b> If the AI insight is enabled, it receives a short summary of your budget status — never your raw transactions or identity.</li>
        </ul>
      </Section>

      {/* Disclaimer */}
      <Section title="⚠️ Disclaimer" tone="warn">
        <ul className="list-disc space-y-2 pl-5">
          <li><b>Not financial advice.</b> HoneyMoney is an informational budgeting &amp; insight tool, not a licensed financial adviser. For personal advice, consult a licensed financial planner or, in Malaysia, <a className="text-amber-600 hover:underline" href="https://www.akpk.org.my" target="_blank" rel="noopener noreferrer">AKPK</a> (free credit counselling).</li>
          <li><b>Not a bank.</b> HoneyMoney does not hold, move, or invest your money. It only helps you see and plan it. Any savings/investment products mentioned belong to their licensed providers.</li>
          <li><b>Figures are estimates.</b> Projections extrapolate from what you enter; they are planning aids, not guarantees. Always verify against your bank/e-wallet statements.</li>
          <li><b>Demo data is synthetic.</b> The Rahman household, the café, and Aisha are illustrative — any resemblance to real people or businesses is coincidental.</li>
          <li><b>Compliance is yours.</b> For business use (tax, EPF/SOCSO/EIS, SST, LHDN e-Invoicing), HoneyMoney is a cashflow lens — file statutory returns through your accountant or approved software.</li>
        </ul>
      </Section>

      <p className="mt-8 text-xs text-zinc-400">
        Questions or a data request? Contact the household/business operator who set up this instance.
        See also the AI use disclosure in the project&apos;s <code>docs/AI_DISCLOSURE.md</code>.
      </p>
    </main>
  );
}

function Section({ title, tone, children }: { title: string; tone: "plain" | "good" | "warn"; children: React.ReactNode }) {
  const ring =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
        : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
  return (
    <section className={`mt-6 rounded-2xl border p-5 text-sm leading-relaxed ${ring}`}>
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
