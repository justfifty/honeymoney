# honeymoney.app on DOM Cloud — 24/7 without the laptop

The signed-in app (`/dashboard`, `/graph`, `/record`, `/hscore`, `/goals`, `/api/*`)
runs on this laptop today and dies when the laptop sleeps. Cloudflare Pages already
keeps the *public* pages up — `/`, `/demo`, `/deck` — so what is missing is a host
with a **persistent writable disk**, which is the one thing PocketBase needs and no
Cloudflare compute product rents. That is what DOM Cloud is for. Nothing here is a
shortcut around Cloudflare; it is the consequence of needing a disk.

---

## The blocker that is now cleared

An earlier plan named DOM Cloud without anyone reading its limits, and the storage
limit would have stopped the migration halfway. Measured on this machine:

| | before | after `output: "standalone"` |
|---|---|---|
| `.next` | **713 MB** | `standalone/` + `static/`, shipped |
| `node_modules` | **587 MB** | **not shipped at all** |
| `public/` | 6.4 MB | 6.4 MB |
| **total on the host** | **~1.3 GB** | **65 MB** (21 MB over the wire) |

Both figures are from a real `push-build.ps1 -DryRun`, not an estimate. 1.3 GB did
not fit in the free tier's 1.5 GB *before* PocketBase, `pb_data` or a single receipt.
65 MB fits on every tier with room to spare.

`output: "standalone"` is in `web/next.config.ts` but **opt-in**, behind
`NEXT_STANDALONE=1`, which `push-build.ps1` sets for its own build. It is not
unconditional because this laptop serves the live site with `next start`, and Next
refuses that pairing outright: *"next start" does not work with "output: standalone"*.
Turning it on globally would move honeymoney.app onto a path its own framework warns
about, in order to benefit a host this laptop is not.

Add `pb_data` at 26 MB today (13 MB of which is local backup copies that do not need
to travel, since R2 holds them) and the PocketBase binary, and the host footprint is
comfortably double-digit megabytes.

---

## Shape

Two DOM Cloud websites, because PocketBase and Next.js are two long-running
processes and NGINX routes by hostname:

```
  Cloudflare (DNS + edge)
    honeymoney.app, www  -> Pages snapshot        (public pages, already 24/7)
    origin               -> the laptop's tunnel   (DO NOT REPOINT - see NEXT.md #12)
    app                  -> DOM Cloud site 1      <- Next.js standalone
    pb                   -> DOM Cloud site 2      <- PocketBase + pb_data
```

`origin` is left alone deliberately. Adding new names means the laptop path keeps
working the whole time, and the cutover is one DNS edit that can be reversed in one
DNS edit. Migrating by repointing the name everything already depends on gives you
no way back.

The app reaches PocketBase over `https://pb.…` rather than a loopback port, because
under Passenger the port is assigned per spawn and is not a fixed address.

---

## Which PocketBase variant — decided: `pb.deploy.yml`

**The plan is Lite** (5 GB storage, 20 GB bandwidth, x64), bought 2026-08-24, and
**`pb.deploy.yml` is the file to paste.** Lite is the baseline this project targets.
Kit is not a prerequisite, is not planned, and nothing here is written as "until you
upgrade" — `pb.deploy.kit.yml` exists only so the daemon arrangement is already
worked out if the plan is ever raised for some *other* reason, like traffic.

DOM Cloud caps **any process at 3 hours** unless the site has the `docker` feature,
which their docs put at "only starting with Kit Plan or higher". Verified against
their docs on 2026-08-24 rather than remembered.

| | `pb.deploy.yml` — **in use** | `pb.deploy.kit.yml` — optional, unused |
|---|---|---|
| plan | **Lite** (also Free) | Kit or higher |
| site reachable 24/7 | **yes** | yes |
| how PocketBase runs | NGINX starts it on request | `pb-run.sh` daemon, hourly watchdog |
| nightly backup | **triggered externally, scheduled** | fires in-process |
| cold start on first request after idle | a SQLite open | none |
| two processes on one `data.db` | possible under concurrency this origin does not see | no |

**The site is up 24/7 on Lite.** This is worth stating plainly because the 3-hour cap
sounds like it says otherwise. It does not. Under Passenger, NGINX starts the app
when a request arrives, so every visitor gets an answer at any hour; what Lite denies
is a process that sits resident in the background *between* requests. Uptime is not
what the cap costs you.

What it costs is exactly one thing that matters here: **PocketBase's own nightly cron
backup cannot be relied on to fire**, because the process it lives in is not running
at 3am when nobody has visited. So the backup has to be triggered from outside, and
`deploy/backup-pocketbase.ps1` is that trigger:

```powershell
# after the migration — note -PbUrl, this is the whole point
powershell -File deploy\backup-pocketbase.ps1 -PbUrl https://pb.honeymoney.app
```

Scheduled as the **`HoneyMoney-Backup`** task (daily 03:15, `StartWhenAvailable` so a
night with the laptop off fires at next wake rather than being skipped). Until the
migration it points at the local PocketBase, which is the live one; **after the
migration, add `-PbUrl` to the task or it will faithfully back up the stale local
copy and log success.** Sizing note: 5 GB against a 65 MB bundle and a 26 MB
`pb_data`, and 20 GB of bandwidth against an origin that only serves signed-in
routes because Pages fronts the public pages — Lite is not a tight fit, it is a
generous one.

---

## Runbook

### 0. One-time, in the DOM Cloud dashboard (the only manual part)

Everything else here is scripted. These three cannot be, because they need the
account this machine has no credential for:

1. **Add the deploy key.** Profile -> SSH Keys, paste the **public** half of
   `id_domcloud.pub`. The private half never leaves this laptop and is gitignored.
2. **Create two websites** — one for the app, one for PocketBase. Note the SSH
   username and host shown for each.
3. **Paste the deployment script** into each site's Setup -> Deploy tab:
   `app.deploy.yml` for the app site, and **`pb.deploy.yml`** for the PocketBase
   site. There is no choice to make here — `pb.deploy.yml` is the one, on Lite.
   (`pb.deploy.kit.yml` is an unused Kit-plan variant kept for later; pasting it
   on Lite would be a fair-use violation, since it asks for a `docker` feature
   the plan does not carry.)

   The PocketBase YAMLs are **self-contained**: each one writes its own start
   script (`pb-start.sh` or `pb-run.sh`) onto the host before invoking it. That
   is not a stylistic choice. The PocketBase site has no other delivery path for
   a file — `push-build.ps1` ships over SSH to the *app* site, and the repo is
   private so DOM Cloud's `source:` git clone is out — and the deployment runs
   on the host *before* any `scp` could have happened. Earlier revisions of
   these YAMLs invoked a script nothing ever created: the site would deploy
   clean and then refuse to start.

   The embedded copy is generated, never hand-edited — edit the `.sh` file and
   run `node deploy/domcloud/sync-embeds.mjs`. `npm run check:domcloud` (in
   `web/`) fails if the two have drifted, because a stale `pb-run.sh` is the one
   that forgets `--encryptionEnv`, and PocketBase does not degrade without it —
   it refuses to start.

Then write the app site's SSH target down once, so it is not retyped every deploy:

```powershell
Set-Content deploy\domcloud\.host "youruser@sgp.domcloud.co"
```

### 1. Ship the app

```powershell
./deploy/domcloud/push-build.ps1
```

Builds into `.next-dc` (never `.next` — that is what this laptop's live site is
serving out of), stages `standalone/` + `static/` + `public/`, and extracts it over
SSH into `~/public_html`. Re-run it after any change; it is the DOM Cloud equivalent
of `npm run site:deploy`. `-DryRun` builds and stages without shipping.

### 2. Give the app its environment

`~/.env.honeymoney` on the host, `chmod 600`, read by `start-app.sh` at spawn. It is
deliberately not in this repo and not in the deployment YAML, which is committed.

```
POCKETBASE_URL=https://pb.honeymoney.app
POCKETBASE_ADMIN_EMAIL=...
POCKETBASE_ADMIN_PASSWORD=...
DEMO_TENANT_ID=hhrahman1111111
GEMINI_API_KEY=...
AI_PROVIDER=gemini
AI_SECRETS_KEY=...
```

`AI_SECRETS_KEY` encrypts household-supplied AI keys (`tenant_ai_keys`). It is
load-bearing in the same way `deploy/.pb-encryption-key` is, but it fails *softly*:
a host without it restores the rows and cannot read any of them, so households drop
back to the server's engine and their saved key is gone with no error anywhere.
Carry it across with the data.

**Point `POCKETBASE_URL` at the laptop's tunnel first** (`https://origin.honeymoney.app`).
That proves the app runs on DOM Cloud without any risk to the ledger — if it fails,
nothing has moved. Only once that is green does step 4 make sense.

### 3. Custom domains + Cloudflare

Add `app.honeymoney.app` and `pb.honeymoney.app` to the two sites in DOM Cloud (it
issues Let's Encrypt certificates), then add the matching DNS records in Cloudflare.
Leave `honeymoney.app`, `www` and `origin` exactly as they are.

### 4. Move the ledger — LAST

```powershell
./deploy/domcloud/migrate-pocketbase.ps1 -PbHost pb.honeymoney.app -Confirm
```

Takes a fresh backup from the local PocketBase (a backup zip is a consistent
snapshot; copying `data.db` out from under a running SQLite is not), ships the
**settings-encryption key first**, restores, and then reads a collection back over
HTTPS. It does not delete anything locally.

> **The key is not a convenience.** Since encryption was switched on (2026-08-23) a
> PocketBase without it does not lose the settings block, it refuses to start:
> `invalid settings db data or missing encryption key ""`. A `pb_data` that arrives
> on the host before its key is a file nobody can open. Verified both ways against
> the same R2 zip — see NEXT.md #14.

### 5. Flip and verify

Change `POCKETBASE_URL` in `~/.env.honeymoney` to `https://pb.honeymoney.app`,
`touch ~/public_html/tmp/restart.txt`, and re-run `deploy/verify-uptime.ps1`.

---

## Rollback

Each step undoes independently, which is the reason for the order:

| step | undo |
|---|---|
| ledger moved | point `POCKETBASE_URL` back at `https://origin.honeymoney.app` — the laptop's `pb_data` was never deleted, and the outgoing remote copy is kept as `pb_data.replaced.<timestamp>` |
| app on DOM Cloud | the tunnel and the laptop are untouched throughout; remove the `app` DNS record |
| everything | nothing here modifies `honeymoney.app`, `www` or `origin` |

---

## Housekeeping

- **Inactivity.** The plan extends 60 days on each login, and >50 MB of monthly
  traffic extends it too, so a site with real users renews itself. A lapse gives 14
  days before deletion. Worth a calendar reminder while traffic is low.
- **Outbound is metered** (2 GB/mo free, 20 GiB Lite). Survivable because Pages
  fronts the public pages, so only signed-in dynamic routes reach this origin.
  `app.deploy.yml` sets a 30-day cache on `/_next/static` for the same reason.
- **PocketBase is pinned to 0.39.6**, the version that wrote `pb_data`. A newer
  binary runs its own one-way data migrations on first start. Upgrade deliberately,
  with a backup in hand — not as a side effect of a deploy.
- **Architecture is detected, not assumed.** The install commands read `uname -m`,
  so the same script works on the free tier's ARM and on x64 if a paid plan offers it.
- **The GitHub repo is private**, which is why nothing here uses DOM Cloud's `source:`
  git clone. Shipping a built artifact over SSH keeps a GitHub token off the host
  entirely — one less credential in one more place.
