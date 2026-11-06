#!/usr/bin/env sh
set -e

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: $0 backups/smartshop-YYYYMMDD-HHMMSS.sql"
  exit 1
fi

if [ ! -f .env ]; then
  echo "Missing .env — copy .env.example to .env first."
  exit 1
fi

# Trust boundary: only restore dumps produced by infra/scripts/backup.sh on this shop.
# Do not pipe untrusted .sql files — they run as the DB role with full write access.
case "$FILE" in
  *.sql) ;;
  *)
    echo "Refusing non-.sql file: $FILE"
    exit 1
    ;;
esac

echo "Restoring $FILE into the database container…"
echo "This replaces current data. Ctrl-C within 5 seconds to abort."
sleep 5

# Drop/recreate public schema then load dump so restore is idempotent on a running stack.
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
SQL

docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < "$FILE"
echo "Restore finished: $FILE"
