/*
  Warnings:

  - You are about to drop the column `changePercent` on the `tickers` table. All the data in the column will be lost.
  - Added the required column `adj_close` to the `historical_prices` table without a default value. This is not possible if the table is not empty.
  - Added the required column `change_percent` to the `tickers` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "historical_prices" ADD COLUMN     "adj_close" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "tickers" DROP COLUMN "changePercent",
ADD COLUMN     "avg_volume" DOUBLE PRECISION,
ADD COLUMN     "book_value" DOUBLE PRECISION,
ADD COLUMN     "change_percent" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "dividend_rate" DOUBLE PRECISION,
ADD COLUMN     "enterprise_value" DOUBLE PRECISION,
ADD COLUMN     "eps" DOUBLE PRECISION,
ADD COLUMN     "fifty_two_week_high" DOUBLE PRECISION,
ADD COLUMN     "fifty_two_week_low" DOUBLE PRECISION,
ADD COLUMN     "forward_pe" DOUBLE PRECISION,
ADD COLUMN     "peg_ratio" DOUBLE PRECISION,
ADD COLUMN     "trailing_pe" DOUBLE PRECISION;
