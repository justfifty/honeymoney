import Link from "next/link";
import type { FocusGroups, FocusOption } from "@/lib/focusView";
import PeopleMenu from "./PeopleMenu";

// The focus selector: pick a lens from any dimension — income stream, bucket,
// vendor, category, or person — and the whole page re-renders through it.
// Structural dimensions are plain <details> + <Link> (server nav, no JS needed);
// the People dimension is a client menu so the roster can grow or shrink.

function href(tenantId: string, mode: string, focus: string) {
  return `/graph?tenantId=${tenantId}&mode=${mode}&focus=${focus}`;
}

function Dropdown({
  title,
  badge,
  options,
  active,
  tenantId,
  mode,
}: {
  title: string;
  badge: string;
  options: FocusOption[];
  active: string;
  tenantId: string;
  mode: string;
}) {
  const activeHere = options.some((o) => o.value === active);
  return (
    <details className="group relative">
      <summary
        className={`flex cursor-pointer list-none items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${
          activeHere
            ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
            : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        }`}
      >
        {badge} {title}
        <span className="text-zinc-400">▾</span>
      </summary>
      <div className="absolute left-0 z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        {options.length === 0 && <p className="px-3 py-2 text-xs text-zinc-400">none yet</p>}
        {options.map((o) => (
          <Link
            key={o.value}
            href={href(tenantId, mode, o.value)}
            className={`flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-xs ${
              o.value === active ? "bg-amber-500 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            <span className="truncate">{o.badge} {o.label}</span>
            {o.hint && <span className={`shrink-0 text-[10px] ${o.value === active ? "text-amber-100" : "text-zinc-400"}`}>{o.hint}</span>}
          </Link>
        ))}
      </div>
    </details>
  );
}

export default function FocusBar({
  tenantId,
  mode,
  focusParam,
  groups,
  focusLabel,
  focusBadge,
  roleOptions,
  categoryBadge,
}: {
  tenantId: string;
  mode: string;
  focusParam: string;
  groups: FocusGroups;
  focusLabel: string;
  focusBadge: string;
  roleOptions: string[];
  categoryBadge: string;
}) {
  const focused = focusParam !== "all";
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Lens</span>

      <PeopleMenu tenantId={tenantId} mode={mode} active={focusParam} members={groups.member} roleOptions={roleOptions} />
      <span className="text-zinc-300 dark:text-zinc-700">|</span>
      <Dropdown title="Income" badge="💰" options={groups.income} active={focusParam} tenantId={tenantId} mode={mode} />
      <Dropdown title="Bucket" badge="🪣" options={groups.bucket} active={focusParam} tenantId={tenantId} mode={mode} />
      <Dropdown title="Vendor" badge="🏪" options={groups.vendor} active={focusParam} tenantId={tenantId} mode={mode} />
      <Dropdown title="Category" badge={categoryBadge} options={groups.category} active={focusParam} tenantId={tenantId} mode={mode} />

      {focused ? (
        <span className="ml-1 flex items-center gap-2 rounded-full bg-amber-100 py-1 pl-3 pr-1 text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
          {focusBadge} {focusLabel}
          <Link
            href={href(tenantId, mode, "all")}
            aria-label="Clear focus"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-amber-800 hover:bg-amber-300 dark:bg-amber-900 dark:text-amber-200"
          >
            ✕
          </Link>
        </span>
      ) : (
        <span className="ml-1 text-xs text-zinc-400">🌐 whole graph</span>
      )}
    </div>
  );
}
