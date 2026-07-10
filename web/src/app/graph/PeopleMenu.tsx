"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FocusOption } from "@/lib/focusView";
import { t as translate, type Locale } from "@/lib/i18n";

// People lens + roster management. A household is 4 today, 5 after a new baby;
// a café is 3 staff today, 8 in December — so the roster is editable inline and
// the "focus by person" list is always whatever the roster currently is.
// Removal is two-step (confirm) because it is destructive; each action shows its
// own pending state so the menu never feels frozen.

const ADD = "__add__";

export default function PeopleMenu({
  tenantId,
  mode,
  active,
  members,
  roleOptions,
  lang = "en",
}: {
  tenantId: string;
  mode: string;
  active: string;
  members: FocusOption[];
  roleOptions: string[];
  lang?: Locale;
}) {
  const router = useRouter();
  const tr = (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars);
  const [name, setName] = useState("");
  const [role, setRole] = useState(roleOptions[1] ?? roleOptions[0] ?? "member");
  const [pending, setPending] = useState<string | null>(null); // member id or ADD
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const activeHere = members.some((m) => m.value === active);

  async function call(method: "POST" | "DELETE", body: Record<string, unknown>, token: string) {
    setPending(token);
    setErr(null);
    try {
      const res = await fetch("/api/members", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? tr("g.people.reqFail"));
      if (method === "POST") setName("");
      setConfirmId(null);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr("g.people.reqFail"));
    } finally {
      setPending(null);
    }
  }

  return (
    <details className="group relative">
      <summary
        className={`flex cursor-pointer list-none items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${
          activeHere
            ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
            : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        }`}
      >
        🧑 {tr("g.people.title")}
        <span className={`rounded-full px-1.5 text-[10px] ${members.length === 0 ? "animate-pulse bg-amber-200 text-amber-700 dark:bg-amber-900 dark:text-amber-300" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"}`}>{members.length === 0 ? "+" : members.length}</span>
        <span className="text-zinc-400">▾</span>
      </summary>
      <div className="absolute left-0 z-20 mt-1 w-72 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{tr("g.people.focusOn")}</span>
          {members.length > 0 && <span className="text-[10px] text-zinc-400">{tr("g.people.onRoster", { n: members.length })}</span>}
        </div>

        <div className="max-h-56 overflow-y-auto">
          {members.length === 0 && (
            <p className="px-3 py-2 text-xs text-zinc-400">{tr("g.people.empty")}</p>
          )}
          {members.map((m) => {
            const id = m.value.split(":")[1];
            const isActive = m.value === active;
            const isPending = pending === id;
            const isConfirming = confirmId === id;
            return (
              <div
                key={m.value}
                className={`flex items-center justify-between gap-1 rounded-lg pr-1 ${isActive ? "bg-amber-500 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
              >
                <Link
                  href={`/graph?tenantId=${tenantId}&mode=${mode}&focus=${m.value}&lang=${lang}`}
                  className="flex flex-1 items-center justify-between gap-2 truncate px-3 py-1.5 text-xs"
                >
                  <span className="truncate">🧑 {m.label}</span>
                  {m.hint && <span className={`shrink-0 text-[10px] ${isActive ? "text-amber-100" : "text-zinc-400"}`}>{m.hint}</span>}
                </Link>

                {isPending ? (
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center text-[11px] ${isActive ? "text-amber-100" : "text-zinc-400"}`} aria-live="polite">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                  </span>
                ) : isConfirming ? (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => call("DELETE", { memberId: id }, id)}
                      aria-label={tr("g.people.confirmRemove", { name: m.label })}
                      title={tr("g.people.remove")}
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${isActive ? "bg-white/20 text-white hover:bg-white/30" : "bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-950/60 dark:text-rose-300"}`}
                    >
                      {tr("g.people.remove")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      aria-label={tr("g.people.cancel")}
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${isActive ? "text-amber-100 hover:bg-amber-600" : "text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"}`}
                    >
                      ↩
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setErr(null);
                      setConfirmId(id);
                    }}
                    disabled={pending !== null}
                    aria-label={tr("g.people.removeName", { name: m.label })}
                    title={tr("g.people.removeName", { name: m.label })}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] disabled:opacity-40 ${isActive ? "text-amber-100 hover:bg-amber-600" : "text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) call("POST", { displayName: name.trim(), role }, ADD);
          }}
          className="mt-1 border-t border-zinc-100 p-2 dark:border-zinc-800"
        >
          <div className="flex items-center gap-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder={tr("g.people.namePh")}
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-amber-500 dark:border-zinc-700"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              aria-label={tr("g.people.role")}
              className="rounded-md border border-zinc-300 bg-transparent px-1 py-1 text-xs capitalize outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900"
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={pending !== null || !name.trim()}
              className="flex h-6 w-7 items-center justify-center rounded-md bg-amber-500 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {pending === ADD ? <span className="inline-block h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" /> : "+"}
            </button>
          </div>
          {err && <p className="mt-1 text-[10px] text-rose-600">⚠️ {err}</p>}
          <p className="mt-1 text-[10px] text-zinc-400">{tr("g.people.help")}</p>
        </form>
      </div>
    </details>
  );
}
