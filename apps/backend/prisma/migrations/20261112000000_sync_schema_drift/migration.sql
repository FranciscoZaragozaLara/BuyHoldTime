-- Objetos que existían en schema.prisma y en las BD (creados a mano o con db push)
-- pero no en ninguna migración. Idempotente: no-op en BD que ya los tienen,
-- y los crea en BD nuevas (VPS) para que `migrate deploy` llegue al schema.

-- bt_thermo_history: bonus de liquidez
ALTER TABLE "bt_thermo_history" ADD COLUMN IF NOT EXISTS "liq_bonus" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "bt_thermo_history" ADD COLUMN IF NOT EXISTS "liq_bonus_label" TEXT;

-- @updatedAt no lleva default en BD
ALTER TABLE "bt_bht_forward" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "bt_thermo_history" ALTER COLUMN "updated_at" DROP DEFAULT;

-- bt_start_dates
CREATE TABLE IF NOT EXISTS "bt_start_dates" (
    "id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "descriptor" TEXT,
    "category" TEXT,
    "is_trading_day" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bt_start_dates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "bt_start_dates_start_date_key" ON "bt_start_dates"("start_date");

-- bt_backtest_runs
CREATE INDEX IF NOT EXISTS "bt_backtest_runs_strategy_id_start_date_idx" ON "bt_backtest_runs"("strategy_id", "start_date");
CREATE UNIQUE INDEX IF NOT EXISTS "bt_backtest_runs_strategy_id_start_date_key" ON "bt_backtest_runs"("strategy_id", "start_date");
