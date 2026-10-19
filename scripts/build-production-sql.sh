#!/usr/bin/env bash
# Concatenates the migrations into one transaction for pasting into the Supabase SQL editor.
set -euo pipefail
cd "$(dirname "$0")/.."
out=supabase/production-setup.sql
{
  echo "-- One Off: full database setup for a new Supabase project."
  echo "-- Paste into Supabase Dashboard > SQL Editor and click Run. Runs as one transaction."
  echo "-- Generated from supabase/migrations by scripts/build-production-sql.sh; do not edit by hand."
  echo
  echo "begin;"
  for f in supabase/migrations/*.sql; do
    echo
    echo "-- ===== $(basename "$f") ====="
    cat "$f"
  done
  echo
  echo "commit;"
} > "$out"
echo "Wrote $out"
