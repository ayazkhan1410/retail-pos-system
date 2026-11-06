#!/usr/bin/env sh
set -e

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "Missing .env — copy .env.example to .env first."
  exit 1
fi

BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/smartshop-${STAMP}.sql"

# The database container already has these values; .env is not valid shell, so don't source it.
if ! docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$OUT"; then
  rm -f "$OUT"
  echo "Backup failed." >&2
  exit 1
fi
echo "Backup saved: $OUT"
