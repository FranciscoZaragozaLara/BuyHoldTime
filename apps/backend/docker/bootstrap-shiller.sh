#!/bin/sh
# Genera /tmp/shiller_combined.csv y /tmp/shiller_daily.csv si faltan.
# El /tmp de un contenedor nuevo está vacío; los scripts de CAPE/termómetro los necesitan.
# Nunca falla el arranque: si no hay red, la sincronización posterior lo reintenta.
cd "${BACKTEST_DIR:-/opt/backtesting}" || exit 0
[ -s /tmp/shiller_daily.csv ] && exit 0
echo "[bootstrap-shiller] generando CSV de Shiller..."
python3 fetch-shiller-official.py || echo "[bootstrap-shiller] aviso: descarga oficial falló (se usa el Excel previo si existe)"
python3 build-shiller-combined.py \
  && python3 -c "from data_pipeline_schiller import build_shiller_daily; df=build_shiller_daily(); print('[bootstrap-shiller] diario', len(df), df['date'].iloc[-1])" \
  || echo "[bootstrap-shiller] aviso: no se pudieron generar los CSV"
exit 0
