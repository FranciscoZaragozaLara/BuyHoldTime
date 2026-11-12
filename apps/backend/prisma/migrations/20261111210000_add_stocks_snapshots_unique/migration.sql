-- GuruFocus Scrapper hace upsert por stocks.ticker y por snapshots(stockId, scrapeDate).
-- La migración add_backtesting creó ambas tablas sin esos índices únicos, y el ON CONFLICT falla con 42P10.
-- Idempotente: bases que ya los tengan (creadas por el esquema de GuruFocus) no cambian.
CREATE UNIQUE INDEX IF NOT EXISTS "stocks_ticker_key" ON "stocks"("ticker");
CREATE UNIQUE INDEX IF NOT EXISTS "snapshots_stockId_scrapeDate_key" ON "snapshots"("stockId", "scrapeDate");
CREATE INDEX IF NOT EXISTS "snapshots_stockId_scrapeDate_idx" ON "snapshots"("stockId", "scrapeDate");
