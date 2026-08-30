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

// `where` is not decoration. The panel used to list these three as if they were
// interchangeable picks, and they are not: two are somebody else's computer and
// one is yours. A household on honeymoney.app reading "nothing leaves the
// machine it runs on" reasonably concluded that meant their phone, installed
// Ollama on their laptop, and found nothing had changed — because the Ollama
// client is SERVER-side (lib/ai.ts reads OLLAMA_URL), so it is the machine
// running HoneyMoney that matters, not the one holding the browser.
//
// Saying so costs nothing and buys the stronger claim underneath it: on a
// self-hosted deployment this is a genuine no-third-party path, and on the
// hosted service Ask Honey already sends no figures to anyone. Both are true;
// neither was legible.
interface HowTo {
  title: string;
  /** Where the engine physically runs — the thing the old copy left ambiguous. */
  where: string;
  cost: string;
  steps: string[];
  link: string;
  /** What you actually get for the trouble, in plain words. */
  payoff?: string;
}

const HOW_TO: Record<Provider, HowTo> = {
  groq: {
    title: "Groq",
    where: "Runs on Groq's servers.",
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
    where: "Runs on Google's servers.",
    cost: "Free tier, no card. The only engine that also reads receipt images.",
    steps: [
      "Create an API key at aistudio.google.com/apikey",
      "AI_PROVIDER=gemini",
      "GEMINI_API_KEY=…",
      "GEMINI_MODEL=gemini-flash-latest",
    ],
    link: "https://aistudio.google.com/apikey",
  },
  ollama: {
    title: "Ollama — your own machine",
    where: "Runs on the computer that runs HoneyMoney — your own laptop, if you host it yourself. Not your phone.",
    cost: "Free, no key, no account. Nothing is sent to anyone. No terminal.",
    steps: [
      // Step one used to read "Install Ollama from ollama.com/download", and
      // that page shows TWO things: a large Download button and, beside it, a
      // line of PowerShell. People who did not know which half was meant for
      // them picked the one that looked more official-looking-technical, and
      // several never got past "what is PowerShell". Naming the button is the
      // entire fix.
      "Go to ollama.com/download and press the big Download button — ignore the line of code next to it, that is a shortcut for programmers",
      "Open the file that downloads and click through it, exactly like installing any other program. There is nothing to type, no account and no card.",
      "Ollama then runs quietly in the background — a small icon near the clock on Windows, or in the menu bar on a Mac. Leave it there; it does nothing until Honey asks it something.",
      "Linux is the one exception: that page gives you a single line to paste into a terminal, and Ollama installs itself as a background service. Everything after that is the same.",
      "Come back here and press “Download the model” above. That is the part that used to need a terminal — now it is a button with a progress bar.",
      // Kept, and kept LAST, because they are real and a self-hoster needs
      // them — but they are no longer step two, where they read as a wall a
      // household has to climb before anything works.
      "The two settings below are the only hand-edited part, and only if you run the HoneyMoney server yourself:",
      "OLLAMA_URL=http://localhost:11434",
      "OLLAMA_MODEL=llama3.2",
    ],
    link: "https://ollama.com/download",
    payoff:
      "You do not need to be a company to do this. One person, a couple or a family can run " +
      "HoneyMoney and Ollama on a single laptop at home and keep everything on it — the same " +
      "setup an employer or a cooperative would use, just smaller. " +
      "And it is the only setting where Honey sees your actual figures: on a cloud engine she " +
      "is sent placeholder names and never the amounts, so she writes a little stiffly. Locally " +
      "there is nowhere for the data to go, so she gets the real question and answers in your " +
      "own numbers. About 2 GB to download once, then it costs nothing and works offline.",
  },
};

const ORDER: Provider[] = ["groq", "gemini", "ollama"];

// ── The model download, without a terminal ──────────────────────────────────
//
// The step this replaces was `ollama pull llama3.2`, typed into a shell. Ollama
// serves an HTTP API on loopback, so the server can do the pull and stream its
// progress here (see api/ai/ollama/pull). What matters for the UI is that this
// is a ~2 GB download: a button that looks dead gets pressed again, so the bar
// has to move even during the phases where Ollama reports no byte counts.

interface OllamaProbe {
  running: boolean;
  installed: boolean;
  model: string;
  canManage: boolean;
  message?: string;
}

interface PullLine {
  status?: string;
  total?: number;
  completed?: number;
  pct?: number | null;
  done?: boolean;
  error?: string;
}

/** Ollama's own status words are accurate and mean nothing to most people. */
function friendlyStatus(raw: string): string {
  if (!raw) return "Starting…";
  if (raw === "pulling manifest") return "Looking up the model…";
  if (raw.startsWith("pulling")) return "Downloading…";
  if (raw.startsWith("verifying")) return "Checking the download is intact…";
  if (raw.startsWith("writing")) return "Finishing up…";
  if (raw === "success" || raw === "done") return "Downloaded.";
  return raw;
}

function gb(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.round(bytes / 1e3)} kB`;
}

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

  const [probe, setProbe] = useState<OllamaProbe | null>(null);
  const [pull, setPull] = useState<PullLine | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [driveOpen, setDriveOpen] = useState(false);

  // Also called straight from a "check again" link, for the person who installs
  // Ollama in another window and comes back without reloading.
  const probeOllama = useCallback(async () => {
    if (!signedIn) return;
    try {
      const res = await fetch("/api/ai/ollama/pull", { cache: "no-store" });
      if (!res.ok) return;
      setProbe((await res.json()) as OllamaProbe);
    } catch {
      /* the rest of the panel is unaffected; the button just stays neutral */
    }
  }, [signedIn]);

  const loadKey = useCallback(async () => {
    if (!signedIn) return;
    // Both halves of "what does the server already know about this household's
    // AI?" load together, in one effect. They are independent fetches and could
    // each have their own, but a second mount effect is a second copy of the
    // set-state-in-effect complaint below for no benefit.
    void probeOllama();
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
  }, [signedIn, probeOllama]);

  useEffect(() => {
    void loadKey();
  }, [loadKey]);

  async function startPull() {
    setPulling(true);
    setPullError(null);
    setPull({ status: "", pct: null });
    try {
      const res = await fetch("/api/ai/ollama/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      // A refusal that arrives BEFORE the stream opens still has a status code
      // and a plain JSON body — "Ollama is not installed" is the common one,
      // and it is the whole reason this endpoint answers before it streams.
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}) as { error?: string });
        setPullError(data.error ?? "Could not start the download.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let msg: PullLine;
          try {
            msg = JSON.parse(line) as PullLine;
          } catch {
            continue;
          }
          if (msg.error) {
            setPullError(msg.error);
            return;
          }
          setPull(msg);
        }
      }
      await probeOllama();
      await test();
    } catch {
      setPullError("The download stopped unexpectedly. Check Ollama is still running and try again.");
    } finally {
      setPulling(false);
    }
  }

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
  // "We do not yet have a percentage worth showing" — no counts at all, or a
  // layer announced but not a single byte through it. A finished pull is never
  // indeterminate: a bar that ends anywhere but full reads as a failed download
  // no matter what the words next to it say.
  const pullDone = pull?.done === true;
  const indeterminate = !pullDone && (pull?.pct == null || !pull.total || (pull.completed ?? 0) === 0);

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

              {/* Where it runs comes BEFORE what it costs. A reader deciding
                  between these three is really deciding whose computer their
                  money is described on, and that was the one thing the card
                  never said. */}
              <p className="mt-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">{how.where}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{how.cost}</p>
              {h?.error && <p className="mt-1 break-words text-xs text-red-600 dark:text-red-400">{h.error}</p>}

              {/* The step that used to be a terminal command. It sits OUTSIDE
                  the "How" fold on purpose: a button nobody can find is not an
                  improvement on an instruction nobody can follow. */}
              {p === "ollama" && (
                <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                  {!signedIn ? (
                    <p className="text-xs text-zinc-500">
                      Sign in and HoneyMoney can download the model for you here — no terminal needed.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={startPull}
                          disabled={pulling || probe?.canManage === false}
                          className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                        >
                          {pulling
                            ? "Downloading…"
                            : probe?.installed
                              ? "Download it again"
                              : "Download the model"}
                        </button>
                        <span className="text-[11px] text-zinc-500">
                          {/* A disabled button with nothing beside it reads as
                              a bug. It is a permission, so say so. */}
                          {probe?.canManage === false
                            ? "Only the household owner can start this download — it uses their computer's disk."
                            : probe?.installed
                            ? `${probe.model} is already on this computer.`
                            : `Downloads ${probe?.model ?? "llama3.2"} onto the computer running HoneyMoney` +
                              // Only llama3.2 is ~2 GB. A server pointed at a
                              // different OLLAMA_MODEL would otherwise promise
                              // a size it has no idea about.
                              ((probe?.model ?? "llama3.2").startsWith("llama3.2") ? " — about 2 GB, once." : ".")}
                        </span>
                      </div>

                      {/* THE LAST STEP THAT STILL NEEDED A TEXT EDITOR.
                          Downloading the model does not make Honey use it: the
                          engine is chosen by OLLAMA_URL, and lib/ai.ts refuses
                          to guess a loopback address — rightly, because
                          providerForClass() diverts every class-2 payload to
                          Ollama the moment it counts as configured, so a
                          guessed default would route real receipts to an engine
                          that may not be there. Defaulting it in config.ts is
                          therefore not the fix; saying so out loud here is.

                          The household key already carries a per-household
                          Ollama address, so one click writes the loopback
                          address into it and the loop closes without anyone
                          opening .env.local. Shown only once the model is
                          actually on disk — offering it earlier would point
                          HoneyMoney at an engine with nothing to answer with. */}
                      {probe?.running && probe.installed && probe.canManage !== false && (
                        <div className="mt-2 rounded bg-emerald-50 p-2 text-[11px] leading-relaxed text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                          <strong>One last step.</strong> The model is on this computer, but Honey is not using it
                          yet.{" "}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setForm((f) => ({
                                ...f,
                                provider: "ollama",
                                apiKey: "",
                                url: "http://localhost:11434",
                                model: probe.model || f.model,
                              }));
                              // Saved on the next tick so `save()` reads the
                              // state above rather than the one it replaced.
                              setTimeout(() => void save(), 0);
                            }}
                            className="font-semibold underline disabled:opacity-60"
                          >
                            Use the Ollama on this computer
                          </button>{" "}
                          — sets it for this household only, and nothing else changes.
                        </div>
                      )}

                      {/* Ollama absent is the FIRST thing most people will hit,
                          so it gets a sentence about what to do rather than a
                          red failure. */}
                      {probe && !probe.running && !pulling && !pullError && (
                        <p className="mt-2 rounded bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                          {probe.message ?? "Ollama is not answering yet."} Press{" "}
                          <button type="button" onClick={probeOllama} className="underline">
                            check again
                          </button>{" "}
                          once it is installed and open.
                        </p>
                      )}

                      {(pulling || pull) && !pullError && (
                        <div className="mt-2">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                            <div
                              className={
                                "h-full rounded-full bg-emerald-500 " +
                                // Ollama reports no byte counts while it reads
                                // the manifest, and reports a layer at zero
                                // bytes for as long as the connection takes to
                                // warm up. A bar pinned at 0% through both is
                                // exactly the dead-looking control this whole
                                // change exists to remove, so anything before
                                // the first byte animates instead of sitting.
                                (indeterminate ? "w-1/3 animate-pulse" : "transition-all duration-300")
                              }
                              style={indeterminate ? undefined : { width: `${pullDone ? 100 : pull?.pct}%` }}
                            />
                          </div>
                          <p className="mt-1 text-[11px] text-zinc-500">
                            {friendlyStatus(pull?.status ?? "")}
                            {!indeterminate && !pullDone && pull?.total ? (
                              <> {pull.pct}% — {gb(pull.completed ?? 0)} of {gb(pull.total)}</>
                            ) : null}
                            {pulling && " · you can leave this page open, it keeps going."}
                          </p>
                        </div>
                      )}

                      {pullError && (
                        <p className="mt-2 rounded bg-red-50 p-2 text-[11px] leading-relaxed text-red-700 dark:bg-red-950/40 dark:text-red-300">
                          {pullError}
                        </p>
                      )}

                      {/* ── Which drive? ──────────────────────────────────
                          A 2 GB model on a full C: drive is a real, common
                          failure, and every answer on the internet to "how do
                          I move it" is an environment variable typed into a
                          terminal. Ollama's own app has had a Model location
                          setting with a Browse button since the desktop
                          rewrite, which is the answer to give a person who has
                          never heard the words "environment variable" — with
                          the Windows dialog kept as the fallback for older
                          installs, and still no PowerShell anywhere. */}
                      <button
                        type="button"
                        onClick={() => setDriveOpen((v) => !v)}
                        aria-expanded={driveOpen}
                        className="mt-2 text-[11px] text-amber-600 hover:underline"
                      >
                        Not enough room on your main drive?
                      </button>
                      {driveOpen && (
                        <div className="mt-2 space-y-2 rounded-lg bg-zinc-50 p-3 text-[11px] leading-relaxed text-zinc-600 dark:bg-zinc-950/40 dark:text-zinc-300">
                          <p>
                            Models are big, and by default they land on the same drive Windows is on. You can send them
                            somewhere roomier — an external disk works too. Do this <strong>before</strong> you press
                            Download; models already downloaded stay where they are.
                          </p>
                          <p>
                            <strong>Windows and macOS, the easy way:</strong> open the Ollama app, go to{" "}
                            <strong>Settings</strong>, find <strong>Model location</strong>, press{" "}
                            <strong>Browse</strong> and pick a folder on the drive you want — for example{" "}
                            <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">D:\Ollama</code>. That is the
                            whole thing.
                          </p>
                          <p>
                            <strong>If your Ollama has no Settings screen</strong> (older versions): on Windows, quit
                            Ollama from the icon by the clock, press Start and search for{" "}
                            <strong>environment variables</strong>, open{" "}
                            <em>Edit environment variables for your account</em>, add a new one named{" "}
                            <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">OLLAMA_MODELS</code> with the
                            folder as its value, press OK, then start Ollama again from the Start menu. It is a form
                            with a New button — nothing is typed into a black window.
                          </p>
                          <p>
                            <strong>Also on Windows:</strong> the installer itself can go elsewhere. That is a separate
                            choice from where the models live, and it is the models that are big — the setting above is
                            the one that matters.
                          </p>
                          <p>
                            <strong>Linux</strong> has no settings screen: Ollama runs as a system service, so the
                            folder is set with{" "}
                            <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">systemctl edit ollama.service</code>{" "}
                            and a line{" "}
                            <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">
                              Environment=&quot;OLLAMA_MODELS=/your/folder&quot;
                            </code>
                            , with the folder owned by the <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">ollama</code> user.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {open === p && (
                <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-950/40">
                  <ol className="list-decimal space-y-1.5 pl-4">
                    {how.steps.map((step, i) => (
                      // Monospace is for things you TYPE somewhere, not for
                      // every line after the first. The old rule was positional,
                      // which was fine while every step past step 1 happened to
                      // be an environment variable; Ollama's walkthrough adds a
                      // "check it worked" step, and rendering plain English in
                      // code font makes instructions look like a command.
                      // The mono font goes on the CONTENT, never on the <li>:
                      // styling the item restyles its marker too, so "2." and
                      // "4." sat a few pixels off from "1." and "3." and the
                      // list read as slightly broken.
                      <li key={i}>
                        {i === 0 ? (
                          <a href={how.link} target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline">
                            {step}
                          </a>
                        ) : /^[A-Z_]+=|^ollama\s/.test(step) ? (
                          <code className="font-mono">{step}</code>
                        ) : (
                          step
                        )}
                      </li>
                    ))}
                  </ol>
                  {how.payoff && (
                    <p className="mt-2 rounded-lg bg-emerald-50 p-2 leading-relaxed text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                      {how.payoff}
                    </p>
                  )}
                  <p className="mt-2 text-zinc-500">
                    Set these in <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">web/.env.local</code> to make it
                    the server default — or {p === "ollama" ? "set the address" : "paste the key"} below to use it for this
                    household only.
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
                          : "gemini-flash-latest"
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <span className="mt-1 block text-[11px] text-zinc-500">{s.modelHint}</span>
                </label>

                {/* This is the one message in the panel a HOUSEHOLD can do
                    nothing about — it is a server setting. It used to hand them
                    a `node -e ... randomBytes(32)` incantation and disable the
                    save button, which reads as "you have broken something" to a
                    person whose only mistake was opening Settings. The refusal
                    itself is right and stays: a key that cannot be encrypted is
                    not stored at all. Only the audience changed. */}
                {needsSecretsKey && (
                  <p className="rounded-lg bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    <strong>Saving a key is turned off on this server.</strong> HoneyMoney will not store an AI key unless it
                    can encrypt it first, and the encryption key is missing — so nothing here is lost, it simply will not
                    save. Everything else keeps working, and Honey still answers using the built-in wording.{" "}
                    <span className="opacity-80">
                      If you are the one running this server, set{" "}
                      <code className="font-mono">AI_SECRETS_KEY</code> in{" "}
                      <code className="font-mono">web/.env.local</code> to a random 32-byte value:{" "}
                      <code className="font-mono">
                        node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;base64&apos;))&quot;
                      </code>
                    </span>
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
