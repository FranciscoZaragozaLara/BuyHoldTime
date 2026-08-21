-- AlterTable
ALTER TABLE "bt_trades" ADD COLUMN     "indicators" JSONB,
ADD COLUMN     "target_pct" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "bt_allocations" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "tqqq_pct" DOUBLE PRECISION NOT NULL,
    "cash_pct" DOUBLE PRECISION NOT NULL,
    "tqqq_value" DOUBLE PRECISION NOT NULL,
    "cash_value" DOUBLE PRECISION NOT NULL,
    "portfolio_value" DOUBLE PRECISION NOT NULL,
    "target_pct" DOUBLE PRECISION,
    "indicators" JSONB,

    CONSTRAINT "bt_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bt_allocations_run_id_date_idx" ON "bt_allocations"("run_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "bt_allocations_run_id_date_key" ON "bt_allocations"("run_id", "date");

-- AddForeignKey
ALTER TABLE "bt_allocations" ADD CONSTRAINT "bt_allocations_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "bt_backtest_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
