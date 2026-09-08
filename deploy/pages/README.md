# The always-on front door for honeymoney.app

> ⚠️ **Publish with `npm run site:publish` — never `site:build` and `site:deploy`
> as two separate commands.** Nothing binds them, so a failed build leaves a
> PARTIAL `dist/` on disk and a following deploy ships it. That happened twice on
> 2026-08-24: once `dist` held a single file, once 57 of 90. Both times
> honeymoney.app went half-broken (`/demo` and `/deck` answering 308) while every
> command in the chain reported success. `site:publish` is `build && deploy`, so
> a broken build cannot reach production.

honeymoney.app runs on a laptop behind a Cloudflare Tunnel, so historically the
**entire** site vanished whenever that laptop was off — in the week to
2026-07-27 that was ~117 of 168 hours, including one unbroken 3-day outage.

The pages a first-time visitor or a judge actually lands on need no database at
all. So the site is now split in two:

| Path | Served by | Up when the laptop is off? |
|---|---|---|
| `/`, `/guide`, `/learn`, `/gallery`, `/deck` | Cloudflare Pages (static snapshot) | **Yes** |
| `/_next/static/*`, images, PDFs, the demo video | Cloudflare Pages | **Yes** |
| `/dashboard`, `/graph`, `/records`, `/login`, `/api/*`, … | proxied to the tunnel | No — friendly offline page instead |

Nothing about the app changed. The snapshot is *rendered from the running app*,
so there is one source of truth and no parallel copy of the marketing site to
keep in sync.

## The moving parts

```
                      ┌─────────────────────────── Cloudflare edge ──┐
  honeymoney.app  ───▶│  Pages project "honeymoney"  →  _worker.js    │
                      │     ├─ public page?  → static snapshot ✓ always up
                      │     └─ app route?    → fetch(origin.honeymoney.app)
                      └──────────────────────────────────┬───────────┘
                                                          │ (tunnel)
                                            ┌─────────────▼───────────┐
                                            │  the laptop :3000       │
                                            │  Next.js + PocketBase   │
                                            └─────────────────────────┘
```

- `_worker.js` — the routing brain. Snapshot list is stamped in at build time
  from the build script's `ROUTES`, so the two cannot drift.
- `../../scripts/build-static-site.mjs` — renders the public routes from the
  **running production server** and assembles `dist/`.
- `wrangler.toml` — the Pages project (`honeymoney`), output dir `dist/`.
- `dist/` — generated, gitignored.

Two details worth knowing:

- **Signed-in and non-English visitors bypass the snapshot.** If the request
  carries `hm_auth`, or `hm_lang` set to anything but `en`, the worker goes to
  the origin so the person gets their real, personalised render — and still
  falls back to the snapshot if the origin is down. Anonymous English visitors
  (every first-time visitor, every judge following a link) get the edge copy:
  instant, and immune to the laptop.
- **`origin.honeymoney.app` exists so the proxy has somewhere to go.** The apex
  now resolves to Pages, so the tunnel needs a hostname that is *not* behind the
  worker or the proxy would loop into itself. It is not meant to be visited
  directly; the app's canonical URL stays the apex.

## Deploy

```bash
# 0. once per machine — opens a browser
npx wrangler login

# 1. the app must be built and RUNNING in production mode; the snapshot is
#    taken from it. deploy/start-honeymoney.ps1 already does this.
cd web && npm run build && cd ..
powershell -File deploy/start-honeymoney.ps1

# 2. render the snapshot  →  deploy/pages/dist/
cd web && npm run site:build

# 3. look at it locally first (http://127.0.0.1:8788)
npm run site:preview

# 4. ship it
npm run site:deploy
```

`site:build` refuses to run against a dev server, against a stale build whose
chunks don't match `.next/static`, or on a page that rendered a Next.js error —
each of those produces a snapshot that looks fine and breaks in a browser.

**Re-run `site:build` + `site:deploy` after any change to the public pages.** The
snapshot is a point-in-time copy; it does not update itself.

### A plain `npm run build` can take the whole site down

Not only the public pages — **every** page, including the signed-in app.

`/_next/static/*` is served from the snapshot (see the routing table above), while
`/dashboard`, `/login`, `/graph` and the rest are rendered by an origin. A build
changes the hashed asset filenames. So the moment `web/.next` is rebuilt and the
origin restarts, the origin serves HTML pointing at `_next/static` filenames the
snapshot has never heard of, the stylesheet 404s, and every route in the app —
public and private — renders as unstyled HTML. It looks like a catastrophic CSS
regression and it is a stale copy of one directory.

Observed 2026-08-25: a `npm run build` run only to check that a change compiled
did exactly this to `/`, `/login`, `/graph`, `/hscore`, `/more` and `/record`.
`npm run site:publish` restored it in under a minute.

**2026-09-08 — the same failure, with the rescue in place and unable to run.**
`_worker.js` had grown an origin fallback for exactly this: when the edge lacks
a chunk, ask the origin, which by definition has it because it rendered the HTML
asking for it. It had never executed once. Pages answers an unknown path with
the site's HTML **at status 200**, so a missing chunk was caught by the arm above
and answered 404, while the rescue waited on `res.status !== 200` — a status that
never arrives for this failure. The site served `/record` and `/dashboard` with
live household data, no stylesheet and no hydration; the tab bar was a line of
underlined links, and "the buttons at the bottom don't work" was the report.
`check:edge` had been printing *Edge and origin agree* over it, because with the
origin unreachable it skipped every app route and checked only `/`, which Pages
answers from the snapshot and which therefore cannot fail.

Both are fixed, and both now have guards that fail loudly: `check:worker` runs
the worker, and `check:edge` reports INCONCLUSIVE rather than success when it
could not reach a single origin route.

The structural cause underneath was that there are **two origins running two
builds** — the laptop's `.next`, DOM Cloud's `.next-dc` — and the snapshot
carried only one. The laptop is first in the worker's list, so most pages were
rendered by the build the edge did not hold. `site:build` now ships **both**
`static/` directories when both exist (content-hashed names make the overlay
safe), so the edge answers either origin's pages with no rescue and no laptop.
The rescue stays as the net for a chunk neither copy has.

So:

- To **check a change compiles**, never touch the live build:
  `NEXT_DIST_DIR=.next-verify npm run build` (and `git checkout -- web/tsconfig.json`
  afterwards — `next build` edits it).
- To **ship a change**, finish the job: build → restart the origin →
  `npm run site:publish`. A rebuild without a republish is a half-deploy, and the
  half that is missing is the one holding the stylesheet.

## First-time setup (already done, recorded for a rebuild)

1. `cloudflared tunnel route dns honeymoney origin.honeymoney.app`
2. Add the `origin.honeymoney.app` ingress rule to `~/.cloudflared/config.yml`
   **above** the catch-all, then restart cloudflared.
3. Deploy the Pages project, then add `honeymoney.app` and `www.honeymoney.app`
   as **custom domains** on it (Pages → honeymoney → Custom domains). This
   repoints the apex from the tunnel to Pages.

To roll the whole thing back: remove the custom domains from the Pages project
and point `honeymoney.app` / `www` back at the tunnel
(`cloudflared tunnel route dns honeymoney honeymoney.app`). The tunnel still
serves the full app on its own, exactly as before.

## Verify

Before anything is built or uploaded, prove the worker still routes:

```bash
cd web && npm run check:worker      # ~4s, offline, no wrangler and no credentials
```

`site:publish` runs it first, so a broken front door cannot be deployed. It
drives the real `_worker.js` against a stubbed ASSETS binding that behaves the
way Pages actually behaves — **a miss is the site's HTML at status 200, not a
404** — which is the single detail the 2026-09-08 failure turned on. See the
header of `web/scripts/check-worker.mjs`.

```bash
curl -sI https://honeymoney.app/gallery | grep -i x-honeymoney-served   # edge-snapshot
curl -sI https://honeymoney.app/dashboard | grep -i x-honeymoney-served # absent → origin
curl -s  https://honeymoney.app/snapshot.json                           # builtAt — how old is the edge copy?
```

`X-HoneyMoney-Served` is `edge-snapshot` (static), `offline` (the fallback page),
or absent (a live origin response, passed through untouched).

The honest test is the one that matters: **stop the stack and reload the site.**

```powershell
powershell -File deploy/stop-honeymoney.ps1
# /, /guide, /learn, /gallery, /deck must all still load.
# /dashboard must show the offline page, not a Cloudflare 1033.
powershell -File deploy/start-honeymoney.ps1
```

## Limits worth remembering

- The snapshot renders in **English, signed out**. That is correct for a public
  page, but a signed-in user who lands on `/` while the laptop is off sees the
  signed-out header until they hit an app route.
- Adding a public page means adding it to `ROUTES` in the build script — the
  worker picks it up automatically from there.
- Live figures on the landing page (FX rates) are frozen at snapshot time.
- This buys **availability of the public pages only**. The app itself is still
  only up while the laptop is. The real fix for that is an always-on host
  (~$5/mo Singapore VPS); this shrinks the blast radius until then.
