#!/usr/bin/env bash
# Start PocketBase if it is not already running. Idempotent by design: this is
# both the starter (deploy) and the watchdog (hourly cron), and running it
# twice must never produce a second process against data.db.
#
# Kit-plan variant only — on Free/Lite a process living past 3 hours is a fair
# use violation, not a configuration choice. See pb.deploy.yml.
set -euo pipefail

APP_DIR="$HOME/public_html"
PORT=8090
PIDFILE="$APP_DIR/pb.pid"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  exit 0                                  # already up; say nothing
fi

# A stale pidfile and a live process can disagree — e.g. after the platform
# restarted the site. Ask the port, which is the thing that actually matters.
if command -v ss >/dev/null 2>&1 && ss -ltn "sport = :$PORT" 2>/dev/null | grep -q ":$PORT"; then
  exit 0
fi

cd "$APP_DIR"
mkdir -p "$HOME/logs"

# ⚠️ --encryptionEnv is not optional. Settings encryption was switched on for
# this database on 2026-08-23, and a PocketBase started without the key does
# not merely lose the settings block — it refuses to start at all:
#     invalid settings db data or missing encryption key ""
PB_ARGS=(serve --http "127.0.0.1:$PORT" --dir ./pb_data --migrationsDir ./pb_migrations)

if [ -f "$HOME/.env.pocketbase" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$HOME/.env.pocketbase"
  set +a
fi

if [ -n "${PB_ENCRYPTION_KEY:-}" ]; then
  PB_ARGS+=(--encryptionEnv=PB_ENCRYPTION_KEY)
else
  echo "WARNING: no PB_ENCRYPTION_KEY — this will fail against an encrypted pb_data" >&2
fi

nohup ./pocketbase "${PB_ARGS[@]}" >> "$HOME/logs/pocketbase.log" 2>&1 &

echo $! > "$PIDFILE"
sleep 2
kill -0 "$(cat "$PIDFILE")" 2>/dev/null \
  && echo "$(date -Is) started PocketBase pid $(cat "$PIDFILE")" \
  || { echo "$(date -Is) PocketBase failed to start; see ~/logs/pocketbase.log"; exit 1; }
