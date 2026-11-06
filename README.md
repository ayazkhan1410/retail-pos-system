# SmartShop POS

Point of sale for Pakistani retail: Django + PostgreSQL backend, React frontend, English and Urdu.

## Run it for development

```sh
cp .env.example .env
cp frontend/.env.example frontend/.env
docker compose up -d --build --wait
docker compose exec backend python manage.py seed_demo
```

`seed_demo` prints the demo login password. Open http://localhost:3000.

| Account | Sees |
|---|---|
| `admin@smartshop.local` | Superuser, also opens Django admin |
| `owner@smartshop.local` | Everything, including staff and role permissions |
| `manager@smartshop.local` | Everything except staff management |
| `cashier@smartshop.local`, `cashier2@smartshop.local` | POS only |
| `stock@smartshop.local` | Products, stock, purchases |
| `accounts@smartshop.local` | Reports, expenses, payments |

## Run it in a shop

1. In `.env`, set a real `DJANGO_SECRET_KEY` and `POSTGRES_PASSWORD`. The app refuses to start with the placeholder key.
2. Add the server's LAN address to `DJANGO_ALLOWED_HOSTS` and, as `http://<address>:3000`, to `CORS_ALLOWED_ORIGINS`.
3. Start it and create the owner account:

```sh
docker compose -f docker-compose.prod.yml up -d --build --wait
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```

Counters then open `http://<server-address>:3000`. Add cashiers under Settings > Staff.

## Tests

```sh
cd backend && python manage.py test   # concurrency tests only run on PostgreSQL
cd frontend && npm run lint && npm run build
```

## Backups

`infra/scripts/backup.sh` dumps the database into `backups/`. Settings > Backup Database does the same from the app. Copy these files off the server: a backup on the same disk won't survive that disk failing.

To restore one into an empty database:

```sh
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < backups/smartshop-YYYYMMDD-HHMMSS.sql
```
