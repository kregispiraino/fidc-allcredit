#!/bin/sh
set -eu
# Railway mounts volumes as root. Prepare only the database directory, then drop privileges.
if [ "$(id -u)" = "0" ]; then
  db_dir=$(dirname "${ALLCREDIT_DB:-/data/allcredit.sqlite}")
  mkdir -p "$db_dir"
  chown node:node "$db_dir"
  for db_file in "${ALLCREDIT_DB:-/data/allcredit.sqlite}" "${ALLCREDIT_DB:-/data/allcredit.sqlite}-wal" "${ALLCREDIT_DB:-/data/allcredit.sqlite}-shm"; do
    if [ -f "$db_file" ]; then chown node:node "$db_file"; fi
  done
  exec gosu node "$@"
fi
exec "$@"
