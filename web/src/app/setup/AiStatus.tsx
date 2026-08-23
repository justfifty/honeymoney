"use client";

import { useCallback, useEffect, useState } from "react";

// The AI engine panel on /setup — two halves that answer two different questions.
//
//  1. "Does an engine answer?"  /api/ai/check probes each provider live. Before
//     this, /setup only printed which provider an environment variable named,
//     which is a claim about configuration, not about whether a key is valid.
//     The three states are kept apart deliberately — not configured, key set but
//     rejected, answering — because collapsing the middle one into "not set up"
//     sends people to re-paste a key that was never the problem.
//
//  2. "Whose key is it?"  A household can store its own, so Ask Honey works
//     without the person who runs the server. The key is encrypted by the app
//     before PocketBase sees it (lib/aiKeys.ts) and is never sent back to the
//     browser — only its last four characters, which is enough to answer "is the
//     key I think is here the one that is here?" and useless to anyone else.

type Provider = "gemini" | "groq" | "ollama";

interface ProviderHealth {
  provider: Provider;
  configured: boolean;
  ok: boolean;
  model: string;
  latencyMs: number;
  reply?: string;
  error?: string;
}

interface CheckResult {
  active: Provider;
  usingHouseholdKey: boolean;
  anyConfigured: boolean;
  providers: ProviderHealth[];
}

interface StoredKey {
  provider: Provider;
  last4: string;
  model: string;
  url: string;
  updated: string;
}

interface KeyState {
  key: StoredKey | null;
  canManage: boolean;
  secretsKeyReady: boolean;
  serverHasEngine: boolean;
}

export interface AiStatusStrings {
  testBtn: string;
  testing: string;
  retest: string;
  ready: string;
  noneReady: string;
  colProvider: string;
  colStatus: string;
  live: string;
  keyBad: string;
  notSet: string;
  active: string;
  howTo: string;
  askHint: string;
  failed: string;
  ownTitle: string;
  ownBody: string;
  ownSaved: string;
  ownNone: string;
  ownNotOwner: string;
  ownSignedOut: string;
  fieldKey: string;
  fieldUrl: string;
  fieldModel: string;
  modelHint: string;
  save: string;
  saving: string;
  remove: string;
  removed: string;
  savedOk: string;
  usingOwn: string;
}

const HOW_TO: Record<Provider, { title: string; cost: string; steps: string[]; link: string }> = {
  groq: {
    title: "Groq",
    cost: "Free tier, no card. Fastest to set up.",
    steps: [
      "Create an API key at console.groq.com/keys",
      "AI_PROVIDER=groq",
      "GROQ_API_KEY=gsk_…",
      "GROQ_MODEL=llama-3.3-70b-versatile",
    ],
    link: "https://console.groq.com/keys",
  },
  gemini: {
    title: "Gemini Flash",
    cost: "Free tier, no card. The only engine that also reads receipt images.",
    steps: [
      "Create an API key at aistudio.google.com/apikey",
      "AI_PROVIDER=gemini",
      "GEMINI_API_KEY=…",
      "GEMINI_MODEL=gemini-2.0-flash",
    ],
    link: "https://aistudio.google.com/apikey",
  },
  ollama: {
    title: "Ollama (local)",
    cost: "Zero cost, zero cloud — nothing leaves the machine it runs on.",
    steps: [
      "Install from ollama.com/download, then: ollama pull llama3.2",
      "AI_PROVIDER=ollama",
      "OLLAMA_URL=http://localhost:11434",
      "OLLAMA_MODEL=llama3.2",
    ],
    link: "https://ollama.com/download",
  },
};

const ORDER: Provider[] = ["groq", "gemini", "ollama"];

export default function AiStatus({
  activeProvider,
  signedIn,
  strings: s,
}: {
  activeProvider: string;
  signedIn: boolean;
  strings: AiStatusStrings;
}) {
  const [state, setState] = useState<"idle" | "testing" | "done" | "error">("idle");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [open, setOpen] = useState<Provider | null>(null);

  const [keyState, setKeyState] = useState<KeyState | null>(null);
  const [form, setForm] = useState<{ provider: Provider; apiKey: string; url: string; model: string }>({
    provider: "gemini",
    apiKey: "",
    url: "",
    model: "",
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const loadKey = useCallback(async () => {
    if (!signedIn) return;
    try {
      const res = await fetch("/api/ai/key", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as KeyState & { ok: boolean };
      setKeyState(data);
      if (data.key) {
        setForm((f) => ({ ...f, provider: data.key!.provider, model: data.key!.model, url: data.key!.url }));
      }
    } catch {
      /* the panel still works without it; the probe half is independent */
    }
  }, [signedIn]);

  useEffect(() => {
    void loadKey();
  }, [loadKey]);

  async function test() {
    setState("testing");
    try {
      const res = await fetch("/api/ai/check", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setResult((await res.json()) as CheckResult);
      setState("done");
    } catch {
      setResult(null);
      setState("error");
    }
  }

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice({ kind: "err", text: data?.error ?? "Could not save." });
      } else {
        setNotice({ kind: "ok", text: s.savedOk });
        // Clear the field the moment it is stored. Leaving a live credential
        // sitting in a DOM input after it has been saved is free risk.
        setForm((f) => ({ ...f, apiKey: "" }));
        await loadKey();
        await test();
      }
    } catch {
      setNotice({ kind: "err", text: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/key", { method: "DELETE" });
      if (res.ok) {
        setNotice({ kind: "ok", text: s.removed });
        setForm((f) => ({ ...f, apiKey: "" }));
        await loadKey();
      } else {
        const data = await res.json().catch(() => ({}));
        setNotice({ kind: "err", text: data?.error ?? "Could not remove." });
      }
    } finally {
      setBusy(false);
    }
  }

  const health = (p: Provider) => result?.providers.find((x) => x.provider === p);
  const anyLive = result?.providers.some((p) => p.ok) ?? false;
  const stored = keyState?.key ?? null;
  const needsSecretsKey = form.provider !== "ollama" && keyState?.secretsKeyReady === false;

  return (
    <div>
      {/* ── Half 1: does anything answer? ─────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={test}
          disabled={state === "testing"}
          className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
        >
          {state === "testing" ? s.testing : state === "idle" ? s.testBtn : s.retest}
        </button>
        {state === "done" && (
          <span className={anyLive ? "text-sm text-emerald-600 dark:text-emerald-400" : "text-sm text-amber-600 dark:text-amber-400"}>
            {anyLive ? s.ready : s.noneReady}
          </span>
        )}
        {state === "done" && result?.usingHouseholdKey && (
          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
            {s.usingOwn}
          </span>
        )}
        {state === "error" && <span className="text-sm text-red-600 dark:text-red-400">{s.failed}</span>}
      </div>

      <ul className="mt-4 space-y-2">
        {ORDER.map((p) => {
          const h = health(p);
          const how = HOW_TO[p];
          const badge = !h
            ? null
            : !h.configured
              ? { text: s.notSet, cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" }
              : h.ok
                ? { text: `${s.live} · ${h.latencyMs} ms`, cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" }
                : { text: s.keyBad, cls: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" };

          return (
            <li key={p} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{how.title}</span>
                {activeProvider === p && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                    {s.active}
                  </span>
                )}
                {badge && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>{badge.text}</span>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(open === p ? null : p)}
                  className="ml-auto text-xs text-amber-600 hover:underline"
                  aria-expanded={open === p}
                >
                  {s.howTo}
                </button>
              </div>

              <p className="mt-1 text-xs text-zinc-500">{how.cost}</p>
              {h?.error && <p className="mt-1 break-words text-xs text-red-600 dark:text-red-400">{h.error}</p>}

              {open === p && (
                <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-950/40">
                  <ol className="list-decimal space-y-1.5 pl-4">
                    {how.steps.map((step, i) => (
                      <li key={i} className={i === 0 ? "" : "font-mono"}>
                        {i === 0 ? (
                          <a href={how.link} target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline">
                            {step}
                          </a>
                        ) : (
                          step
                        )}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-zinc-500">
                    Set these in <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">web/.env.local</code> to make it
                    the server default — or paste the key below to use it for this household only.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* ── Half 2: this household's own key ──────────────────────────── */}
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
        <h3 className="text-sm font-semibold">{s.ownTitle}</h3>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{s.ownBody}</p>

        {!signedIn ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{s.ownSignedOut}</p>
        ) : (
          <>
            <p className="mt-3 text-sm">
              {stored
                ? s.ownSaved
                    .replace("{provider}", HOW_TO[stored.provider].title)
                    .replace("{last4}", stored.last4 ? `····${stored.last4}` : stored.url || "—")
                : s.ownNone}
            </p>

            {keyState?.canManage === false ? (
              <p className="mt-2 text-xs text-zinc-500">{s.ownNotOwner}</p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {ORDER.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, provider: p }))}
                      className={
                        "rounded-full px-3 py-1 text-xs font-medium " +
                        (form.provider === p
                          ? "bg-amber-500 text-white"
                          : "bg-white text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700")
                      }
                    >
                      {HOW_TO[p].title}
                    </button>
                  ))}
                </div>

                {form.provider === "ollama" ? (
                  <label className="block text-xs">
                    <span className="text-zinc-500">{s.fieldUrl}</span>
                    <input
                      type="url"
                      value={form.url}
                      onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                      placeholder="http://localhost:11434"
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </label>
                ) : (
                  <label className="block text-xs">
                    <span className="text-zinc-500">{s.fieldKey}</span>
                    <input
                      type="password"
                      value={form.apiKey}
                      onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={form.provider === "groq" ? "gsk_…" : "AIza…"}
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </label>
                )}

                <label className="block text-xs">
                  <span className="text-zinc-500">{s.fieldModel}</span>
                  <input
                    type="text"
                    value={form.model}
                    onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                    spellCheck={false}
                    placeholder={
                      form.provider === "groq"
                        ? "llama-3.3-70b-versatile"
                        : form.provider === "ollama"
                          ? "llama3.2"
                          : "gemini-2.0-flash"
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <span className="mt-1 block text-[11px] text-zinc-500">{s.modelHint}</span>
                </label>

                {needsSecretsKey && (
                  <p className="rounded-lg bg-red-50 p-2 text-[11px] leading-relaxed text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    <code className="font-mono">AI_SECRETS_KEY</code> is not set on the server, so a key cannot be stored
                    encrypted — and it will not be stored any other way. Generate one with{" "}
                    <code className="font-mono">node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;base64&apos;))&quot;</code>{" "}
                    and set it before saving.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={save}
                    disabled={busy || needsSecretsKey}
                    className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                  >
                    {busy ? s.saving : s.save}
                  </button>
                  {stored && (
                    <button
                      type="button"
                      onClick={remove}
                      disabled={busy}
                      className="text-sm text-zinc-500 hover:text-red-600 hover:underline disabled:opacity-60"
                    >
                      {s.remove}
                    </button>
                  )}
                  {notice && (
                    <span
                      className={
                        "text-xs " +
                        (notice.kind === "ok"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400")
                      }
                    >
                      {notice.text}
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-zinc-500">{s.askHint}</p>
    </div>
  );
}
