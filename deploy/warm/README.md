# The warmer

One Cloudflare Worker, no routes, one job: hit `/api/health` on both halves of
the origin every 3 minutes so that no real visitor is the one who pays the
Passenger cold start (~3s, measured).

## Deploy

```
cd deploy/warm
npx wrangler deploy
```

That is the whole thing. There are no secrets and no bindings — both URLs are
in `wrangler.toml` under `[vars]`, because a health endpoint's address is not a
secret and putting it in the file is what makes the config readable.

## Check it

```
npx wrangler tail honeymoney-warm          # watch the schedule fire
curl https://honeymoney-warm.<subdomain>.workers.dev/   # run the same knock by hand
```

Expected, warm:

```
app: 200 in 90ms  |  pocketbase: 200 in 40ms
```

Expected, cold (this is the request that did the useful work):

```
app: 200 in 3140ms  |  pocketbase: 200 in 610ms
```

## Turning it off

`npx wrangler delete honeymoney-warm`, or comment out `crons` and redeploy. The
site behaves exactly as it did before: correct, with a cold start on the first
visit after an idle spell.

## Why not in the Pages worker

Pages Functions cannot carry cron triggers. A `[triggers]` block in a Pages
project parses fine and never fires — the same silent-drop shape as
`min_instances` in `deploy/domcloud/pb.deploy.yml`. A standalone Worker is the
only place on this account where a schedule actually runs.
