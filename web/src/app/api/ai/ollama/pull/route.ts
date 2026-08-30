import { NextResponse } from "next/server";
import { getTenantAiCreds } from "@/lib/aiKeys";
import { config, isDatabaseConfigured } from "@/lib/config";
import { apiError } from "@/lib/apiError";
import { AuthError, requireContext, requirePermission } from "@/lib/household";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pull an Ollama model FROM THE APP, so nobody has to open a terminal.
//
// The setup guidance used to end with `ollama pull llama3.2`, which is a
// perfectly good instruction for someone who already knows what a shell is and
// a dead end for everyone else. Ollama serves an HTTP API on loopback and
// `POST /api/pull` streams its own progress, so the whole step can be a button:
// this route proxies that stream, and /setup draws a bar with it.
//
//   GET  — is Ollama there, and is the model already on disk?
//   POST — pull it, streaming progress back as NDJSON.
//
// Two things this route deliberately does NOT do:
//
//   • It does not take a URL from the browser. A "which Ollama?" field would be
//     a server-side fetch of an attacker-chosen address — the classic SSRF
//     shape — and it would buy nothing, because the only Ollama that can serve
//     this deployment is the one the server already knows about. The address is
//     resolved server-side: the household's stored URL, else OLLAMA_URL, else
//     Ollama's own loopback default.
//
//   • It does not call aiGenerate/aiVision. A pull moves bytes onto a disk; it
//     is not a generation, no prompt exists, and nothing about anyone's money
//     is involved — so it has no business passing through the consent path.

/** Where Ollama's own installer puts it, on every platform, with no config. */
const OLLAMA_DEFAULT_URL = "http://127.0.0.1:11434";

/**
 * Ollama's model naming: `[host/][namespace/]name[:tag]`. Kept narrow on
 * purpose — this string is pasted into a URL-less JSON body that makes a server
 * download gigabytes, so the shape is checked before the network is touched.
 */
const MODEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._-]*){0,2}(?::[a-zA-Z0-9._-]+)?$/;

/**
 * One pull per model per server process. The button disables itself while a
 * pull runs, but a reload does not, and a second pull of the same 2 GB model is
 * pure waste — Ollama would serve both from one download, and the second
 * progress bar would still look like a separate 2 GB of someone's data cap.
 */
const inFlight = new Set<string>();

async function resolveBase(tenantId: string | null): Promise<string> {
  if (tenantId) {
    const creds = await getTenantAiCreds(tenantId).catch(() => null);
    if (creds?.provider === "ollama" && creds.url) return creds.url.replace(/\/$/, "");
  }
  // lib/ai.ts refuses to guess here, and is right to: at CALL time an unset
  // OLLAMA_URL means "this deployment does not use Ollama", and silently
  // hitting loopback would make a misconfiguration look like a working engine.
  // At SETUP time the opposite is true — the person is installing Ollama and
  // has not set anything yet — so the documented default is the useful answer.
  return (config.ollamaUrl || OLLAMA_DEFAULT_URL).replace(/\/$/, "");
}

/**
 * Say what to DO about it, not what threw.
 *
 * "fetch failed" is what Node reports for a refused connection, and it is the
 * single most likely thing a first-time user will see here — Ollama not
 * installed yet, or installed and not started. Handing that string to a
 * settings panel teaches nobody anything.
 */
function explain(err: unknown, base: string): string {
  const raw = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? "")}` : String(err);

  if (/ECONNREFUSED|fetch failed|ECONNRESET|socket hang up/i.test(raw)) {
    return base.includes("127.0.0.1") || base.includes("localhost")
      ? "Ollama is not answering on this computer. If you have not installed it yet, do that first — it is a normal app installer. If you have, open Ollama from the Start menu (or the menu bar on a Mac) and leave it running, then try again."
      : `Nothing answered at ${base}. Ollama has to be running on the computer that runs HoneyMoney, and reachable from it.`;
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(raw)) {
    return `That address (${base}) does not resolve. Check OLLAMA_URL, or leave it unset to use this computer's own Ollama.`;
  }
  if (/timeout|ETIMEDOUT|abort/i.test(raw)) {
    return "Ollama took too long to answer. It may still be starting up — give it a moment and try again.";
  }
  return `Could not talk to Ollama at ${base}. (${raw.slice(0, 200)})`;
}

// ── GET: is it there, and is the model already down? ────────────────────────

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  let tenantId: string | null = null;
  let canManage = false;
  try {
    const ctx = await requireContext();
    tenantId = ctx.tenant.id;
    canManage = ctx.accessRole === "owner";
  } catch (err) {
    return apiError(err);
  }

  const base = await resolveBase(tenantId);
  const model = config.ollamaModel;

  try {
    const res = await fetch(`${base}/api/tags`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      return NextResponse.json({
        ok: true,
        canManage,
        running: false,
        model,
        installed: false,
        models: [],
        message: `Ollama answered ${res.status} at ${base}.`,
      });
    }
    const data = (await res.json()) as { models?: { name?: string }[] };
    const names = (data.models ?? []).map((m) => m.name ?? "").filter(Boolean);

    // `llama3.2` and `llama3.2:latest` are the same model with and without the
    // implied tag. Comparing the raw strings would tell someone who already has
    // it that they need to download 2 GB again.
    const want = model.includes(":") ? model : `${model}:latest`;
    return NextResponse.json({
      ok: true,
      canManage,
      running: true,
      model,
      installed: names.includes(want) || names.includes(model),
      models: names,
    });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      canManage,
      running: false,
      model,
      installed: false,
      models: [],
      message: explain(err, base),
    });
  }
}

// ── POST: pull it, streaming progress ───────────────────────────────────────

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  let body: { model?: string };
  try {
    body = (await request.json()) as { model?: string };
  } catch {
    body = {};
  }

  let tenantId: string;
  try {
    // Same gate as saving a household key, for the same reason: this spends
    // somebody's bandwidth and somebody's disk. A member should not be able to
    // start a 2 GB download on the owner's machine.
    const ctx = await requirePermission("manage_members");
    tenantId = ctx.tenant.id;
  } catch (err) {
    if (err instanceof AuthError) return apiError(err);
    return apiError(err);
  }

  const model = (body.model ?? "").trim() || config.ollamaModel;
  if (!MODEL_RE.test(model) || model.length > 100) {
    return NextResponse.json(
      { error: "That does not look like an Ollama model name. Try llama3.2." },
      { status: 400 },
    );
  }

  const base = await resolveBase(tenantId);

  if (inFlight.has(model)) {
    return NextResponse.json(
      { error: `${model} is already downloading. Leave this page open — it will finish on its own.` },
      { status: 409 },
    );
  }

  // Reach Ollama BEFORE opening the response stream. Once bytes are on the
  // wire the status code is spent, and "Ollama is not installed" is exactly the
  // message that deserves a real 503 the browser can react to rather than an
  // error smuggled inside a success.
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: true }),
    });
  } catch (err) {
    return NextResponse.json({ error: explain(err, base) }, { status: 503 });
  }

  if (!upstream.ok || !upstream.body) {
    const detail = (await upstream.text().catch(() => "")).slice(0, 200);
    return NextResponse.json(
      {
        error:
          upstream.status === 404
            ? `Ollama does not have a model called “${model}”. Check the spelling — the default is llama3.2.`
            : `Ollama refused the download (${upstream.status}). ${detail}`,
      },
      { status: 502 },
    );
  }

  inFlight.add(model);

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Ollama reports progress per LAYER, and a model is several layers of wildly
  // different sizes. A bar fed straight from those numbers jumps to 100%, back
  // to 0%, and up again — which reads as a bug. Summing the layers seen so far
  // gives one number that only ever goes up.
  const layers = new Map<string, { total: number; completed: number }>();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const reader = upstream.body!.getReader();
      let buffer = "";

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // NDJSON does not promise that a chunk ends on a line boundary. The
          // last fragment stays in the buffer until its newline arrives.
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            let msg: { status?: string; digest?: string; total?: number; completed?: number; error?: string };
            try {
              msg = JSON.parse(trimmed);
            } catch {
              continue;
            }

            if (msg.error) {
              send({ error: `Ollama could not download the model: ${msg.error}` });
              return;
            }

            if (msg.digest && typeof msg.total === "number") {
              layers.set(msg.digest, { total: msg.total, completed: msg.completed ?? 0 });
            }

            let total = 0;
            let completed = 0;
            for (const l of layers.values()) {
              total += l.total;
              completed += l.completed;
            }

            send({
              status: msg.status ?? "",
              total,
              completed,
              pct: total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : null,
              done: msg.status === "success",
              model,
            });
          }
        }
        // Ollama's last line is {"status":"success"}, already forwarded above.
        // This is the belt-and-braces close for a stream that ends without it.
        // It repeats the running totals rather than sending a bare "done":
        // a client that renders the newest line would otherwise lose its
        // numbers on the very last frame and end on an empty progress bar.
        let total = 0;
        let completed = 0;
        for (const l of layers.values()) {
          total += l.total;
          completed += l.completed;
        }
        send({ status: "done", total, completed, pct: total > 0 ? 100 : null, done: true, model });
      } catch (err) {
        send({ error: explain(err, base) });
      } finally {
        inFlight.delete(model);
        controller.close();
      }
    },
    cancel() {
      // The browser navigated away. Ollama keeps downloading — which is the
      // behaviour people want from a 2 GB file — so only the local lock is
      // released, letting a returning user attach to a fresh progress stream.
      inFlight.delete(model);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // nginx and several CDNs buffer a response until it closes unless told
      // not to, which would hold every progress line back and deliver them all
      // at the end — a progress bar that only appears once it is pointless.
      "X-Accel-Buffering": "no",
    },
  });
}
