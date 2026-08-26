# AI Setup — HoneyMoney (Groq · Gemini Flash · Ollama)

HoneyMoney's AI is **optional and swappable**. The app runs fully without any AI
(on-device OCR uses zero tokens). When you want AI insights/OCR, pick **one**
provider, add its key to `web/.env.local`, and restart the app.

**Two ways to configure it.** The environment variables below set the *server's* engine and
are what a self-hosted household wants. A signed-in household owner can instead store their
**own** key in the app at **Setup → AI engine**, which overrides the server for that
household only; it is encrypted with `AI_SECRETS_KEY` before storage (see `.env.example`)
and validated against the provider on save.

Pick the server provider with **`AI_PROVIDER`** = `groq` | `gemini` | `ollama`.
After editing `web/.env.local`, restart: stop + `npm run build && npm run start`
(or `deploy/start-honeymoney.ps1`). Verify anytime at **`/api/ai/check`** — it runs
an agentic probe against each configured provider and reports OK / latency / tokens.

Every AI call's tokens are logged to the `ai_usage` ledger → visible in **/admin**
and at **/api/usage**, for cost monitoring + the MAIC AI disclosure.

---

## Option A — Groq  ⚡ (recommended free cloud: fast, generous free tier)

1. **Sign up / log in:** <https://console.groq.com/login>
2. **Create an API key:** <https://console.groq.com/keys> → "Create API Key" → copy it.
3. Add to `web/.env.local`:
   ```
   AI_PROVIDER=groq
   GROQ_API_KEY=gsk_your_key_here
   GROQ_MODEL=llama-3.3-70b-versatile
   ```
4. Restart the app → open `/api/ai/check` → `groq` should show `ok: true`.

_Free tier: rate-limited but no card required. Great for the demo._

---

## Option B — Google Gemini Flash  🌟 (multimodal — also powers receipt OCR)

1. **Sign up / log in:** <https://aistudio.google.com/>
2. **Get an API key:** <https://aistudio.google.com/apikey> → "Create API key" → copy.
3. Add to `web/.env.local`:
   ```
   AI_PROVIDER=gemini
   GEMINI_API_KEY=your_key_here
   GEMINI_MODEL=gemini-flash-latest
   ```
4. Restart → `/api/ai/check` → `gemini` shows `ok: true`.

_Gemini is the only provider that also does image OCR (`parseReceipt`); Groq/Ollama
handle text insights. Free tier: no card, daily quota._

---

## Option C — Ollama  🖥️ (fully local, zero cost, zero cloud)

1. **Download & install:** <https://ollama.com/download> (Windows/Mac/Linux).
2. **Pull a model & run:**
   ```
   ollama pull llama3.2
   ollama serve        # serves http://localhost:11434
   ```
3. Add to `web/.env.local`:
   ```
   AI_PROVIDER=ollama
   OLLAMA_URL=http://localhost:11434
   OLLAMA_MODEL=llama3.2
   ```
4. Restart → `/api/ai/check` → `ollama` shows `ok: true`.

_No account, no key, no tokens billed — the AI runs on your machine. Best for the
"RM 0, data never leaves the device" story._

---

## Quick reference

| Provider | Sign-up / login | Get key | Cost |
|---|---|---|---|
| **Groq** | <https://console.groq.com/login> | <https://console.groq.com/keys> | Free tier, no card |
| **Gemini** | <https://aistudio.google.com/> | <https://aistudio.google.com/apikey> | Free tier, no card |
| **Ollama** | — (local install) | <https://ollama.com/download> | Free (your hardware) |

**Check it works:** `GET https://honeymoney.app/api/ai/check`
**Watch spend:** `/admin` (Cost monitoring) or `GET /api/usage`.
