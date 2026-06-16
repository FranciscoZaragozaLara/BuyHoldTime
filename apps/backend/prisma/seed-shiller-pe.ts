import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as xlsx from 'xlsx';

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log('Connecting to database...');
  await prisma.$connect();

  // 1. Read Schiller Excel file
  const xlsPath = '/Users/zilphfanel/Documents/AgyApps/BestTimeToInvest/source/SchillePERatio.xls';
  const wb = xlsx.readFile(xlsPath);
  const ws = wb.Sheets['Data'];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1 }) as any[][];
  
  console.log('Total spreadsheet rows:', rows.length);
  
  // Find or create 'schiller_pe' indicator
  let schillerInd = await prisma.indicator.findUnique({
    where: { key: 'schiller_pe' }
  });

  if (!schillerInd) {
    console.log('Creating schiller_pe indicator...');
    schillerInd = await prisma.indicator.create({
      data: {
        key: 'schiller_pe',
        name: 'Shiller PE Ratio (CAPE)',
        currentValue: 0,
        unit: 'x',
        status: 'Normal',
        description: 'Relación Precio-Ganancia ajustada cíclicamente, basada en ganancias promedio de los últimos 10 años ajustadas por inflación.'
      }
    });
  }

  // Find or create 'sp500_price' indicator
  let sp500PriceInd = await prisma.indicator.findUnique({
    where: { key: 'sp500_price' }
  });

  if (!sp500PriceInd) {
    console.log('Creating sp500_price indicator...');
    sp500PriceInd = await prisma.indicator.create({
      data: {
        key: 'sp500_price',
        name: 'S&P 500 Price',
        currentValue: 0,
        unit: '',
        status: 'Normal',
        description: 'Valor del índice S&P 500 (precio de cierre mensual).'
      }
    });
  }

  // Parse entries from row index 8 to the end
  const historyEntries: Array<{ indicatorId: string; date: Date; value: number }> = [];
  const sp500HistoryEntries: Array<{ indicatorId: string; date: Date; value: number }> = [];
  let latestVal = 0;
  let latestDate: Date | null = null;
  let latestPriceVal = 0;
  let latestPriceDate: Date | null = null;

  for (let i = 8; i < rows.length; i++) {
    const r = rows[i];
    if (r && r.length > 0 && typeof r[0] === 'number') {
      const shillerDateVal = r[0]; // e.g. 2026.06 or 1871.01
      const capeVal = r[12]; // index 12 is CAPE ratio (Shiller PE)
      const priceVal = r[1]; // index 1 is S&P price
      
      // Convert shiller numeric date to standard YYYY-MM-DD month-end date
      const dateStr = String(shillerDateVal.toFixed(2));
      const [yearStr, monthStr] = dateStr.split('.');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      
      if (month >= 1 && month <= 12) {
        const lastDay = new Date(year, month, 0).getDate();
        const fullDate = new Date(Date.UTC(year, month - 1, lastDay));

        if (capeVal !== undefined && capeVal !== null && capeVal !== 'NA' && capeVal !== 'N/A') {
          const capeNumber = typeof capeVal === 'string' ? parseFloat(capeVal) : Number(capeVal);
          if (!isNaN(capeNumber)) {
            historyEntries.push({
              indicatorId: schillerInd.id,
              date: fullDate,
              value: parseFloat(capeNumber.toFixed(4))
            });

            if (!latestDate || fullDate > latestDate) {
              latestDate = fullDate;
              latestVal = capeNumber;
            }
          }
        }

        if (priceVal !== undefined && priceVal !== null && priceVal !== 'NA' && priceVal !== 'N/A') {
          const priceNumber = typeof priceVal === 'string' ? parseFloat(priceVal) : Number(priceVal);
          if (!isNaN(priceNumber)) {
            sp500HistoryEntries.push({
              indicatorId: sp500PriceInd.id,
              date: fullDate,
              value: parseFloat(priceNumber.toFixed(4))
            });

            if (!latestPriceDate || fullDate > latestPriceDate) {
              latestPriceDate = fullDate;
              latestPriceVal = priceNumber;
            }
          }
        }
      }
    }
  }

  console.log(`Parsed ${historyEntries.length} history entries for Shiller PE.`);
  console.log(`Parsed ${sp500HistoryEntries.length} history entries for S&P 500 Price.`);

  // Clear existing histories
  console.log('Clearing existing IndicatorHistory for schiller_pe and sp500_price...');
  await prisma.indicatorHistory.deleteMany({
    where: { 
      indicatorId: { in: [schillerInd.id, sp500PriceInd.id] } 
    }
  });

  // Bulk insert using prisma createMany in chunks
  console.log('Inserting historical entries in database...');
  const chunkSize = 200;
  for (let k = 0; k < historyEntries.length; k += chunkSize) {
    const chunk = historyEntries.slice(k, k + chunkSize);
    await prisma.indicatorHistory.createMany({
      data: chunk as any
    });
  }

  for (let k = 0; k < sp500HistoryEntries.length; k += chunkSize) {
    const chunk = sp500HistoryEntries.slice(k, k + chunkSize);
    await prisma.indicatorHistory.createMany({
      data: chunk as any
    });
  }

  // Update current values
  console.log(`Updating current Shiller PE indicator value to ${latestVal.toFixed(2)} (${latestDate?.toISOString().split('T')[0]})`);
  let status = 'Normal';
  if (latestVal > 30) status = 'High';
  else if (latestVal < 15) status = 'Low';

  await prisma.indicator.update({
    where: { id: schillerInd.id },
    data: {
      currentValue: parseFloat(latestVal.toFixed(2)),
      status,
      updatedAt: new Date()
    }
  });

  console.log(`Updating current S&P 500 Price indicator value to ${latestPriceVal.toFixed(2)} (${latestPriceDate?.toISOString().split('T')[0]})`);
  await prisma.indicator.update({
    where: { id: sp500PriceInd.id },
    data: {
      currentValue: parseFloat(latestPriceVal.toFixed(2)),
      status: 'Normal',
      updatedAt: new Date()
    }
  });

  await prisma.$disconnect();
  await pool.end();
  console.log('Done seeding indicators.');
}

main().catch(console.error);
