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

# Optional off-site copy. Set BACKUP_OFFSITE_DIR to a mounted USB/NAS path, or
# BACKUP_OFFSITE_CMD to a full command (rclone, scp, aws s3 cp, …).
# Example: BACKUP_OFFSITE_CMD='rclone copy {{file}} remote:smartshop-backups/'
if [ -n "${BACKUP_OFFSITE_DIR:-}" ]; then
  mkdir -p "$BACKUP_OFFSITE_DIR"
  cp "$OUT" "$BACKUP_OFFSITE_DIR/"
  echo "Copied off-site to: $BACKUP_OFFSITE_DIR/$(basename "$OUT")"
fi

if [ -n "${BACKUP_OFFSITE_CMD:-}" ]; then
  CMD=$(printf '%s' "$BACKUP_OFFSITE_CMD" | sed "s|{{file}}|$OUT|g")
  sh -c "$CMD"
  echo "Off-site command finished."
fi
