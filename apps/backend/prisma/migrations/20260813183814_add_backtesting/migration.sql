-- CreateEnum
CREATE TYPE "Role" AS ENUM ('FREE_USER', 'PRO_USER', 'ADMIN');

-- AlterTable
ALTER TABLE "tickers" ADD COLUMN     "sector_terminal_pe" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "stocks" (
    "id" SERIAL NOT NULL,
    "ticker" TEXT NOT NULL,
    "companyName" TEXT,
    "exchange" TEXT,
    "isActive" BOOLEAN NOT NULL,
    "revenue" DECIMAL,
    "eps" DECIMAL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snapshots" (
    "id" SERIAL NOT NULL,
    "stockId" INTEGER NOT NULL,
    "scrapeDate" DATE NOT NULL,
    "price" DECIMAL,
    "gfValue" DECIMAL,
    "gfScore" INTEGER,
    "pe" DECIMAL,
    "pb" DECIMAL,
    "recommendation" TEXT,
    "scores" JSONB,
    "tables" JSONB,
    "analystEstimates" JSONB,
    "todayChart" JSONB,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "dividendYield" DECIMAL,
    "earningsYield" DECIMAL,
    "evToEbitda" DECIMAL,
    "forwardPe" DECIMAL,
    "pegRatio" DECIMAL,
    "psRatio" DECIMAL,
    "shillerPe" DECIMAL,

    CONSTRAINT "snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "firebase_uid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'FREE_USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "margin_debt" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "debit_balances" DOUBLE PRECISION NOT NULL,
    "free_credit_cash" DOUBLE PRECISION NOT NULL,
    "free_credit_margin" DOUBLE PRECISION NOT NULL,
    "net_credit_balance" DOUBLE PRECISION NOT NULL,
    "sp500_price" DOUBLE PRECISION,
    "currency_in_circulation" DOUBLE PRECISION,
    "margin_currency_ratio" DOUBLE PRECISION,
    "margin_debt_ratio" DOUBLE PRECISION,
    "margin_debt_yoy" DOUBLE PRECISION,
    "sp500_yoy" DOUBLE PRECISION,
    "divergence" DOUBLE PRECISION,
    "risk_score" INTEGER,
    "risk_level" TEXT,
    "source" TEXT NOT NULL DEFAULT 'FINRA',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "margin_debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bt_market_data" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "adj_close" DOUBLE PRECISION NOT NULL,
    "volume" BIGINT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'yfinance',
    "is_validated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bt_market_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bt_strategies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "params_schema" JSONB,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bt_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bt_backtest_runs" (
    "id" TEXT NOT NULL,
    "strategy_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "initial_cash" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "params_used" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bt_backtest_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bt_backtest_metrics" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "final_value" DOUBLE PRECISION NOT NULL,
    "total_return" DOUBLE PRECISION NOT NULL,
    "cagr" DOUBLE PRECISION NOT NULL,
    "sharpe" DOUBLE PRECISION,
    "max_drawdown" DOUBLE PRECISION NOT NULL,
    "max_dd_length" INTEGER,
    "num_trades" INTEGER,
    "win_rate" DOUBLE PRECISION,
    "sqn" DOUBLE PRECISION,
    "benchmark_cagr_qqq" DOUBLE PRECISION,
    "benchmark_cagr_tqqq" DOUBLE PRECISION,

    CONSTRAINT "bt_backtest_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bt_equity_curve" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "portfolio_value" DOUBLE PRECISION NOT NULL,
    "drawdown" DOUBLE PRECISION,

    CONSTRAINT "bt_equity_curve_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bt_trades" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION,
    "datetime" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bt_trades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "margin_debt_date_key" ON "margin_debt"("date");

-- CreateIndex
CREATE INDEX "bt_market_data_ticker_date_idx" ON "bt_market_data"("ticker", "date");

-- CreateIndex
CREATE UNIQUE INDEX "bt_market_data_ticker_date_key" ON "bt_market_data"("ticker", "date");

-- CreateIndex
CREATE UNIQUE INDEX "bt_strategies_code_key" ON "bt_strategies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bt_backtest_metrics_run_id_key" ON "bt_backtest_metrics"("run_id");

-- CreateIndex
CREATE INDEX "bt_equity_curve_run_id_date_idx" ON "bt_equity_curve"("run_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "bt_equity_curve_run_id_date_key" ON "bt_equity_curve"("run_id", "date");

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bt_backtest_runs" ADD CONSTRAINT "bt_backtest_runs_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "bt_strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bt_backtest_metrics" ADD CONSTRAINT "bt_backtest_metrics_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "bt_backtest_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bt_equity_curve" ADD CONSTRAINT "bt_equity_curve_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "bt_backtest_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bt_trades" ADD CONSTRAINT "bt_trades_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "bt_backtest_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
