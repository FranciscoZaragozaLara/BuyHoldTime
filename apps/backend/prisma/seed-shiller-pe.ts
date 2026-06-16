import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as xlsx from 'xlsx';

// Configuration for indicators to extract
const INDICATOR_CONFIGS = [
  {
    key: 'schiller_pe',
    name: 'Shiller PE Ratio (CAPE)',
    unit: 'x',
    colIndex: 12,
    description: 'Relación Precio-Ganancia ajustada cíclicamente, basada en ganancias promedio de los últimos 10 años ajustadas por inflación.',
    scale: 1,
  },
  {
    key: 'sp500_price',
    name: 'S&P 500 Price',
    unit: '',
    colIndex: 1,
    description: 'Valor del índice S&P 500 (precio de cierre mensual).',
    scale: 1,
  },
  {
    key: 'sp500_dividend',
    name: 'S&P 500 Dividend',
    unit: '',
    colIndex: 2,
    description: 'Dividendo anual por acción del índice S&P 500.',
    scale: 1,
  },
  {
    key: 'sp500_earnings',
    name: 'S&P 500 Earnings',
    unit: '',
    colIndex: 3,
    description: 'Ganancias anuales (utilidad por acción) del índice S&P 500.',
    scale: 1,
  },
  {
    key: 'cpi',
    name: 'Consumer Price Index (CPI)',
    unit: '',
    colIndex: 4,
    description: 'Índice de Precios al Consumidor de EE. UU. (medida de inflación).',
    scale: 1,
  },
  {
    key: 'rate_gs10',
    name: '10-Year Treasury Yield (GS10)',
    unit: '%',
    colIndex: 6,
    description: 'Tasa de interés de los bonos del Tesoro de EE. UU. a 10 años.',
    scale: 1,
  },
  {
    key: 'excess_cape_yield',
    name: 'Excess CAPE Yield',
    unit: '%',
    colIndex: 16,
    description: 'Premio por riesgo del mercado accionario: rendimiento de ganancias derivado del CAPE menos la tasa del bono a 10 años.',
    scale: 100, // Convert decimal yield to percentage (e.g. 0.013 -> 1.3%)
  },
];

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
  
  // Create indicators if they don't exist and collect their database IDs
  const indicatorMap: Record<string, { id: string; key: string; scale: number }> = {};
  const indicatorIds: string[] = [];

  for (const conf of INDICATOR_CONFIGS) {
    let ind = await prisma.indicator.findUnique({
      where: { key: conf.key }
    });

    if (!ind) {
      console.log(`Creating ${conf.key} indicator...`);
      ind = await prisma.indicator.create({
        data: {
          key: conf.key,
          name: conf.name,
          currentValue: 0,
          unit: conf.unit,
          status: 'Normal',
          description: conf.description,
        }
      });
    }

    indicatorMap[conf.key] = { id: ind.id, key: conf.key, scale: conf.scale };
    indicatorIds.push(ind.id);
  }

  // Parse entries from row index 8 to the end
  const historyEntriesMap: Record<string, Array<{ indicatorId: string; date: Date; value: number }>> = {};
  const latestInfoMap: Record<string, { latestVal: number; latestDate: Date | null }> = {};

  for (const conf of INDICATOR_CONFIGS) {
    historyEntriesMap[conf.key] = [];
    latestInfoMap[conf.key] = { latestVal: 0, latestDate: null };
  }

  for (let i = 8; i < rows.length; i++) {
    const r = rows[i];
    if (r && r.length > 0 && typeof r[0] === 'number') {
      const shillerDateVal = r[0]; // e.g. 2026.06 or 1871.01
      
      // Convert shiller numeric date to standard YYYY-MM-DD month-end date
      const dateStr = String(shillerDateVal.toFixed(2));
      const [yearStr, monthStr] = dateStr.split('.');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      
      if (month >= 1 && month <= 12) {
        const lastDay = new Date(year, month, 0).getDate();
        const fullDate = new Date(Date.UTC(year, month - 1, lastDay));

        for (const conf of INDICATOR_CONFIGS) {
          const rawVal = r[conf.colIndex];
          if (rawVal !== undefined && rawVal !== null && rawVal !== 'NA' && rawVal !== 'N/A') {
            const numVal = typeof rawVal === 'string' ? parseFloat(rawVal) : Number(rawVal);
            if (!isNaN(numVal)) {
              const scaledVal = parseFloat((numVal * conf.scale).toFixed(4));
              historyEntriesMap[conf.key].push({
                indicatorId: indicatorMap[conf.key].id,
                date: fullDate,
                value: scaledVal,
              });

              const currentLatest = latestInfoMap[conf.key];
              if (!currentLatest.latestDate || fullDate > currentLatest.latestDate) {
                latestInfoMap[conf.key] = {
                  latestDate: fullDate,
                  latestVal: scaledVal,
                };
              }
            }
          }
        }
      }
    }
  }

  for (const conf of INDICATOR_CONFIGS) {
    console.log(`Parsed ${historyEntriesMap[conf.key].length} history entries for ${conf.key}.`);
  }

  // Clear existing histories for all our indicators
  console.log('Clearing existing IndicatorHistory for all macroeconomic indicators...');
  await prisma.indicatorHistory.deleteMany({
    where: { 
      indicatorId: { in: indicatorIds } 
    }
  });

  // Bulk insert history entries in chunks
  console.log('Inserting historical entries in database...');
  const chunkSize = 200;
  for (const conf of INDICATOR_CONFIGS) {
    const entries = historyEntriesMap[conf.key];
    console.log(`Seeding ${conf.key}...`);
    for (let k = 0; k < entries.length; k += chunkSize) {
      const chunk = entries.slice(k, k + chunkSize);
      await prisma.indicatorHistory.createMany({
        data: chunk as any
      });
    }
  }

  // Update current values and statuses
  for (const conf of INDICATOR_CONFIGS) {
    const info = latestInfoMap[conf.key];
    if (info.latestDate) {
      console.log(`Updating current ${conf.key} value to ${info.latestVal} (${info.latestDate.toISOString().split('T')[0]})`);
      
      let status = 'Normal';
      if (conf.key === 'schiller_pe') {
        if (info.latestVal > 30) status = 'High';
        else if (info.latestVal < 15) status = 'Low';
      }

      await prisma.indicator.update({
        where: { id: indicatorMap[conf.key].id },
        data: {
          currentValue: info.latestVal,
          status,
          updatedAt: new Date()
        }
      });
    }
  }

  await prisma.$disconnect();
  await pool.end();
  console.log('Done seeding all macroeconomic indicators.');
}

main().catch(console.error);
