import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('=== Calculating All-Time Highs (ATH) and Performance Metrics ===');
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  try {
    const allTickers = await prisma.ticker.findMany();
    const jsonPath = path.join(__dirname, '../../frontend/src/data/precalculated_performance.json');
    let currentJsonData: Record<string, any> = {};

    if (fs.existsSync(jsonPath)) {
      try {
        currentJsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      } catch (e) {
        console.warn('Could not read existing precalculated_performance.json:', e);
      }
    }

    const performanceMap: Record<string, any> = {};

    for (const ticker of allTickers) {
      const prices = await prisma.historicalPrice.findMany({
        where: { tickerId: ticker.id },
        orderBy: { date: 'asc' },
      });

      if (prices.length === 0) {
        console.warn(`No historical prices found for ${ticker.symbol}`);
        continue;
      }

      const latestPriceObj = prices[prices.length - 1];
      const latestPrice = latestPriceObj.close;
      const latestDate = new Date(latestPriceObj.date);

      // Find highest historical price and its date (considering both historical records & live ticker.price)
      let highestPrice = ticker.price || 0;
      let highestDateStr = new Date().toISOString().split('T')[0];

      for (const p of prices) {
        const val = p.high || p.close;
        if (val > highestPrice) {
          highestPrice = val;
          const d = new Date(p.date);
          highestDateStr = d.toISOString().split('T')[0];
        }
      }

      const effectivePrice = ticker.price || latestPriceObj.close;
      const fromHigh = highestPrice > 0 ? Math.min(0, ((effectivePrice - highestPrice) / highestPrice) * 100) : 0;

      // Also compute period performances (1M, YTD, 1Y, 5Y)
      const findPriceClosestTo = (targetDate: Date): number | null => {
        let closest = prices[0];
        let minDiff = Math.abs(new Date(prices[0].date).getTime() - targetDate.getTime());
        for (const p of prices) {
          const diff = Math.abs(new Date(p.date).getTime() - targetDate.getTime());
          if (diff < minDiff) {
            minDiff = diff;
            closest = p;
          }
        }
        if (minDiff > 30 * 24 * 60 * 60 * 1000) return null;
        return closest.close;
      };

      const date1M = new Date(latestDate);
      date1M.setMonth(date1M.getMonth() - 1);
      const dateYTD = new Date(latestDate.getFullYear(), 0, 1);
      const date1Y = new Date(latestDate);
      date1Y.setFullYear(date1Y.getFullYear() - 1);
      const date5Y = new Date(latestDate);
      date5Y.setFullYear(date5Y.getFullYear() - 5);

      const price1M = findPriceClosestTo(date1M);
      const priceYTD = findPriceClosestTo(dateYTD);
      const price1Y = findPriceClosestTo(date1Y);
      const price5Y = findPriceClosestTo(date5Y);

      const calcPerf = (cur: number, past: number | null) => {
        if (past === null || past === 0) return null;
        return ((cur - past) / past) * 100;
      };

      performanceMap[ticker.symbol] = {
        price: latestPrice,
        perf1M: calcPerf(latestPrice, price1M),
        perfYTD: calcPerf(latestPrice, priceYTD),
        perf1Y: calcPerf(latestPrice, price1Y),
        perf5Y: calcPerf(latestPrice, price5Y),
        highestPrice: parseFloat(highestPrice.toFixed(2)),
        highestDate: highestDateStr,
        fromHigh: parseFloat(fromHigh.toFixed(2)),
      };
    }

    const merged = { ...currentJsonData, ...performanceMap };
    fs.writeFileSync(jsonPath, JSON.stringify(merged, null, 2), 'utf-8');
    console.log(`Successfully updated performance JSON with ATH and fromHigh for ${Object.keys(performanceMap).length} tickers!`);
  } catch (err: any) {
    console.error('Error calculating ATH metrics:', err);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
