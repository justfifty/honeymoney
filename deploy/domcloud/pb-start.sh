#!/usr/bin/env bash
# Passenger's app_start_command for PocketBase (pb.deploy.yml, any plan).
#
# ⚠️ --encryptionEnv is not optional. Settings encryption was switched on for
# this database on 2026-08-23, and a PocketBase started without the key does
# not merely lose the settings block — it refuses to start at all:
#     invalid settings db data or missing encryption key ""
# So the key has to reach the host before pb_data does, or the migrated ledger
# is a file nobody can open. ~/.env.pocketbase holds it, chmod 600.
set -euo pipefail

cd "$(dirname "$0")"

PB_ARGS=(serve --http "127.0.0.1:${PORT:-8090}" --dir ./pb_data --migrationsDir ./pb_migrations)

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

exec ./pocketbase "${PB_ARGS[@]}"
