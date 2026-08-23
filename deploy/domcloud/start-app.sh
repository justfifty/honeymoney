#!/usr/bin/env bash
# Passenger's app_start_command for the Next.js standalone bundle.
#
# The one job here is loading secrets WITHOUT putting them in the deployment
# script, which is committed to the repo. ~/.env.honeymoney is chmod 600 and
# lives only on the host; app.deploy.yml creates it empty on first deploy.
#
# Passenger already exports PORT. Next.js standalone reads its config from the
# environment at runtime, so nothing here needs a rebuild to change.
set -euo pipefail

if [ -f "$HOME/.env.honeymoney" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$HOME/.env.honeymoney"
  set +a
fi

export NODE_ENV=production
export HOSTNAME=127.0.0.1        # Passenger proxies over IPv4 loopback only

exec node server.js
