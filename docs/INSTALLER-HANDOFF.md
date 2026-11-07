# Tijori POS: handoff for building the Windows installer

Paste this whole file to the assistant that continues the work. It describes the project, what is
already done, the owner's rules, and the exact plan for the installer.

---

## 1. The product

**Tijori POS:** a single-shop barcode point of sale for Pakistani retail (Rs, English and Urdu).

| Layer | Tech | Where |
|---|---|---|
| Backend | Django 5 + Django REST Framework, session auth + CSRF | `backend/` |
| Database | PostgreSQL 16 | Docker today |
| Frontend | React 18 + Vite + TypeScript + Tailwind, Zustand, i18n EN/UR | `frontend/` |
| Desktop | Electron 33 + electron-builder (NSIS) | `desktop/` |
| Search | Elasticsearch is optional; the database answers when it is absent or down | `backend/inventory/services/search.py` |

Django apps: `auth` (users, roles, PIN), `inventory` (products, stock, branch), `sales` (sales, shifts,
terminals, returns, held bills), `customers` (khata), `suppliers`, `purchases` (GRN, purchase returns),
`finance` (expenses, reports, analytics, Home overview), `notifications` (server-sent events), `audit`.

Repo: `https://github.com/ayazkhan1410/retail-pos-system`, branch `main` (work branch `claude/affectionate-cannon-k9yk0l` is in sync).

## 2. What is done (do not redo)

- All 12 screens rebuilt to the design mockups in `tijori-design-mockups/`: Login, Home, Register (till),
  Orders, Customers, Products, Purchases, Suppliers, Expenses, Reports, Analytics, Settings.
  Light and dark mode, Urdu right-to-left, phone width.
- APIs behind them: `/api/finance/overview/`, `/api/sales/summary/`, `/api/customers/summary/` and
  `/<id>/profile/`, `/api/purchases/summary/`, `/api/finance/expenses/summary/`,
  `/api/finance/report/<sales|stock|tax|cashiers|khata>/`, `/api/finance/report/trend/`,
  `/api/finance/analytics/`, `/api/sales/terminals/` (create and update), `/api/auth/pin-login/`.
- New model fields, with migrations committed: `Customer.area`, `Branch.store_name`,
  `Branch.receipt_footer`, `Expense.shift`, `Supplier.payment_terms_days`, `GRN.supplier_invoice_no`.
- `backend/serve.py`: production server using **waitress** (runs on Windows; gunicorn does not).
  `python serve.py --migrate [--host 0.0.0.0] [--port 8000] [--threads 12]`. Runs `check --deploy` at start.
- Search falls back to the database, so Elasticsearch is not needed on shop PCs.
- Desktop app renamed to **Tijori POS** (`appId pk.tijori.pos`). The production build has no source maps.
- Tests: 156 backend tests pass. `e2e/design.mjs` (34 browser checks) passes. Frontend lint and build pass
  (one lint warning in `useKeyboard.ts` predates this work).

## 3. The owner's rules (must follow)

1. **Models and migrations:** explain any model change and get explicit approval first. Never run
   `makemigrations` or `migrate` against the owner's databases, and never create or commit migration
   files. Report the commands for the owner to run instead. (Running migrations inside an installer on
   the *client's* new database is the product working as designed; confirm this with the owner once.)
2. Run Ruff on changed backend files after every change; fix only issues in the changed code.
3. Never weaken or skip tests or CI checks to get green.
4. Enforce permissions on the server; validate all input; bound sizes and limits.
5. Never hard-code secrets, company details or rates. Generate secrets per install.
6. Money uses Decimal. Times are timezone-aware (`Asia/Karachi`).
7. Don't fake features: JazzCash, Easypaisa and Raast are payment *labels* only, with no live integration.
8. Report honestly what was verified and what was not.

## 4. Why the current desktop app can't be given to clients

`desktop/main.js` runs `docker compose -f docker-compose.prod.yml up -d` in `ROOT_DIR = path.join(__dirname, '..')`
and opens `http://localhost:3000`. So:

- The client PC needs **Docker Desktop** (WSL2, restart, GBs).
- The **full source tree** must be on the client PC.
- `npm run dist:win` builds an `.exe`, but inside the packaged app `__dirname` is `resources/app.asar`,
  so `ROOT_DIR` is wrong and the stack never starts. **Do not ship that build.**

## 5. Goal: the client experience

1. Run `Tijori-POS-Setup.exe` (signed), then licence, install location, Install.
2. On first launch, a **setup wizard** in English and Urdu with three screens:
   - Store: store name, branch, phone, address, NTN (optional), receipt footer.
   - Owner: full name, email, password, entered twice.
   - Counters: number of tills (default 1).
3. Progress bar "Setting up your store…", then the Tijori login screen.
4. Desktop and Start-menu shortcuts. Starts with Windows. No terminal, Docker or source code is ever visible.

## 6. Build plan (do in this order; each step committed separately)

### Step 1: `setup_shop` management command (backend)
`backend/inventory/management/commands/setup_shop.py` (or a small new app). Does the whole first run in
one transaction:

- Arguments: `--store-name --branch --phone --address --ntn --receipt-footer --owner-name --owner-email
  --counters N`. Read the password from the `TIJORI_OWNER_PASSWORD` env var or stdin, **never** from argv
  (argv is visible in the Task Manager).
- **Refuse if already set up** (any owner user exists, or a marker setting is set) unless `--force`.
- Validate: email format, password strength with Django's validators, counters 1–20, field lengths
  matching the models.
- Create: the default branch updated with store details (`Branch`, code `01`), terminals `C1..Cn`
  (`sales.Terminal`, names "Counter 1..n"), an owner user (`auth.CustomUser`, role `owner`), and the
  starter categories and role permissions (data migrations already seed these; make sure they exist).
- Output machine-readable JSON (`{"ok": true}` or an error) so the wizard can show messages.
- Tests: first run works; second run refused; bad email or weak password rejected; counters bounds;
  password not accepted via argv.

### Step 2: setup wizard UI (Electron)
- `desktop/setup.html` + `desktop/setup.js` (or React route) using the Tijori design (Inter font,
  indigo `#635bff`, neutral greys; see `frontend/tailwind.config.js` and `frontend/src/components/ui/Kit.tsx`).
- `desktop/main.js`: on launch, if `%APPDATA%/Tijori/config.json` is missing, show the wizard.
  On submit, IPC to the main process, which runs migrate and then `setup_shop`, streaming progress.
  Then write `config.json` (port, data dir, version) and open the app.
- `preload.js` already exposes `window.smartshop` (the frontend uses `window.smartshop.openBackupsFolder`);
  keep that name and add new methods beside it.

### Step 3: bundle the runtime (no Docker)
Install into `%PROGRAMFILES%\Tijori` (app) and `%PROGRAMDATA%\Tijori` (data, logs, backups).

- **PostgreSQL:** bundle the portable Windows binaries (EDB zip). On first run, `initdb` into
  `%PROGRAMDATA%\Tijori\pgdata`, create the `tijori` user with a **generated** password, and listen on
  `127.0.0.1` only. Start it with `pg_ctl` from Electron, or register a Windows service.
- **Backend:** compile with **Nuitka** (`--standalone`, entry `backend/serve.py`), so no `.py` source
  ships. Include Django templates, static files and migrations. `requirements.txt` already has
  `waitress`. Elasticsearch is not needed.
- **Environment** written by the main process into `%PROGRAMDATA%\Tijori\tijori.env` and passed to the
  server: `DJANGO_SECRET_KEY` (generate 50+ random chars), `DJANGO_DEBUG=False`, `POSTGRES_*`,
  `DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,<LAN IP>`, `DJANGO_TIME_ZONE=Asia/Karachi`, `BACKUP_DIR`.
  Keep the ACL on that file restricted to admins and SYSTEM.
- **Frontend:** `npm run build` and serve `frontend/dist` (no source maps) either from Electron
  (`loadFile`, with API calls to `http://127.0.0.1:<port>/api`) or from Django/waitress at the same
  origin (simpler for CSRF; add whitenoise or a static view). The frontend reads `VITE_API_BASE_URL`
  (default `/api`).
- **Lifecycle:** Electron starts Postgres, then the server, polls `/api/health-check/` (exists), then
  shows the window; it stops both on quit. Choose a free port if 8000 is busy.
- **electron-builder:** set `extraResources` to the Nuitka output, the PostgreSQL binaries and the
  frontend build. Fix `ROOT_DIR` (use `process.resourcesPath`).

### Step 4: CI builds the installer
A GitHub Actions workflow on `windows-latest`: build the frontend, Nuitka-compile the backend, download
the pinned PostgreSQL zip (verify its checksum), run `electron-builder --win nsis --x64`, and upload
`Tijori-POS-Setup-<version>.exe` as an artifact. Sign it with the certificate from repository secrets
when available.

### Step 5: updates and backups
- `electron-updater`: before updating, back up the database (`pg_dump` to `%PROGRAMDATA%\Tijori\backups`),
  then run migrate on the next launch.
- A daily scheduled backup, keeping the last 14 days. The backup logic already exists in
  `backend/smartshop_pos/services/backup.py`.
- Uninstall keeps data unless the user ticks "Delete my data".

### Other tills on the shop network
A "client mode" install, or just Chrome pointed at `http://<main-PC-IP>:<port>`. Open the Windows
firewall port for the private network only.

## 7. Gotchas already found

- `gunicorn` does not run on Windows; use `serve.py` (waitress).
- The notification stream (`/api/notifications/stream/`) caps 3 streams per process and answers 503
  beyond that; the client reconnects. That is expected.
- `settings.py` refuses to start if `DJANGO_SECRET_KEY` is empty or starts with `change-me`.
- Data migrations seed role permissions, the default branch `01`, categories and terminals C1/C2.
  `setup_shop` should rename or extend those, not duplicate them.
- PIN sign-in on the login screen works only on a "till" browser (a signed cookie set after an email
  login) and only for cashier-level roles. Keep that.
- Phone numbers must use `dir="ltr"` in Urdu mode, or the digits reverse.
- The health check message still says "SmartShop POS is running"; leave it unless tests and Docker are updated together.

## 8. Commands

```bash
# backend tests (Docker dev stack)
docker compose exec backend python manage.py test
# ruff on changed files
docker compose exec -T backend sh -c 'RUFF_CACHE_DIR=/tmp/ruff-cache ruff check <files>'
# frontend
cd frontend && npx tsc -b && npm run lint && npm run build
# browser checks (needs a seeded app running)
cd e2e && npm install && BASE=http://localhost:3000 PASSWORD=<seed_demo password> node design.mjs
# run the server without Docker
cd backend && python serve.py --migrate
```

## 9. Before selling (not part of the installer)

Code-signing certificate; licensing and activation; tests on real hardware (scanner, 80 mm printer,
cash drawer); a backup restore drill; FBR POS integration if targeting Tier-1 retailers; a 2–4 week pilot
at one or two shops.
