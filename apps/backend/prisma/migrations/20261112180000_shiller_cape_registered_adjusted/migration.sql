-- CAPE registrado (cape, congelado en vivo) y ajustado (informativo) + denominador usado.
ALTER TABLE "bt_shiller_daily" ADD COLUMN IF NOT EXISTS "cape_adjusted" DOUBLE PRECISION;
ALTER TABLE "bt_shiller_daily" ADD COLUMN IF NOT EXISTS "e10" DOUBLE PRECISION;
ALTER TABLE "bt_shiller_daily" ADD COLUMN IF NOT EXISTS "e10_month" DATE;
