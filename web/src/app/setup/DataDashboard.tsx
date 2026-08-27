import Link from "next/link";
import { getContext, listMembers } from "@/lib/household";
import { getConsents, OFFERED_PURPOSES, type ConsentMap } from "@/lib/consent";
import { getShares } from "@/lib/sharingStore";
import { SHARE_SPECS } from "@/lib/sharing";
import { activeAiProvider } from "@/lib/config";

// "What do you actually hold about me, and where is it?"
//
// The privacy notice answers that in prose, for everybody. This answers it in
// numbers, for one person, from the live database — which is a different and
// harder claim to make, and the only one a sceptical user can check. A notice
// says "we store your records in the Asia-Pacific region"; this says "412
// records, 38 receipts, 2 people can see the must-pay ones, your AI provider is
// the local model, here is the button that downloads all of it".
//
// Rendered on the server so no figure passes through a client component that
// could be inspected, and so a person who has disabled JavaScript still gets
// the disclosure. Every count is scoped to the viewer.

async function counts(tenantId: string, memberId: string) {
  // Imported lazily so this component adds nothing to the bundle of pages that
  // do not render it.
  const { pbList, pbStr } = await import("@/lib/pocketbase");
  const [txns, vaults] = await Promise.all([
    pbList<{ id: string; attachments?: string[] | string; paid_by?: string; member?: string }>(
      "transactions",
      { filter: `tenant = ${pbStr(tenantId)}`, perPage: 2000 },
    ).catch(() => []),
    pbList<{ id: string }>("vaults", { filter: `user = ${pbStr(memberId)}` }).catch(() => []),
  ]);
  const mine = txns.filter((t) => (t.paid_by || t.member || "") === memberId);
  const files = txns.reduce((n, t) => {
    const a = Array.isArray(t.attachments) ? t.attachments : t.attachments ? [t.attachments] : [];
    return n + a.length;
  }, 0);
  return { household: txns.length, mine: mine.length, files, vaults: vaults.length };
}

export default async function DataDashboard() {
  const ctx = await getContext().catch(() => null);
  if (!ctx) return null;

  const [members, consents, shares, stats] = await Promise.all([
    listMembers(ctx.tenant.id).catch(() => []),
    // Typed fallback, not a bare {}: an unreachable database must read as
    // "nothing agreed", never as something the index signature cannot reject.
    getConsents(ctx.user.id).catch((): ConsentMap => ({})),
    getShares(ctx.memberId).catch(() => null),
    counts(ctx.tenant.id, ctx.memberId).catch(() => null),
  ]);

  const others = members.filter((m) => m.id !== ctx.memberId);
  const provider = activeAiProvider();
  const aiOn = consents.ai_processing?.granted === true;
  const sharedTypes = shares ? SHARE_SPECS.filter((s) => shares[s.key].shared) : [];

  const rows: { label: string; value: string; where: string }[] = [
    {
      label: "Money records in this household",
      value: stats ? String(stats.household) : "—",
      where: "Database in Singapore (DOM Cloud) · in the daily encrypted backup",
    },
    {
      label: "Records attributed to you",
      value: stats ? String(stats.mine) : "—",
      where: "Same database · what your sharing switches govern",
    },
    {
      label: "Receipt and statement files",
      value: stats ? String(stats.files) : "—",
      where: "Same database · delete any of them from its record",
    },
    {
      label: "Sealed backups you made",
      value: stats ? String(stats.vaults) : "—",
      where: "Encrypted in your browser · we cannot read these",
    },
    {
      label: "People who share this household",
      value: String(others.length),
      where: others.length ? others.map((m) => m.display_name || "Member").join(", ") : "Nobody",
    },
    {
      label: "AI provider",
      value: aiOn ? provider : "off",
      where: aiOn
        ? provider === "ollama"
          ? "A local model on hardware we operate in Malaysia — nothing leaves it"
          : "Processed outside Malaysia · only when you use an AI feature"
        : "No AI feature runs. Everything else still works.",
    },
    {
      label: "Kinds of data you share with your household",
      value: `${sharedTypes.length} of ${SHARE_SPECS.length}`,
      where: sharedTypes.length
        ? sharedTypes.map((s) => s.label).join(", ")
        : "Nothing — everything is private to you",
    },
    {
      label: "Optional purposes you have agreed to",
      value: String(
        OFFERED_PURPOSES.filter((p) => !p.required && consents[p.key]?.granted === true).length,
      ),
      where: "AI features and anonymous statistics · both off unless you switched them on",
    },
  ];

  return (
    <div>
      <p className="mb-4 text-zinc-600 dark:text-zinc-400">
        Counted from the database just now, for your account — not a description of what we might
        hold, but what is actually there.
      </p>

      <dl className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <dt className="flex-1 text-sm font-medium">{r.label}</dt>
            <dd className="text-sm font-semibold tabular-nums">{r.value}</dd>
            <dd className="w-full text-xs text-zinc-500">{r.where}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {[
          ["/vault", "💾 Keep your own copy", "A location you choose, readable offline"],
          ["/api/account/export", "⬇️ Export everything", "Machine-readable JSON, one click"],
          ["/sharing", "🔐 Change what you share", "Per kind of data, retroactive"],
          ["/records", "✏️ Correct a record", "Edit or void anything you entered"],
          ["/sharing/leave", "🚪 Leave the household", "Immediate, needs nobody's approval"],
          ["/legal/retention", "🗓️ How long we keep things", "The schedule, per kind of data"],
          ["/delete-account", "🗑️ Close my account", "Purged permanently within 30 days"],
        ].map(([href, label, desc]) => (
          <Link
            key={href}
            href={href}
            className="rounded-xl border border-zinc-200 p-3 hover:border-amber-400 dark:border-zinc-800 dark:hover:border-amber-700"
          >
            <span className="block text-sm font-medium">{label}</span>
            <span className="block text-xs text-zinc-500">{desc}</span>
          </Link>
        ))}
      </div>

      {/* The dashboard counts records and names where they live. Without this
          line a reader can walk away thinking "in our database" means "and only
          you can read them". It does not, and the honest place to say so is the
          screen that just told them how many records there are. */}
      <p className="mt-5 rounded-xl border border-zinc-300 bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400">
        <strong className="text-zinc-800 dark:text-zinc-200">Who can read the above:</strong> you,
        whoever you have shared with, and us. HoneyMoney is not zero-knowledge — your records are
        stored readable because the server computes your dashboard and H-Score over them, and a
        small number of people on our team hold credentials that can read any household. Your
        sharing switches make data private from your household, not from the operator. The one
        thing we genuinely cannot read is a sealed backup, encrypted in your browser with a
        passphrase we never receive.{" "}
        <Link href="/privacy#recipients" className="font-medium text-amber-600 hover:underline">
          The full disclosure
        </Link>
      </p>

      <p className="mt-4 text-xs leading-relaxed text-zinc-500">
        Something here look wrong, or want a copy of anything not listed? Write to{" "}
        <strong>privacy@honeymoney.app</strong> — we aim to answer within 21 days, which is the
        period the PDPA allows for a data access request.
      </p>
    </div>
  );
}
