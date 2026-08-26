"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  open as unseal,
  sealVerified,
  passphraseStrength,
  isSealedVault,
  WrongPassphrase,
  type SealedVault,
} from "@/lib/e2ee";

// Sealed backup — the screen where the privacy claim becomes checkable.
//
// Everything here happens in this component, in this tab. The passphrase is
// never put in state that leaves it, never sent, never stored — not in
// localStorage, not in a cookie, not in a "remember me" the next release would
// quietly add. What crosses the network is the output of AES-256-GCM and
// nothing else, and a visitor can confirm that from their own network tab,
// which is the only form of this promise worth making.
//
// ── WHY THE COPY IS BLUNT ABOUT LOSS ───────────────────────────────────────
//
// A forgotten passphrase means the backup is gone. There is no reset link and
// there cannot be one — a reset link is a key we hold, and a key we hold is the
// thing this feature exists not to have. Products that soften that sentence are
// the ones whose users discover it at the worst possible moment, so it is said
// here in the same size as everything else.

interface VaultSummary {
  id: string;
  label: string;
  bytes: number;
  sealedAt: string;
}

const fmtBytes = (n: number) =>
  n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // Revoked on the next tick: released immediately, Safari cancels the download
  // it was in the middle of starting.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** What is inside, described without showing it. Counts only — see below. */
function describe(json: string): string {
  try {
    const d = JSON.parse(json) as Record<string, unknown>;
    const n = (k: string) => (Array.isArray(d[k]) ? (d[k] as unknown[]).length : 0);
    return `${n("transactions")} records · ${n("nodes")} graph nodes · ${n("members")} member(s)`;
  } catch {
    return "opened, but the contents are not a HoneyMoney export";
  }
}

export default function SealedBackup({ initial = [] }: { initial?: VaultSummary[] }) {
  const router = useRouter();
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<null | string>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sealed, setSealed] = useState<SealedVault | null>(null);
  // Seeded from the server render rather than fetched in an effect: the page
  // already knows this, and a client waterfall to re-learn it would show an
  // empty list for a beat to a user whose backups exist.
  const [vaults, setVaults] = useState<VaultSummary[]>(initial);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const strength = passphraseStrength(pass);

  // ── seal ────────────────────────────────────────────────────────────────
  async function onSeal() {
    setMsg(null);
    if (!strength.ok) {
      setMsg({ ok: false, text: "Use a longer passphrase — at least 12 characters, and ideally four words." });
      return;
    }
    if (pass !== confirm) {
      setMsg({ ok: false, text: "The two passphrases do not match." });
      return;
    }
    setBusy("Reading your records…");
    try {
      // The SAME export the portability right produces — viewer-scoped, so a
      // partner's private records are not in it. One export, one boundary.
      const res = await fetch("/api/account/export");
      if (!res.ok) throw new Error("Could not read your records.");
      const plaintext = await res.text();

      setBusy("Sealing on this device…");
      // Yield a frame so the label above actually paints before PBKDF2 blocks
      // the main thread for a second or so. The wait is the point — it is what
      // makes the file expensive to attack — so it should be visible, not hidden.
      await new Promise((r) => setTimeout(r, 30));
      const vault = await sealVerified(plaintext, pass);
      setSealed(vault);
      setMsg({
        ok: true,
        text: `Sealed ${fmtBytes(JSON.stringify(vault).length)} and verified it opens. Now keep it somewhere.`,
      });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not seal your backup." });
    } finally {
      setBusy(null);
    }
  }

  function onDownload() {
    if (!sealed) return;
    const stamp = sealed.sealedAt.slice(0, 10);
    download(`honeymoney-${stamp}.hmvault`, JSON.stringify(sealed), "application/json");
  }

  async function onUpload() {
    if (!sealed) return;
    setBusy("Uploading the sealed file…");
    setMsg(null);
    try {
      const res = await fetch("/api/account/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vault: sealed, label }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      setMsg({ ok: true, text: "Kept. We hold the ciphertext; you hold the only key." });
      setLabel("");
      if (data.vault) setVaults((v) => [data.vault as VaultSummary, ...v].slice(0, 5));
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setBusy(null);
    }
  }

  // ── open ────────────────────────────────────────────────────────────────
  async function openEnvelope(vault: SealedVault, passphrase: string) {
    setBusy("Opening on this device…");
    setMsg(null);
    try {
      await new Promise((r) => setTimeout(r, 30));
      const plaintext = await unseal(vault, passphrase);
      download(`honeymoney-${vault.sealedAt.slice(0, 10)}.json`, plaintext, "application/json");
      setMsg({ ok: true, text: `Opened: ${describe(plaintext)}. The plain file is in your downloads.` });
    } catch (e) {
      setMsg({
        ok: false,
        text:
          e instanceof WrongPassphrase
            ? "That passphrase does not open this backup. There is no reset — see the note below."
            : e instanceof Error
              ? e.message
              : "Could not open it.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function onOpenStored(id: string) {
    if (!pass) {
      setMsg({ ok: false, text: "Type the passphrase you sealed it with." });
      return;
    }
    setOpeningId(id);
    try {
      const res = await fetch(`/api/account/vault/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not fetch it.");
      await openEnvelope(data.vault as SealedVault, pass);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not fetch it." });
    } finally {
      setOpeningId(null);
    }
  }

  async function onOpenFile(file: File) {
    if (!pass) {
      setMsg({ ok: false, text: "Type the passphrase you sealed it with." });
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      if (!isSealedVault(parsed)) throw new Error("That file is not a HoneyMoney backup.");
      await openEnvelope(parsed, pass);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not read that file." });
    }
  }

  async function onForget(id: string) {
    await fetch(`/api/account/vault/${id}`, { method: "DELETE" });
    setVaults((v) => v.filter((x) => x.id !== id));
    router.refresh();
  }

  const field =
    "min-h-11 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm text-inherit outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <div className="text-sm">
      <p className="text-zinc-600 dark:text-zinc-400">
        A backup of everything you can see, encrypted <b>on this device</b> before it goes anywhere. We
        store the sealed file and cannot open it — not for support, not for a court order, not by
        mistake. Your passphrase never leaves this tab.
      </p>

      {/* One passphrase field serves both sealing and opening: it is the same
          secret, and two fields for one secret invites using two. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Passphrase
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="new-password"
            placeholder="four words you will not forget"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Repeat it (to seal)
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className={field}
          />
        </label>
      </div>

      {pass && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className={
                "h-full rounded-full transition-all " +
                (strength.level === "strong"
                  ? "bg-emerald-500"
                  : strength.level === "fair"
                    ? "bg-amber-500"
                    : "bg-rose-500")
              }
              style={{ width: `${Math.min(100, (strength.bits / 100) * 100)}%` }}
            />
          </div>
          <span className="text-[11px] text-zinc-500">
            {strength.level === "strong"
              ? "Strong"
              : strength.level === "fair"
                ? "Fair — a fourth word would help"
                : "Too easy to guess offline"}
          </span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSeal}
          disabled={Boolean(busy)}
          className="min-h-11 rounded-full bg-amber-600 px-5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
        >
          🔐 Seal a backup
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={Boolean(busy)}
          className="min-h-11 rounded-full border border-zinc-300 px-5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200"
        >
          Open a .hmvault file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".hmvault,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onOpenFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {busy && <p className="mt-3 text-xs text-zinc-500">⏳ {busy}</p>}
      {msg && (
        <p className={`mt-3 text-xs ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}>
          {msg.ok ? "✅ " : "⚠️ "}
          {msg.text}
        </p>
      )}

      {/* Sealed and in hand — now it has to go somewhere. Both options are
          offered together because they answer different failures: the file
          survives us disappearing, the cloud copy survives the laptop dying. */}
      {sealed && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            Sealed {fmtWhen(sealed.sealedAt)} · AES-256-GCM · {sealed.kdf.iterations.toLocaleString()} PBKDF2
            rounds
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={onDownload}
              className="min-h-11 rounded-full bg-zinc-800 px-4 text-xs font-semibold text-white hover:bg-zinc-900 dark:bg-zinc-600"
            >
              ⬇ Download the file
            </button>
            <label className="flex flex-col gap-1 text-[11px] text-amber-800 dark:text-amber-300">
              Label (stored in the clear)
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. before the September reset"
                className="min-h-9 rounded-lg border border-amber-300 bg-white/70 px-2 py-1 text-xs text-inherit outline-none dark:border-amber-800 dark:bg-zinc-900"
              />
            </label>
            <button
              type="button"
              onClick={onUpload}
              disabled={Boolean(busy)}
              className="min-h-11 rounded-full border border-amber-400 px-4 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:text-amber-300 dark:hover:bg-amber-900/40"
            >
              ☁ Keep a copy with us
            </button>
          </div>
        </div>
      )}

      {vaults.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Sealed copies we hold ({vaults.length})
          </h3>
          <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
            {vaults.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{v.label || "Untitled backup"}</span>
                  <span className="block text-[11px] text-zinc-500">
                    {fmtWhen(v.sealedAt)} · {fmtBytes(v.bytes)} · sealed
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onOpenStored(v.id)}
                  disabled={Boolean(busy)}
                  className="min-h-9 rounded-full border border-zinc-300 px-3 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700"
                >
                  {openingId === v.id ? "Opening…" : "Open"}
                </button>
                <button
                  type="button"
                  onClick={() => onForget(v.id)}
                  className="min-h-9 rounded-full px-2 text-xs text-zinc-400 hover:text-rose-600"
                >
                  Forget
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-5 rounded-xl bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        <b>If you forget the passphrase, the backup is gone.</b> There is no reset link, and there cannot
        be one — a reset link would mean we hold a key, which is the thing this avoids. Write it down and
        keep it somewhere other than this laptop. What we can see of a stored copy: its label, its size,
        and when it was sealed.
      </p>
    </div>
  );
}
