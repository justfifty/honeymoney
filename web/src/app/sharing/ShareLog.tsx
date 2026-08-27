"use client";

import { useEffect, useState } from "react";

// Who has read what of yours.
//
// The honest framing matters more than the feature. An access log that showed
// only "nobody has viewed anything" would be reassuring and useless, because a
// reader cannot tell reassurance from an empty table. So this component says
// what it is recording, since when, and what it does not cover — and it says
// that in the empty state too, which is where a log spends most of its life.

interface Event {
  id: string;
  at: string;
  kind: string;
  type: string | null;
  typeLabel: string | null;
  actor: string;
  isMe: boolean;
  detail: string;
}

const ICON: Record<string, string> = {
  share_granted: "🔓",
  share_revoked: "🔒",
  revoke_all: "🛑",
  detail_viewed: "👁️",
  member_joined: "➕",
  member_left: "🚪",
  member_removed: "➖",
  export_taken: "⬇️",
};

function when(iso: string): string {
  const d = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ShareLog() {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [since, setSince] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/account/share-log")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.ok) {
          setEvents(d.events);
          setSince(d.recordingSince ?? "");
        } else setErr(d.error ?? "Could not load the log.");
      })
      .catch(() => alive && setErr("Could not load the log."));
    return () => {
      alive = false;
    };
  }, []);

  if (err) return <p className="text-sm text-rose-600">{err}</p>;
  if (!events) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div>
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Every time someone in your household opens data you have chosen to share, it is recorded
        here — along with every change you have made to your own sharing, and everyone joining or
        leaving. Nobody can delete a line from this list, including us.
      </p>

      {events.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-300 p-5 text-sm leading-relaxed text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">Nothing recorded yet.</p>
          <p className="mt-1">
            That means nobody in your household has opened anything of yours since we started
            recording{since ? ` on ${since}` : ""} — not that we are failing to look. If you were in
            a household before that date, accesses from before it were never recorded and cannot be
            reconstructed.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {events.map((e) => (
            <li
              key={e.id}
              className="flex gap-3 rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800"
            >
              <span aria-hidden className="text-base leading-none">
                {ICON[e.kind] ?? "•"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="leading-relaxed">
                  <strong>{e.isMe ? "You" : e.actor}</strong>{" "}
                  <span className="text-zinc-600 dark:text-zinc-400">{e.detail}</span>
                </p>
                <p className="mt-0.5 text-xs text-zinc-400">{when(e.at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs leading-relaxed text-zinc-500">
        What this does not cover: someone reading over your shoulder, a screenshot taken before you
        revoked a share, or anything you told them yourself. A log records access through the app,
        which is the only thing the app can honestly claim to know about.
      </p>
    </div>
  );
}
