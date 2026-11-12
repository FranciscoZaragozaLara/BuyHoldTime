#!/bin/sh
# Arranque del contenedor: genera los CSV de Shiller en SHILLER_DATA_DIR (/data, volumen
# persistente) si faltan y carga bt_shiller_daily (upsert idempotente, ~1 s), que es la
# fuente del endpoint shiller-daily. Después, el market-sync diario mantiene ambos.
# Nunca falla el arranque: si no hay red, la sincronización posterior lo reintenta.
DAILY="${SHILLER_CSV:-${SHILLER_DATA_DIR:-/data}/shiller_daily.csv}"
if [ ! -s "$DAILY" ]; then
  echo "[bootstrap-shiller] generando CSV de Shiller en $(dirname "$DAILY")..."
  (
    cd "${BACKTEST_DIR:-/opt/backtesting}" || exit 1
    python3 fetch-shiller-official.py || echo "[bootstrap-shiller] aviso: descarga oficial falló (se usa el Excel previo si existe)"
    python3 build-shiller-combined.py \
      && python3 -c "from data_pipeline_schiller import build_shiller_daily; df=build_shiller_daily(); print('[bootstrap-shiller] diario', len(df), df['date'].iloc[-1])"
  ) || echo "[bootstrap-shiller] aviso: no se pudieron generar los CSV"
fi
if [ -s "$DAILY" ]; then
  (cd /repo/apps/backend && npx ts-node prisma/sync-shiller-daily.ts) \
    || echo "[bootstrap-shiller] aviso: no se pudo cargar bt_shiller_daily"
fi
exit 0
