"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FocusOption } from "@/lib/focusView";

// People lens + roster management. A household is 4 today, 5 after a new baby;
// a café is 3 staff today, 8 in December — so the roster is editable inline and
// the "focus by person" list is always whatever the roster currently is.

export default function PeopleMenu({
  tenantId,
  mode,
  active,
  members,
}: {
  tenantId: string;
  mode: string;
  active: string;
  members: FocusOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const activeHere = members.some((m) => m.value === active);

  async function call(method: "POST" | "DELETE", body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/members", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setName("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
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
        🧑 People
        <span className="rounded-full bg-zinc-200 px-1.5 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">{members.length}</span>
        <span className="text-zinc-400">▾</span>
      </summary>
      <div className="absolute left-0 z-20 mt-1 w-64 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <div className="max-h-56 overflow-y-auto">
          {members.length === 0 && <p className="px-3 py-2 text-xs text-zinc-400">No people yet — add one below.</p>}
          {members.map((m) => {
            const id = m.value.split(":")[1];
            return (
              <div key={m.value} className={`flex items-center justify-between gap-1 rounded-lg pr-1 ${m.value === active ? "bg-amber-500 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
                <Link href={`/graph?tenantId=${tenantId}&mode=${mode}&focus=${m.value}`} className="flex flex-1 items-center justify-between gap-2 truncate px-3 py-1.5 text-xs">
                  <span className="truncate">🧑 {m.label}</span>
                  {m.hint && <span className={`shrink-0 text-[10px] ${m.value === active ? "text-amber-100" : "text-zinc-400"}`}>{m.hint}</span>}
                </Link>
                <button
                  type="button"
                  onClick={() => call("DELETE", { memberId: id })}
                  disabled={busy}
                  aria-label={`Remove ${m.label}`}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${m.value === active ? "text-amber-100 hover:bg-amber-600" : "text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"}`}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) call("POST", { displayName: name.trim(), role });
          }}
          className="mt-1 border-t border-zinc-100 p-2 dark:border-zinc-800"
        >
          <div className="flex items-center gap-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Add a person / staff…"
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs outline-none focus:border-amber-500 dark:border-zinc-700"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-md border border-zinc-300 bg-transparent px-1 py-1 text-xs outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="owner">owner</option>
              <option value="member">member</option>
              <option value="child">child</option>
              <option value="staff">staff</option>
            </select>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="rounded-md bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              +
            </button>
          </div>
          {err && <p className="mt-1 text-[10px] text-rose-600">{err}</p>}
        </form>
      </div>
    </details>
  );
}
