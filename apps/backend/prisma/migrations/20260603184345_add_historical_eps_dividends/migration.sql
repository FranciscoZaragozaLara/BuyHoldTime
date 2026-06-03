-- AlterTable
ALTER TABLE "tickers" ADD COLUMN     "historical_dividends" JSONB,
ADD COLUMN     "historical_eps" JSONB;
