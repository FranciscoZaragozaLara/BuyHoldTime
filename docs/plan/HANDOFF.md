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
- [x] Restos de git limpios en los 3 repos (GuruFocus Scrapper: `HEAD.lock`, `maintenance.lock` y 8 `tmp_obj_*` del 11 nov borrados el 12 nov; `git fsck` sin errores; cambios sin commit del usuario intactos en `feat/unified-sync-job`).
- [x] Borrar la rama duplicada `feat/weekly-edgar-sync-v2` (era idéntica, `22539e1`).
- [x] `cd apps/backend && npx prisma validate` — válido.
- [x] Correr tests del backend en la punta de la cadena: 94/96. Fallan 2 de `etf-monthly-pe.spec.ts` (QQQ, TQQQ): la serie mensual de P/E en la BD tiene ~136 días (límite 95). Es frescura de datos, no código; también falla en el `main` anterior.
- [x] Fast-forward de `main` a `fix/eps-chart-ttm-current-year` (`e582f80`). Sin push.
- [x] Serie mensual de P/E de QQQ/TQQQ (GuruFocus Nasdaq 100 PE Ratio, no multpl): agregados jul–oct 2026 (27.39, 28.54, 29.06, 27.12; último valor diario de cada mes) a `source/nasdaq_100_pe.js`; la historia hasta jun queda como el snapshot del 16 jun (GuruFocus revisa su historia con cada trimestre). `seed-nasdaq-monthly.ts` sin ruta absoluta. Suite del backend 110/110 — rama `fix/qqq-monthly-pe`.
- [ ] Mantenimiento mensual de esa serie: GuruFocus bloquea scripts (403); hoy se lee a mano o desde Chrome. Automatizar con el GuruFocus Scrapper (P3) y, si se quiere punto en el tiempo, congelar cada mes como el CAPE.

### P1 — Entorno de desarrollo híbrido
- [x] `DATABASE_URL` del backend y de GuruFocus apuntando a `buyholdtime-db` (ya lo estaban, `localhost:5432`). Migraciones: las 6 pendientes ya estaban aplicadas a mano → `migrate resolve --applied`; nueva migración idempotente `20261112000000_sync_schema_drift` (liq_bonus, bt_start_dates, índices de bt_backtest_runs que no tenían migración; sin ella una BD nueva en la VPS no llegaba al schema) — rama `fix/prisma-liq-bonus-migration` (`6354042`). Verificado en BD vacía (sin drift) y en copia de desarrollo. **No usar `migrate dev`**: la BD tiene tablas de respaldo manuales (`bt_*_bak20261102`, `bt_*_pre2027`) y propondría reset/drop.
- [x] `buyholdtime-db` recreado publicando solo en `127.0.0.1:5432` (`docker compose up -d --no-deps --force-recreate database`); `.env` en la raíz con `POSTGRES_PASSWORD` (= la de `DATABASE_URL` del backend) y `PGADMIN_PASSWORD`. Mismo volumen `besttimetoinvest_postgres_data`: 67 tickers (63 con EPS), 134 snapshots, precios al 11 nov, 13 migraciones al día. El volumen `buyholdtime_postgres_data` es la BD del stack de producción local (no borrar mientras se use `dc`).
- [x] `seed-sector-terminal-pe.ts` corrido en desarrollo: 67/67 tickers con P/E terminal. El script ya **no cambia `sector`** (renombraba QQQ/TQQQ a "Index (Tech)" y el sync habría reemplazado su serie mensual); alias "Financial" — rama `fix/sector-terminal-pe-seed` (`479b15b`).
- [x] EDGAR completo en desarrollo (12 nov): 52 tickers actualizados; con ingresos 0 en los últimos 4 trimestres pasaron de 58 a 6, todos fondos (IBB, NLR, SCHD, SMH, SOXL, SOXX). Sin trimestres por diseño: QQQ/TQQQ/SPY/VOO (serie mensual) y ARM/ASML/PDD/BRK.B (excluidos).

### P2 — Datos y producto inmediato
- [x] `next dev` con Turbopack en Next 16.2.7 creaba ~40 workers PostCSS por segundo (1,290 procesos node, Mac congelada; JetsamEvent 12 nov 09:51). Next → 16.4.6 (y `eslint-config-next`): máximo 3 procesos en 150 s y con HMR de CSS; `tsc` y `next build` OK — rama `chore/next-16-4`. Respaldo si reaparece: `next dev --webpack` (rama `fix/next-dev-process-storm`, sin integrar). Docker Desktop bajado a 3 GB; solo corre `buyholdtime-db`.
- [ ] ESLint del frontend: 685 errores previos (606 `no-explicit-any`, resto reglas `react-hooks`); `next build` no corre lint.
- [x] `GET /tickers` sin series históricas: 1.87 MB → 37 KB (nuevo `findAllSummary` con `omit`; `findAll` completo sigue para sync/fast-sync). Sin el aviso "over 2MB" de Next; home, precios, sitemap y detalle OK — rama `perf/tickers-list-summary`. HTML del detalle de un ticker: ~2.7 MB → ~1.8 MB (−32 %) quitando `id`/`tickerId` y recortando la fecha de los ~7,500 precios diarios (`lib/slimPrices.ts`, precisión completa: 0 diferencias visibles en AAPL, SCHD, QQQ, VOO, JPM, NVDA) — rama `perf/detail-page-slim-prices`. Siguiente paso posible: serie en columnas (≈ −50 % más) o cargar el histórico largo bajo demanda; toca StockChart, StockHistoryTable, QuarterlyDataTable y EpsHistoryChart.
- [x] Tabla "CAPE Shiller — SP500 / Nasdaq / TQQQ" vacía tras reiniciar la Mac: el endpoint leía `/tmp/shiller_daily.csv` (macOS borra `/tmp`). Ahora: tabla `bt_shiller_daily` (migración `20261112120000_add_bt_shiller_daily`, 9,619 filas, idéntica al CSV), `prisma/sync-shiller-daily.ts`, market-sync sincroniza la tabla tras `daily_update.py`/planchado y reconstruye el CSV desde la BD si falta; la tabla del frontend usa los días del SP500 si falta la serie CAPE — rama `feat/shiller-daily-db`.
- [x] CSV de Shiller fuera de `/tmp`: `SHILLER_DATA_DIR` (local `BackTesting/data/`, Docker `/data`), regla única en `BackTesting/shiller_paths.py` y `SHILLER_CSV_PATH` del backend; `bootstrap-shiller.sh` carga `bt_shiller_daily` al arrancar. `refresh-shiller-weekly.sh` (launchd, martes 08:00) ahora usa el venv 3.11, encuentra `npx` (nvm), toma `DATABASE_URL` del backend, sincroniza la tabla siempre y se arregló el SyntaxError del paso `indicators`. Probado con entorno de launchd y con `/tmp` vacío — ramas `fix/shiller-data-dir` (BestTimeToInvest y BackTesting).
- [ ] `compute-thermo-history.ts` / `compute-bht-forward.ts` y scripts de backtest: leer el CAPE de `bt_shiller_daily` en lugar del CSV.
- [x] `compute-thermo-history.ts` / `compute-bht-forward.ts` fallaban con "null value in column updated_at" en fechas nuevas: la migración `20261112000000_sync_schema_drift` quitó el DEFAULT de `updated_at` (`@updatedAt`) y los scripts no lo ponían. Ahora lo insertan explícito — rama `fix/thermo-scripts-updated-at`. Además, el cierre del 11 nov de ^GSPC/^IXIC/TQQQ era un precio intradía (15:46 ET) porque el cron de 22:05 ET no corrió (Mac dormida); `POST /api/market-sync/daily` lo corrigió. Si el backend no está prendido a las 22:05 ET, el último día queda intradía hasta el siguiente sync.
- [x] Bonus HY del termómetro: "armado" (complacencia, HY < P20 36M en 6M) pasa de +5 a **+2** (`HY_ARMED_BONUS`). Regla única en `thermo-history.getHyBonus`; el frontend ya no la reimplementa (su copia difería del backend en 29 % de los días desde 1999 por el percentil de "armado") y pide `GET /api/backtesting/hy-bonus?date=&hy=&hyDate=`. Histórico recalculado (thermo + BHT forward desde 1993) — rama `feat/hy-bonus-single-source`. Queda una fila suelta de sábado (2026-11-07) en `bt_thermo_history` sin recalcular.
- [x] BHT en vivo y bonus LIQ/Oil también desde el backend: `GET /api/backtesting/thermo-live` (`computeThermoLive` = `computeThermoDay` + datos en vivo de `getLivePrice`, caché 60 s). El frontend eliminó su cálculo del termómetro, `liqLiveBonus` y `oilLiveBonus`; reemplaza al endpoint `hy-bonus`. Borrada la fila suelta de sábado 2026-11-07 de `bt_thermo_history` — rama `feat/thermo-live-single-source`.
- [ ] Las cards de indicadores siguen calculando su propio puntaje 0–100 en el frontend (`capeRiskScore`, `cpiMScore`, …): copias de las bandas del backend; unificar con el rediseño.
- [x] CAPE sin lookahead: **registrado** (S&P 500 ÷ E10 del último mes publicado: historia día 3 de M; en vivo, fecha observada al descargar `ie_data.xls`, con copia fechada en `data/vintages/`) y **ajustado** informativo (E10 del propio mes). `bt_shiller_daily.cape` = registrado, congelado para días cerrados desde 2026-11-12; nueva columna "CAPE Ajust." en la tabla y el Excel. Termómetro y BHT forward recalculados desde 1993 leyendo la tabla (promedio 51.07 → 51.24; 12 nov 74 → 72.2) — ramas `feat/cape-point-in-time` (BackTesting) y `feat/cape-registered-adjusted`. `get_shiller_daily(start)` ya no trunca el CSV compartido.
- [ ] Backtests Schiller: al volver a correrlos usarán el CAPE registrado (resultados distintos a los guardados).
- [x] Página de ETF: sin columnas "EPS/P/E (Fiscal 10-K)" en el historial anual y la gráfica "Histórico de EPS, Precio y P/E" muestra "No aplica para ETFs e índices". La tabla trimestral ya tenía versión de fondos (dividendos). Una sola detección de fondo `src/lib/isFund.ts` (había 3 variantes) — rama `feat/etf-page-no-eps`. El "1 issue" de Next en esa página viene de la extensión React DevTools, no de la app.
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

### P6 — PugInvestor (marca casual, después de validar)
- [ ] Registrar puginvestor.com y buyholdtime.com (disponibles al 12 nov 2026; tarea del usuario).
- [ ] Al rediseñar el frontend (Fase 2), soportar **temas por dominio**: el middleware de Next lee el host y aplica tema, textos y funciones permitidas. Una sola app y un solo deploy; no clonar el código.
- [ ] Modo Pug: termómetro como estado de ánimo del Pug, 10–20 acciones/ETFs populares con barata/justa/cara, calculadora de ahorro mensual, lecciones. Sin TQQQ, apalancamiento ni tablas.
- [ ] Cuentas compartidas entre dominios para pasar de Pug a BuyHoldTime Pro sin crear otra cuenta.
- [ ] Validar primero con una landing y lista de espera; abrirlo solo si trae registros a menor costo que BuyHoldTime.

## 3. Decisiones abiertas
- Arquitectura GuruFocus (A/B).
- Precio de Pro: probar 39 vs 69 USD/año en beta.
- Revisión legal de señales en México y EE.UU.
- Nombre comercial: BuyHoldTime (buyholdtime.com) como marca principal; besttimetoinvest.com ya está registrado (¿es del usuario?).
- PugInvestor: ¿se lanza como puerta de entrada casual? Ver sección en el documento del plan.
