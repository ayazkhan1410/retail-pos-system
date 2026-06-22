#!/usr/bin/env sh
set -e

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "Creating .env from .env.example ..."
  cp .env.example .env
  echo "Edit .env (passwords) then run this script again."
  exit 1
fi

docker compose up -d

# shellcheck disable=SC1091
. ./.env

echo ""
echo "SmartShop POS is starting:"
echo "  Frontend:  http://localhost:3000"
echo "  Backend:   http://localhost:8000/api/health-check/"
echo "  Database:  PostgreSQL on localhost:${POSTGRES_PORT:-5432}"
