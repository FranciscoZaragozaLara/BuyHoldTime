# Handoff — estado y plan de acción (12 nov 2026)

Documento de visión, UX y plan SaaS (fuera del repo): https://claude.ai/artifact/4uZr5nBMqUkXHrUH9w6qng

## 1. Resumen de lo hecho

Todas las ramas pendientes forman **una cadena lineal**: `fix/eps-chart-ttm-current-year` contiene los 23 commits que `main` aún no tiene, así que integrarlas es un fast-forward de `main` a esa rama.

| Rama (orden de la cadena) | Qué hace |
| --- | --- |
| fix/protect-write-endpoints, fix/admin-email-cors, fix/backtest-no-cross-strategy-fallback, feat/next-backend-proxy, chore/docker-deploy, fix/nav-backtesting-link | Trabajo previo de seguridad, deploy y Traefik v3.6 |
| fix/docker-shiller-bootstrap (`e92ca2c`) | Imagen backend con CPython 3.11 vía uv; resultados del backtest equivalentes a los del Mac |
| fix/stocks-snapshots-unique-indexes (`1ad6a5c`) | Índices únicos `stocks.ticker` y `snapshots(stockId, scrapeDate)` (arregla error 42P10 del upsert de GuruFocus) |
| feat/daily-ticker-price-sync (`ccc5314`) | Cron L-V 23:00 ET de precios diarios |
| fix/edgar-q4-net-income (`388baee`, `3fd7094`) | Q4 de utilidad e ingresos derivado del hecho anual |
| feat/weekly-edgar-sync (`22539e1`) | Cron semanal EDGAR + `FMP_API_KEY` opcional en compose |
| fix/edgar-net-income-concepts (`c907f3e`) | Net income desde ProfitLoss / AvailableToCommon (AVGO, BKNG, MA) |
| fix/edgar-eps-concepts (`83304ce`) | EPS desde IncomeLossFromContinuingOperationsPer…Share cuando el concepto principal es viejo (MNST) |
| fix/edgar-revenue-concepts (`7d66b10`, `b375b5b`, `7ca218c`) | Ingresos trimestrales (estaban en 0), bancos (JPM) y ruta multiclase (V) |
| fix/eps-chart-ttm-current-year (`e582f80`) | Gráfico EPS: año en curso incompleto usa EPS TTM (AAPL 2026: 8.98, P/E 39.6x) |

Verificado por el usuario en el stack Docker local: AAPL, MNST, V, JPM con utilidad e ingresos correctos; ETFs sin ingresos (esperado).

GuruFocus Scrapper (repo hermano): rama `feat/unified-sync-job` (`ccc8d21`) con job unificado de sincronización (`SchedulerService.runSync`, cron 6 AM). La BD de desarrollo tiene 67 stocks y 67 snapshots; se copiaron a mano a la BD del compose.

## 2. Plan de acción

Marcar `[x]` con rama y commit al terminar.

### P0 — Limpiar e integrar (primero)
- [~] Limpiar restos de git en los 3 repos (BestTimeToInvest ✔, BackTesting ✔ ya limpio, **GuruFocus pendiente**: tiene `HEAD.lock`, `maintenance.lock` y 8 `tmp_obj_*`; limpiar a mano): `find .git -maxdepth 2 -name '*.lock' -delete; find .git/objects -name 'tmp_obj_*' -delete; rm -f .git/stale-*` (con ningún git corriendo).
- [x] Borrar la rama duplicada `feat/weekly-edgar-sync-v2` (era idéntica, `22539e1`).
- [x] `cd apps/backend && npx prisma validate` — válido.
- [x] Correr tests del backend en la punta de la cadena: 94/96. Fallan 2 de `etf-monthly-pe.spec.ts` (QQQ, TQQQ): la serie mensual de P/E en la BD tiene ~136 días (límite 95). Es frescura de datos, no código; también falla en el `main` anterior.
- [x] Fast-forward de `main` a `fix/eps-chart-ttm-current-year` (`e582f80`). Sin push.
- [ ] Actualizar la serie mensual de P/E de QQQ/TQQQ (multpl Nasdaq-100) y volver a correr `etf-monthly-pe.spec.ts`.

### P1 — Entorno de desarrollo híbrido
- [x] `DATABASE_URL` del backend y de GuruFocus apuntando a `buyholdtime-db` (ya lo estaban, `localhost:5432`). Migraciones: las 6 pendientes ya estaban aplicadas a mano → `migrate resolve --applied`; nueva migración idempotente `20261112000000_sync_schema_drift` (liq_bonus, bt_start_dates, índices de bt_backtest_runs que no tenían migración; sin ella una BD nueva en la VPS no llegaba al schema) — rama `fix/prisma-liq-bonus-migration` (`6354042`). Verificado en BD vacía (sin drift) y en copia de desarrollo. **No usar `migrate dev`**: la BD tiene tablas de respaldo manuales (`bt_*_bak20261102`, `bt_*_pre2027`) y propondría reset/drop.
- [x] `buyholdtime-db` recreado publicando solo en `127.0.0.1:5432` (`docker compose up -d --no-deps --force-recreate database`); `.env` en la raíz con `POSTGRES_PASSWORD` (= la de `DATABASE_URL` del backend) y `PGADMIN_PASSWORD`. Mismo volumen `besttimetoinvest_postgres_data`: 67 tickers (63 con EPS), 134 snapshots, precios al 11 nov, 13 migraciones al día. El volumen `buyholdtime_postgres_data` es la BD del stack de producción local (no borrar mientras se use `dc`).
- [ ] Correr `prisma/seed-sector-terminal-pe.ts` en la BD de desarrollo.
- [ ] Rerun EDGAR completo en desarrollo y revisar tickers con ingresos 0 (solo deberían ser ETFs).

### P2 — Datos y producto inmediato
- [x] `next dev` con Turbopack en Next 16.2.7 creaba ~40 workers PostCSS por segundo (1,290 procesos node, Mac congelada; JetsamEvent 12 nov 09:51). Next → 16.4.6 (y `eslint-config-next`): máximo 3 procesos en 150 s y con HMR de CSS; `tsc` y `next build` OK — rama `chore/next-16-4`. Respaldo si reaparece: `next dev --webpack` (rama `fix/next-dev-process-storm`, sin integrar). Docker Desktop bajado a 3 GB; solo corre `buyholdtime-db`.
- [ ] ESLint del frontend: 685 errores previos (606 `no-explicit-any`, resto reglas `react-hooks`); `next build` no corre lint.
- [ ] Página de ETF: ocultar tablas de ingresos/EPS o mostrar "No aplica para ETFs".
- [ ] Vitest en frontend para funciones de `src/lib` (empezar por `solarYearEps`).
- [ ] Decidir FMP: si no hay clave, el cron EDGAR funciona solo con SEC.

### P3 — GuruFocus Scrapper
- [ ] Decidir arquitectura: A) Mac como worker con túnel y rol Postgres limitado, o B) todo en VPS con browserless (riesgo de bloqueo por IP).
- [ ] Endpoint `sync-from-tickers` debe llamar a `SchedulerService.runSync()`; retirar `scripts/sync-tickers.mjs`, `scrape-empty.mjs`, `scrape-missing.mjs`.
- [ ] Seguridad: puertos a 127.0.0.1, contraseña de BD fuera del compose, fijar versión de browserless, auth en endpoints.
- [ ] Que el schema de GuruFocus deje de declarar tablas de BuyHoldTime; limpiar `.dockerignore`.
- [ ] El usuario tiene cambios propios sin commitear en GuruFocus: no tocarlos sin preguntar.

### P4 — Antes del deploy a la VPS
- [ ] Rotar la contraseña local de Postgres y revisar la contraseña por defecto en `prisma/seed-*.ts`.
- [ ] Quitar ruta fija en `remind-yardeni-weekly.sh`; migrar middleware → proxy de Next; eliminar lockfile duplicado.
- [ ] En la VPS: certificados Let's Encrypt reales y permisos de escritura de BackTesting.
- [ ] Re-correr las 6 estrategias de BackTesting afectadas por el lag de CPI.

### P5 — Fase 1 del plan SaaS (ver documento)
- [ ] Aviso legal visible junto a señales (termómetro, medidor Buy/Hold) + página de términos.
- [ ] Mover controles de admin (Run & Seed, sync de mercado, códigos internos de estrategia) a `/admin` con rol.
- [ ] Textos a next-intl (hoy mezcla español/inglés: "Buy/Hold Index Score", "out of 100", "Key Metrics").
- [ ] Tokens de diseño: verde favorable, ámbar precaución, rojo riesgo; un solo acento.
- [ ] Monitor de frescura por fuente (EDGAR, GuruFocus, FRED, precios) con aviso al admin.
- [ ] Dividir `IndicatorsPanel.tsx` (2,073 líneas), `RegimesPanel.tsx` (1,510) y `EpsHistoryChart.tsx` (984).

## 3. Decisiones abiertas
- Arquitectura GuruFocus (A/B).
- Precio de Pro: probar 39 vs 69 USD/año en beta.
- Revisión legal de señales en México y EE.UU.
- Nombre comercial único: BuyHoldTime o BestTimeToInvest.
