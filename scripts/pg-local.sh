#!/usr/bin/env bash
# Starts a throwaway local PostgreSQL 16 cluster in ./.pgdata on port 54329 if one isn't running.
# Used for local development, integration tests and Playwright. Not used in production.
set -euo pipefail

PGPORT="${PGPORT:-54329}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/.pgdata"

BIN=""
for candidate in /usr/lib/postgresql/16/bin /usr/lib/postgresql/15/bin /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@16/bin; do
  if [ -x "$candidate/pg_ctl" ]; then BIN="$candidate"; break; fi
done
if [ -z "$BIN" ] && command -v pg_ctl >/dev/null 2>&1; then BIN="$(dirname "$(command -v pg_ctl)")"; fi
if [ -z "$BIN" ]; then
  echo "PostgreSQL binaries not found. Install PostgreSQL 16 or point DATABASE_URL at a Supabase database." >&2
  exit 1
fi

if pg_isready -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1; then
  echo "PostgreSQL already running on port $PGPORT"
  exit 0
fi

# initdb refuses to run as root; use the postgres OS user when we are root.
RUN=()
if [ "$(id -u)" = "0" ]; then
  RUN=(runuser -u postgres --)
  mkdir -p "$DATA"
  chown postgres "$DATA"
fi

if [ ! -f "$DATA/PG_VERSION" ]; then
  "${RUN[@]}" "$BIN/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 >/dev/null
fi

"${RUN[@]}" "$BIN/pg_ctl" -D "$DATA" -o "-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1" -l "$DATA/pg.log" -w start >/dev/null
echo "PostgreSQL started on 127.0.0.1:$PGPORT (data: .pgdata)"
