# SmartShop POS — Cursor handoff context

**Last updated:** 6 Nov 2026  
**Branch:** `Ayaz/local-main` @ `2b13f52`  
**Remote:** `https://github.com/ayazkhan1410/retail-pos-system.git`  
**Goal:** Single-shop barcode POS for Pakistan (Rs, JazzCash/Easypaisa/Raast *as payment methods*, khata). Deliver a polished shop-ready product — do **not** overclaim unfinished modules.

Read this first in a new Cursor chat. Details of the last QA pass: [TESTING-AND-SECURITY-REPORT.md](./TESTING-AND-SECURITY-REPORT.md).

---

## What this project is

| Layer | Stack |
|-------|--------|
| Backend | Django + DRF, Postgres (Docker), session auth + CSRF |
| Frontend | React + Vite + TS, Zustand, i18n EN/UR |
| Desktop | Electron launcher under `desktop/` (not fully Windows-tested) |
| Run locally | `docker compose up` → API `localhost:8000`, UI `localhost:3000` |

**Business constraints (do not invent):**
- No fake JazzCash/Easypaisa/FBR integrations — POS only records those payment methods.
- Raast is a payment method label only unless a real rails integration is built later.
- **Never** create/edit/run migrations unless the user explicitly asks. After approved model changes, tell them the `makemigrations` / `migrate` commands.
- Prefer small, complete changes (ponytail): finish callers/tests; no drive-by refactors.

---

## Recent work (this branch)

Shipped since the product-list crash and feature/security pass:

1. **Product list crash fixed** — `extra_barcodes` is `write_only=True` in `backend/inventory/serializers.py`; reads still filled in `to_representation`.
2. **Notifications** — low-stock stays quiet after read until restock; expiry uses product-level dedupe; SSE capped at 3 streams/worker.
3. **Purchase returns** — API `/api/purchases/returns/`, Purchases UI tab, stock/rate/credit-ledger guards.
4. **Walk-in returns** — Sales → “Return without invoice”; server ignores client `unit_price` (catalog till price only).
5. **PIN switching** — set PIN in Staff settings; switch on POS; no owner escalation; unique PINs.
6. **Product form** — sale rate + extra barcodes fields.
7. **GRN void + offline credit** — tests added; security hardening on returns/PIN.
8. **QA report** — `docs/TESTING-AND-SECURITY-REPORT.md` (111 tests OK, ~86% coverage, High issues fixed).

**DB dump for laptop handoff:** `backups/smartshop-20261106-202620.sql` (force-added to git; normally `backups/*` is ignored).

Restore on the other machine (destructive — replaces DB):

```bash
git pull origin Ayaz/local-main
docker compose up -d
bash infra/scripts/restore.sh backups/smartshop-20261106-202620.sql
```

Demo login was reset during browser QA to `admin@smartshop.local` / `S3cure-pass-99` — change if needed.

---

## Architecture cheat sheet

| Concern | Where |
|---------|--------|
| Products / stock / barcodes / sale_rate | `backend/inventory/` |
| Sales, shifts, returns, offline sync | `backend/sales/` |
| GRN + purchase returns | `backend/purchases/` |
| SSE alerts | `backend/notifications/` (`stream.py`, `services.py`) |
| PIN switch | `backend/auth/views.py` `SwitchByPinView` |
| POS UI | `frontend/src/pages/POSPage.tsx` + `components/pos/` |
| Inventory form | `frontend/src/components/inventory/ProductForm.tsx` |
| Purchases / supplier returns UI | `frontend/src/pages/PurchasesPage.tsx`, `components/purchases/` |
| Walk-in return UI | `frontend/src/components/sales/WalkInReturnModal.tsx` |
| Backup / restore | `infra/scripts/backup.sh`, `infra/scripts/restore.sh` |
| Prod gunicorn | `docker-compose.prod.yml` — 3 workers × 4 gthread |

---

## Status board

### Done enough for single-shop delivery
- Core POS: login, roles, catalog, cash/quick pay, shifts, receipts
- Inventory, suppliers, GRN post/void, customers/khata, expenses, reports/insights (as coded)
- Notifications stream + expiry scan
- Purchase returns (API + UI), walk-in returns, PIN set/switch, sale rate & extra barcodes in product form
- Security High fixes from last audit (walk-in price, PIN escalation, purchase-return stock/rate/ledger)

### Partly done / ops still needed on client PC
- [ ] Production `.env`: strong `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False`, hosts/CORS
- [ ] HTTPS reverse proxy for shop LAN (PWA offline needs secure context)
- [ ] Off-site backup destination + one restore drill
- [ ] Windows installer: build/test on Windows (`desktop/` → `npm run dist:win`)
- [ ] Real scanner + printer on till hardware

### Not built (do not pretend they work)
- Real Raast payment rails
- Multi-branch / cloud sync
- Licensing & activation
- Supplier invoice OCR from photo
- Plain-language business Q&A
- Sales forecasting
- Full AI “Insights” beyond what exists

### Known nits
- Purchase-return product dropdown capped at 200 (needs typeahead later)
- ESLint warning: `useKeyboard` exhaustive-deps
- Product list ~0.7–0.9s for 800 SKUs unpaginated — paginate/search for huge catalogues
- Multi-branch isolation not implemented (`default_branch()` shortcut)

---

## How to verify quickly

```bash
docker compose up -d
docker compose exec -T backend python manage.py test
cd frontend && npx tsc -b && npm run lint
# Browser: http://localhost:3000 — POS cash sale, Inventory count, Sales walk-in return, Purchases returns tab
```

Ruff (backend, after Python edits):

```bash
docker compose exec -T backend sh -c 'RUFF_CACHE_DIR=/tmp/ruff-cache ruff check <changed files>'
```

---

## What the next agent should prioritize

If the user continues toward “customer delivery today/this week”:

1. **Client deploy checklist** — secrets, HTTPS, backup restore drill, seed password.
2. **UX polish only if asked** — barcode/sale-rate already in form; purchase-return typeahead; PIN UX.
3. **Do not start** Raast/OCR/NLP/forecast/licensing unless explicitly requested with scope.
4. **Never** ship migrations or force-push without explicit ask.

If something fails after restore: confirm Postgres healthy, migrations applied, then frontend against `:8000`.

---

## Conversation thread (compressed)

1. Closed POS gaps (notifications, seed, admin deletes, cash Take/Print/change flash, etc.).
2. Rejected Stitch “Apex café” redesign — keep barcode/Rs cash POS.
3. Fixed product list crash (`extra_barcodes`).
4. Implemented remaining usable features + security audit; High vulns fixed; report written.
5. DB dump + push to `Ayaz/local-main` for second laptop.

**User intent:** polished, tested, secure POS ready for shop delivery — transparent about what is still incomplete.
