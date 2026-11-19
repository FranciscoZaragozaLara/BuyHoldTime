-- Régimen tendencial del S&P 500 en el termómetro diario: cierre contra SMA 50 y SMA 200.
-- trend_regime: UPTREND (arriba de ambas) · PULLBACK (abajo de la 50, arriba de la 200) ·
-- REBOUND (arriba de la 50, abajo de la 200) · DOWNTREND (abajo de ambas). Lo llena prisma/compute-thermo-history.ts.
ALTER TABLE "bt_thermo_history" ADD COLUMN IF NOT EXISTS "trend_regime" TEXT;
ALTER TABLE "bt_thermo_history" ADD COLUMN IF NOT EXISTS "spx_sma50" DOUBLE PRECISION;
ALTER TABLE "bt_thermo_history" ADD COLUMN IF NOT EXISTS "spx_sma200" DOUBLE PRECISION;
