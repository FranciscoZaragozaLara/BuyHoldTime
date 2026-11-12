-- CAPE Shiller diario en BD (antes solo en /tmp/shiller_daily.csv, que se borra al reiniciar).
CREATE TABLE IF NOT EXISTS "bt_shiller_daily" (
    "date" DATE NOT NULL,
    "pe" DOUBLE PRECISION,
    "cape" DOUBLE PRECISION,
    "cape_sma3" DOUBLE PRECISION,
    "cape_sma5" DOUBLE PRECISION,
    "cape_sma10" DOUBLE PRECISION,
    "cape_ema3" DOUBLE PRECISION,
    "cape_ema5" DOUBLE PRECISION,
    "cape_ema10" DOUBLE PRECISION,
    "mean3y" DOUBLE PRECISION,
    "mean5y" DOUBLE PRECISION,
    "mean10y" DOUBLE PRECISION,
    "mean3y_ema" DOUBLE PRECISION,
    "mean5y_ema" DOUBLE PRECISION,
    "mean10y_ema" DOUBLE PRECISION,
    "std3y" DOUBLE PRECISION,
    "std5y" DOUBLE PRECISION,
    "std10y" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bt_shiller_daily_pkey" PRIMARY KEY ("date")
);
