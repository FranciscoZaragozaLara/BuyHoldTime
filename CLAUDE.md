# BuyHoldTime / BestTimeToInvest — guía para Claude Code

Monorepo pnpm: `apps/backend` (NestJS 11 + Prisma 7, adapter-pg) y `apps/frontend` (Next 16, next-intl).
Plan y estado actual: **`docs/plan/HANDOFF.md`** (léelo antes de empezar una tarea).

## Reglas de trabajo
- Responder en español, conciso.
- **Una rama por cambio**, sin mezclar cambios no relacionados. Nombres `fix/…`, `feat/…`, `chore/…`.
- Probar cada cambio (tests, `tsc`, o correr el script) antes de commitear; decir qué no se pudo probar.
- Nunca escribir contraseñas ni secretos en código o commits; el usuario los gestiona en `.env*`.
- Al terminar una tarea del plan: marcarla en `docs/plan/HANDOFF.md` con rama y commit.
- Otra sesión (Claude en la app) lee este repo para planear y revisar, pero **no hace commits**: Claude Code es el único que escribe en git.

## Entorno de desarrollo (híbrido)
- Postgres en Docker: contenedor `buyholdtime-db`, puerto 5432 → **base única de desarrollo**.
- Backend nativo: `pnpm dev:backend` · Frontend nativo: `pnpm dev:frontend`.
- Scripts Python (backtests): venv nativo con **Python 3.11** (la imagen Docker usa 3.11 vía uv; `soupsieve==4.1` exige ≥3.11.5).
- Stack de producción (`docker-compose.prod.yml`, Traefik + DB propia) **solo para validar antes de deploy**:
  `dc() { docker compose --env-file .env.production -f docker-compose.prod.yml "$@"; }` (en zsh no usar `$DC`).
  Backend del compose: contenedor `buyholdtime-backend-1`, workdir `/repo/apps/backend`. Recompilar frontend: `dc up -d --build frontend`.
- No tener dos backends con crons activos a la vez: `TICKER_SYNC_CRON=off`, `EDGAR_SYNC_CRON=off` en el que no se use.

## Datos y crons
- Precios: `POST /tickers/sync` (x-api-key = `SYNC_API_KEY`); cron L-V 23:00 ET (`TickerSyncScheduler`).
- EDGAR trimestral: `apps/backend/prisma/sync-all-stocks-edgar.ts` (`SYMBOLS=AAPL,MSFT` opcional); cron domingo 03:00 ET.
  Reglas en `docs/eps-quarterly-calculation-rules.md`; helpers puros y testeados en `prisma/edgar-duration.ts`
  (conceptos por empresa: net income, EPS, ingresos; Q4 = anual − (Q1+Q2+Q3)).
- Otros crons (market-sync): L-V 22:05 ET `daily_update.py`, 22:35 ET breadth.
- `snapshots` y `stocks` los llena la app **GuruFocus Scrapper** (repo hermano, misma BD).
- `sector_terminal_pe` se llena con `prisma/seed-sector-terminal-pe.ts`.
- CAPE Shiller diario: tabla `bt_shiller_daily` (la sirve `/api/backtesting/shiller-daily`). `cape` = **CAPE registrado** (S&P 500 ÷ E10 del último mes publicado por Shiller ese día; historia: M−1 publicado el día 3 de M; en vivo: fecha observada al descargar, `BackTesting/data/shiller_publications.csv`), congelado en la BD para días cerrados desde `SHILLER_LIVE_SINCE`. `cape_adjusted` = ajustado, solo informativo. El termómetro lee `cape`/`mean3y` de la tabla. El CSV de BackTesting (`SHILLER_DATA_DIR`, por defecto `BackTesting/data/`; Docker `/data`) es solo intercambio: carga con `prisma/sync-shiller-daily.ts`.
- Columnas en snake_case en SQL (`historical_eps_quarterly`), camelCase solo en Prisma.

## Tests
- Backend: Jest + ts-jest (`apps/backend/src/__tests__` y `*.spec.ts`): `pnpm test:backend`.
- Frontend: Vitest para funciones puras de `src/lib` (`src/lib/*.test.ts`): `pnpm test:frontend`. Las funciones de cálculo van en `src/lib` para poder testearlas. Los e2e de Playwright están en `apps/frontend/tests/`.
