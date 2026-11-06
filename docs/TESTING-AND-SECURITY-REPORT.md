# SmartShop POS — Testing & Security Report

**Date:** 6 Nov 2026  
**Environment:** Local Docker stack (`backend` :8000, `frontend` :3000, Postgres :5433)  
**Scope:** Authorized project workspace only (no external production systems)

---

## 1. Tests performed and results

| Area | What ran | Result |
|------|----------|--------|
| Backend unit + integration | `python manage.py test` (full suite) | **111 passed, 0 failed** |
| Concurrency / transactions | `sales.tests.ConcurrencyTests` (parallel sales, idempotent UUID, shift close race) | **Pass** (setup clash with other TransactionTestCases fixed) |
| Notifications | Stock/expiry dedupe, restock clear, SSE content-type | **Pass** |
| Purchases | GRN post/void, purchase returns, ledger | **Pass** |
| Auth / permissions / CSRF | `auth.tests` including PIN switch escalation controls | **Pass** |
| Returns | Invoice + walk-in; inflated client price rejected | **Pass** |
| Frontend typecheck | `tsc -b` | **Pass** |
| Frontend lint | `eslint .` | **0 errors, 1 warning** (`useKeyboard` deps — pre-existing) |
| API probes (anon / SQLi-ish / XSS login / products) | Custom probe script against live API | **11/11 Pass** |
| Browser E2E | Login session → POS add item → Exact cash → Take → cart clear; Inventory 800 products; Sales list + walk-in button; POS at 390×844 | **Pass** |
| Dependency audit (Python) | `pip-audit -r requirements.txt` (in backend container) | **No known vulnerabilities** |
| Dependency audit (npm) | `npm audit --omit=dev` | **0 vulnerabilities** |
| Prod compose syntax | `docker compose -f docker-compose.prod.yml config` | **Valid** |

---

## 2. Test coverage

Measured with `coverage run … manage.py test` then `coverage report`:

| Metric | Value |
|--------|-------|
| **Overall line coverage** | **86%** (4324 statements, 586 missed) |
| Strong areas | `sales/services.py` ~95%, `sales/tests.py` 100%, auth/purchases/notifications core paths high |
| Weaker areas | `asgi.py`/`wsgi.py` 0% (expected), some admin/views edge branches, `settings` HTTPS-only blocks |

Coverage is statement coverage from the Django test run, not mutation or UI coverage.

---

## 3–5. Security findings, severity, and fixes

### Findings from security review + live probes

| Severity | Finding | Status |
|----------|---------|--------|
| **High** | Walk-in returns trusted client `unit_price` (cash drain / inflated refund) | **Fixed** — server always uses catalog `sale_price()` |
| **High** | PIN switch could escalate any authenticated user to owner/manager via weak PIN | **Fixed** — block owner/superuser via PIN; require `pos.sell`; block higher-role escalation; duplicate PIN rejected on save |
| **Medium** | Purchase returns: arbitrary rate/qty, negative stock, always credited supplier | **Fixed** — on-hand stock check; rate capped vs price/cost; ledger only for credit GRN/supplier |
| **Medium** | Purchase returns not branch-scoped | **Accepted limitation** — single-branch install (`default_branch`); multi-branch Phase 5 |
| **Medium** | `restore.sh` drops schema and loads arbitrary SQL | **Hardened** — refuse non-`.sql`; documented trust boundary (still ops-only) |
| **Low** | SSE stream slots reduced to 3/worker (DoS of streams easier) | **Accepted tradeoff** — protects request threads; clients reconnect |
| **Low** | Return numbers `count()+1` race; PIN first-hash-wins | **Mitigated partially** (unique PIN validation); numbering race unchanged (unique constraint → safe fail) |

### AuthN / AuthZ / CSRF / injection (verified)

- Anonymous access to business APIs → **403**
- Session + CSRF middleware present; CSRF enforced on unsafe methods in tests
- Login rejects SQLi-shaped / XSS-shaped emails without 500
- Product `?q=` probe did not 500
- Sensitive fields: passwords/PINs write-only / hashed; cost hidden without `products.view_cost`
- Prod settings: refuse weak `DJANGO_SECRET_KEY` when `DEBUG=False`; HSTS / secure cookies when not DEBUG

### Residual security notes (not Critical/High)

- PIN space is still 4–6 digits (throttled); physical till assumption
- Walk-in returns still allow refunds without invoice proof (by design) but price is server-controlled
- No automated pentest suite (OWASP ZAP / Burp) was run — limited to code review + targeted probes
- Real Windows installer / shop HTTPS termination not exercised in this environment

---

## 6. Performance and load

Not a full stress farm (no Locust/k6 cluster). Measured on the local Docker API:

| Endpoint | Samples | Avg | P95 / Max |
|----------|---------|-----|-----------|
| `GET /api/inventory/products/` (800 products) | 20 | **0.74 s** | P95 **0.81 s** / max **0.93 s** |
| `GET /api/sales/dashboard/` | 10 | **0.13 s** | max **0.17 s** |

Concurrency tests: 20 parallel sales kept stock/invoices consistent; duplicate `client_uuid` posts once.

**Observation:** Full unpaginated product list ~0.7–0.9 s is acceptable for demo/small shops; for larger catalogues, pagination or search-only POS load is recommended before multi-thousand SKU shops.

---

## 7. Remaining issues and limitations

1. **Not built / not delivery-blocking for a single-shop barcode POS, but incomplete product claims:** real Raast rails, OCR invoices, NLP Q&A, sales forecasting, licensing/activation, multi-branch UI.
2. **Windows installer:** `desktop/` electron-builder config exists; **not built/tested on Windows** in this environment.
3. **Shop-LAN offline PWA** needs HTTPS (or desktop app); localhost works.
4. **Off-site backup restore:** script present (`infra/scripts/backup.sh`, `restore.sh`); live NAS restore not run here.
5. **Purchase-return product dropdown** capped at 200 in UI (typeahead deferred).
6. **ESLint** `useKeyboard` exhaustive-deps warning remains (non-blocking).
7. **No ZAP/Burp** full scan; dependency audits are snapshot-in-time.

---

## 8. Production-readiness assessment

| Criterion | Verdict |
|-----------|---------|
| Major POS workflows (catalog, cash sale, inventory list, sales history) | **Ready** — verified automated + browser |
| Critical/High security issues from this audit | **Resolved** |
| Auth / permissions | **Ready** (CSRF, role gates, PIN hardening) |
| Sales / inventory / refunds consistency | **Ready** (tests + concurrency) |
| Responsive / mobile POS shell | **Smoke OK** at 390×844 |
| Deployment config | **Prod compose validates**; requires real secrets, `DJANGO_DEBUG=False`, HTTPS reverse proxy, backup destination |

**Overall:** Suitable for **customer delivery of the single-shop SmartShop POS** as implemented, provided the manual production checklist below is completed on the client machine. Do **not** market unfinished modules (Raast settlement, OCR, AI Q&A, forecasting, licensing) as live.

---

## 9. Manual steps / approvals still required

1. Set production `.env`: strong `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False`, correct `DJANGO_ALLOWED_HOSTS` / `CORS_ALLOWED_ORIGINS`, Postgres passwords.
2. Terminate TLS (nginx/Caddy) in front of the stack; point shop devices at HTTPS.
3. Configure `BACKUP_OFFSITE_DIR` or `BACKUP_OFFSITE_CMD`; run one backup + restore drill on client hardware.
4. Build Windows installer on a Windows host (`desktop` → `npm run dist:win`) if the customer needs it.
5. Seed/reset shop admin password (demo password was reset during earlier browser work).
6. Hardware: barcode scanner + receipt printer on the target till (not verified here).
7. Any **model/schema** changes beyond what is already migrated need your explicit approval (per project rule); none pending from this audit.

---

## Changes made during this audit

- Walk-in return: ignore client `unit_price`
- PIN switch: no owner escalation; role rank gate; unique PIN validation
- Purchase return: stock check, rate cap, credit-only ledger
- Concurrency tests: stable without `serialized_rollback` contenttype clash
- `restore.sh`: refuse non-SQL + trust warning
- Regression tests for inflated refund and PIN escalation

---

## Sign-off

| Item | Evidence |
|------|----------|
| Full backend suite | 111 OK |
| Coverage | 86% |
| Frontend `tsc` + lint | Clean / 1 warning |
| Dep audits | Clean |
| E2E cash sale | Observed cart clear after Take |
| High vulns | Fixed & retested |

**Incomplete by environment limits:** Windows build, shop HTTPS cutover, hardware printers/scanners, full load-generator stress, commercial pentest tools.
