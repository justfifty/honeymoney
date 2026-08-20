# DEPLOY.md — public showcase (hosted PocketBase + Vercel)

> **How honeymoney.app is actually served today:** local-first from the Windows
> PC (`deploy/start-honeymoney.ps1`) through a named Cloudflare Tunnel, with the
> public pages mirrored to an always-on Cloudflare Pages snapshot so the site
> survives the PC being off — see **[deploy/pages/README.md](deploy/pages/README.md)**.
> The cloud path below (Vercel + hosted PocketBase) is kept as the documented
> migration route, not the current deployment.
>
> Goal: a shareable public URL where **anyone can open and explore the graph
> showcase with no login**, and sign up only when they want to save their own
> household or connect Telegram. Decision log in `NEXT.md`.

The app is already env-driven and deploy-ready — the Next.js **server** talks to
PocketBase over REST (the browser never does), so there is no CORS work and no
code change. You only need to (1) host PocketBase, (2) set env vars on Vercel,
(3) deploy. Migrations + demo seed auto-apply on PocketBase's first start, so the
showcase tenants (individual + couple + family) exist out of the box.

---

## 1. Host PocketBase (the database)

Pick one. Both give a persistent `https://…` URL for `POCKETBASE_URL`.

### Option A — PocketHost (fastest, managed)
1. Create an instance at <https://pockethost.io> → note its URL, e.g. `https://honeymoney.pockethost.io`.
2. Open its Admin UI → create a **superuser** (use a strong password — this is production).
3. Upload the committed migrations: copy `pocketbase/pb_migrations/*.js` into the instance (PocketHost supports a migrations dir / admin import). On boot they create the schema + seed the demo tenants.

### Option B — Fly.io (more control)
1. `fly launch` a PocketBase image (e.g. `spectproduction/pocketbase` or a small Dockerfile that copies `pocketbase/pb_migrations/`), attach a **persistent volume** at `/pb_data`.
2. Set the superuser via the container's env/first-run, then `fly deploy`.
3. URL is `https://<app>.fly.dev`.

> **Persistence matters:** PB data lives in SQLite on a volume. Without a volume, a
> redeploy wipes testers' data. Migrations run **once** — they won't re-seed a
> volume that already has data.

---

## 2. Deploy the app to Vercel

1. Import the GitHub repo into Vercel; set **Root Directory = `web/`** (Next.js auto-detected).
2. Set Environment Variables (Project → Settings → Environment Variables):

   | Variable | Value |
   |---|---|
   | `POCKETBASE_URL` | your hosted PB URL from step 1 (https) |
   | `POCKETBASE_ADMIN_EMAIL` | the superuser email you created |
   | `POCKETBASE_ADMIN_PASSWORD` | **a strong password** (never the dev default) |
   | `DEMO_TENANT_ID` | `hhrahman1111111` (the showcase household) |
   | `GEMINI_API_KEY` | optional — enables real OCR + AI Honey insight |
   | `GEMINI_MODEL` | `gemini-2.0-flash` |
   | `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` | optional — for the receipt bot |

3. Deploy → `https://<app>.vercel.app`. Landing at `/`, showcase at `/graph`, app at `/dashboard`.
4. Point the Telegram webhook (if used) at `https://<app>.vercel.app/api/telegram/webhook` (see `PLAN.md §11`).

---

## 3. Verify the public showcase

- `GET https://<app>.vercel.app/graph` renders the six-view gallery on the demo household.
- The **Lens** row works; the persona switcher walks individual 🧑 → couple 👫 → family 👪.
- The seeded personas carry absolute dates and go stale: run `node scripts/refresh-demo-data.mjs`
  (or `deploy/run-maintenance.ps1 -Task demo`) so month-to-date views aren't empty.
- If PB/Gemini are unset the app **degrades gracefully** (setup notice), never a crash.

---

## 4. Onboarding model — anonymous showcase → optional sign-up

**Today (ships as-is):** the app is already anonymous — `/graph` and `/dashboard`
render the seed tenants with no login. Deploying gives you the anonymous showcase
immediately. Share the `/graph` link; the Telegram bot ("forward one receipt") is
the lowest-friction way to pull real testers in.

**Caveat to handle before wide sharing (the shared-sandbox problem):** anonymous
visitors can currently add/remove people and add spend on the *shared* demo
tenant, so one visitor can degrade the showcase for the next. Options, cheapest
first:
- **Nightly reseed / reset** of the demo tenant (cron re-applies the seed).
- **Guard mutations** on the demo tenant (read-only showcase; edits only in a sandbox).
- **Ephemeral per-visitor tenant** — "Try your own numbers" clones a throwaway
  tenant they can edit, discarded later. (Best UX; most work.)

**Optional sign-up (roadmap — P3):** PocketBase has built-in auth. The step is:
enable an `auth`-type users collection, bind each user to a `tenant` (their
household/business), scope the read models by the authenticated tenant instead of
`DEMO_TENANT_ID`, and gate only the *persist / connect-Telegram* actions behind
login — never the showcase itself. Sign-up earns its keep exactly when there is
something to save; browsing never requires it.

---

## 5. Security hardening (do before sharing)

- Strong, unique `POCKETBASE_ADMIN_PASSWORD`; rotate the dev default.
- `POCKETBASE_URL` over **https** only.
- PocketBase collection API rules stay superuser-only (the browser never queries PB).
- Keep secrets in Vercel env, never in the repo (already `.gitignore`'d).
- PDPA note: demo data is synthetic; once real users exist, honour the retention/
  consent posture in `PLAN.md §14`.
