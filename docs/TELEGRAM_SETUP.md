# Telegram Bot Setup

HoneyMoney ships a zero-typing capture channel: forward a receipt or e-wallet
screenshot to a Telegram bot and it OCRs the amount, auto-buckets the spend, and
replies with **Undo / Change bucket** buttons. It also catches duplicates — the
"same receipt forwarded by both partners" problem — and redirects PDF statements
to the web importer.

Implementation:
- Webhook handler — [`web/src/app/api/telegram/webhook/route.ts`](../web/src/app/api/telegram/webhook/route.ts)
- Bot API helpers — [`web/src/lib/telegram.ts`](../web/src/lib/telegram.ts)
- Config / capability flag — [`web/src/lib/config.ts`](../web/src/lib/config.ts) (`isTelegramConfigured()`)

## Prerequisites

- **PocketBase running + `DEMO_TENANT_ID` set** — the bot links each `/start`
  chat to this household.
- **An AI provider key for reading receipts** — `GEMINI_API_KEY` (or Groq /
  Ollama). Without it, `/start` works but forwarded receipts won't parse.
- **A public HTTPS URL** — the Cloudflare tunnel serving **honeymoney.app** must
  be up. Telegram will not call `localhost`.

## Step 1 — Create the bot with BotFather

1. In Telegram, open **@BotFather** → send `/newbot`.
2. Give it a name (e.g. `HoneyMoney`) and a username ending in `bot`
   (e.g. `honeymoney_capture_bot`).
3. BotFather replies with a **token** like `8123456789:AAH…`. Copy it.

## Step 2 — Put the secrets in `web/.env.local`

Pick any random string for the webhook secret — it is a shared password between
Telegram and your server. Generate one in PowerShell:

```powershell
[guid]::NewGuid().ToString("N")   # 32-char secret, copy the output
```

Then set both values in `web/.env.local`:

```
TELEGRAM_BOT_TOKEN=8123456789:AAH…paste-from-botfather
TELEGRAM_WEBHOOK_SECRET=paste-the-generated-32-char-string
```

## Step 3 — Restart the Next server

Env vars are read at boot, so restart whatever runs the app (your local
`next start` / autostart task) to pick them up.

## Step 4 — Register the webhook with Telegram

This tells Telegram to POST updates to your endpoint and to send the secret in
the `x-telegram-bot-api-secret-token` header. The route rejects any request
without the matching secret (HTTP 401). Run in PowerShell:

```powershell
$token  = "8123456789:AAH…"          # your bot token
$secret = "your-32-char-secret"       # same value as TELEGRAM_WEBHOOK_SECRET
Invoke-RestMethod -Method Post "https://api.telegram.org/bot$token/setWebhook" -Body @{
  url          = "https://honeymoney.app/api/telegram/webhook"
  secret_token = $secret
}
```

Expect: `{ ok = True; result = True; description = Webhook was set }`.

## Step 5 — Verify & test

```powershell
Invoke-RestMethod "https://api.telegram.org/bot$token/getWebhookInfo"
```

Check that `url` is your honeymoney.app endpoint and `last_error_message` is
empty. Then, in Telegram:

1. Open your bot → send **`/start`** → you should get
   *"🍯 Welcome to HoneyMoney! You're linked."*
2. **Forward a receipt photo** → within a few seconds:
   *"✅ Logged MYR … at …"* with **Undo / Change bucket** buttons.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `/start` says *"isn't linked yet"* | `DEMO_TENANT_ID` empty or wrong. |
| Bot silent on everything | Token/secret empty, server not restarted, or webhook `url` still points at localhost/Vercel — re-run Step 4. |
| `getWebhookInfo` shows a `last_error_message` | Tunnel down, or 401 secret mismatch between `.env.local` and the `secret_token` you registered. |
| `/start` works but receipts don't parse | No AI provider key, or `GEMINI_API_KEY` invalid. |

To move the bot to a new URL later, re-run Step 4. To unhook it entirely:
`…/deleteWebhook`.

## Note: single-household limitation

Today the bot hard-links every `/start` chat to the one `DEMO_TENANT_ID`
household (see `linkChat()` in the webhook route). For real multi-user growth,
the next upgrade is per-user linking — a `/start <code>` that binds a chat to
whoever's household issued the code — so anyone can use the bot, not just the
demo tenant.
