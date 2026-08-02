import 'dotenv/config';
import * as https from 'https';
import * as xlsx from 'xlsx';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const FINRA_EXCEL_URL = 'https://www.finra.org/sites/default/files/2021-03/margin-statistics.xlsx';
const FINRA_PAGE_URL = 'https://www.finra.org/investors/learn-to-invest/advanced-investing/margin-statistics';

interface RawMarginData {
  date: Date;
  debitBalances: number;
  freeCreditCash: number;
  freeCreditMargin: number;
}

function httpGetBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGetBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP Status ${res.statusCode}`));
      }
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function httpGetText(url: string): Promise<string> {
  return httpGetBuffer(url).then(b => b.toString('utf-8'));
}

function parseMonthYear(dateStr: string): Date | null {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  
  // Format: "2026-06", "Jun-26", "Jun-2026", etc.
  const yyyymmMatch = str.match(/^(\d{4})[\-\/](\d{1,2})$/);
  if (yyyymmMatch) {
    const year = parseInt(yyyymmMatch[1], 10);
    const month = parseInt(yyyymmMatch[2], 10);
    return new Date(Date.UTC(year, month, 0));
  }

  const monthNames: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  const parts = str.split(/[\s\-\/]+/);
  if (parts.length >= 2) {
    let monthIndex = -1;
    let year = -1;

    for (const part of parts) {
      const lower = part.toLowerCase();
      if (monthNames[lower] !== undefined) {
        monthIndex = monthNames[lower];
      } else if (!isNaN(Number(part))) {
        let num = Number(part);
        if (num < 100) {
          year = num > 50 ? 1900 + num : 2000 + num;
        } else {
          year = num;
        }
      }
    }

    if (monthIndex !== -1 && year !== -1) {
      return new Date(Date.UTC(year, monthIndex + 1, 0));
    }
  }

  return null;
}

async function fetchExcelData(): Promise<RawMarginData[]> {
  console.log('Descargando archivo Excel de FINRA:', FINRA_EXCEL_URL);
  try {
    const buffer = await httpGetBuffer(FINRA_EXCEL_URL);
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const results: RawMarginData[] = [];

    for (const row of rows) {
      if (!row || row.length < 2) continue;
      const dateCell = String(row[0] || '').trim();
      const debit = parseFloat(String(row[1]).replace(/,/g, ''));
      let cash = 0;
      let margin = 0;

      if (row.length >= 4 && row[3] !== undefined) {
        cash = parseFloat(String(row[2]).replace(/,/g, '')) || 0;
        margin = parseFloat(String(row[3]).replace(/,/g, '')) || 0;
      } else if (row.length >= 3 && row[2] !== undefined) {
        // Antes de Feb 2010, FINRA/NYSE combinaban cash y margin free credit en una sola columna
        cash = parseFloat(String(row[2]).replace(/,/g, '')) || 0;
        margin = 0;
      }

      if (isNaN(debit)) continue;

      const parsedDate = parseMonthYear(dateCell);
      if (parsedDate) {
        results.push({
          date: parsedDate,
          debitBalances: debit,
          freeCreditCash: cash,
          freeCreditMargin: margin
        });
      }
    }

    console.log(`Extraídos ${results.length} registros del Excel.`);
    return results;
  } catch (e: any) {
    console.warn(`Error al descargar Excel: ${e.message}`);
    return [];
  }
}

async function fetchPageTableData(): Promise<RawMarginData[]> {
  console.log('Scrapeando tabla HTML de FINRA:', FINRA_PAGE_URL);
  try {
    const html = await httpGetText(FINRA_PAGE_URL);
    const results: RawMarginData[] = [];

    const trRegex = /<tr>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>\s*<\/tr>/gi;
    let match: RegExpExecArray | null;

    while ((match = trRegex.exec(html)) !== null) {
      const dateText = match[1].trim();
      const debit = parseFloat(match[2].trim().replace(/,/g, ''));
      const cash = parseFloat(match[3].trim().replace(/,/g, ''));
      const margin = parseFloat(match[4].trim().replace(/,/g, ''));

      if (!isNaN(debit) && !isNaN(cash) && !isNaN(margin)) {
        const parsedDate = parseMonthYear(dateText);
        if (parsedDate) {
          results.push({
            date: parsedDate,
            debitBalances: debit,
            freeCreditCash: cash,
            freeCreditMargin: margin
          });
        }
      }
    }

    console.log(`Extraídos ${results.length} registros de la página HTML.`);
    return results;
  } catch (e: any) {
    console.warn(`Error al parsear HTML: ${e.message}`);
    return [];
  }
}

async function getSp500PriceMap(): Promise<Map<string, number>> {
  const spyTicker = await prisma.ticker.findUnique({
    where: { symbol: 'SPY' },
    select: { id: true }
  });

  const map = new Map<string, number>();

  if (!spyTicker) {
    console.warn('Ticker SPY no encontrado en la base de datos.');
    return map;
  }

  const prices = await prisma.historicalPrice.findMany({
    where: { tickerId: spyTicker.id },
    orderBy: { date: 'asc' }
  });

  for (const p of prices) {
    const dateStr = p.date.toISOString().substring(0, 7); // YYYY-MM
    map.set(dateStr, p.close);
  }

  console.log(`Cargados ${map.size} precios mensuales de SPY.`);
  return map;
}

async function getCurrencyInCirculationMap(): Promise<Map<string, number>> {
  console.log('Descargando Currency in Circulation (MBCURRCIR) de FRED...');
  const map = new Map<string, number>();
  try {
    const text = await httpGetText('https://fred.stlouisfed.org/graph/fredgraph.csv?id=MBCURRCIR');
    const lines = text.split('\n');
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length >= 2) {
        const dateStr = parts[0].trim(); // YYYY-MM-DD
        const val = parseFloat(parts[1].trim());
        if (dateStr.length >= 7 && !isNaN(val)) {
          const yearMonth = dateStr.substring(0, 7); // YYYY-MM
          map.set(yearMonth, val); // en Billones USD -> convertiremos a Millones en calculo si aplica o ratio directo
        }
      }
    }
  console.log(`Cargados ${map.size} registros mensuales de Currency in Circulation (FRED).`);
  } catch (e: any) {
    console.warn(`Error al descargar Currency in Circulation de FRED: ${e.message}`);
  }
  return map;
}

function calculateRiskMetrics(data: Array<RawMarginData & { sp500Price?: number; currencyInCirculation?: number }>) {
  data.sort((a, b) => a.date.getTime() - b.date.getTime());

  const allDebits = data.map(d => d.debitBalances).sort((a, b) => a - b);

  return data.map((item) => {
    const netCreditBalance = item.freeCreditCash + item.freeCreditMargin - item.debitBalances;
    
    const targetDateYoY = new Date(item.date);
    targetDateYoY.setUTCFullYear(targetDateYoY.getUTCFullYear() - 1);
    
    const prevYearItem = data.find(d => 
      d.date.getUTCFullYear() === targetDateYoY.getUTCFullYear() && 
      d.date.getUTCMonth() === targetDateYoY.getUTCMonth()
    );

    let marginDebtYoY: number | null = null;
    let sp500YoY: number | null = null;
    let divergence: number | null = null;

    if (prevYearItem) {
      marginDebtYoY = ((item.debitBalances - prevYearItem.debitBalances) / prevYearItem.debitBalances) * 100;
      if (item.sp500Price && prevYearItem.sp500Price) {
        sp500YoY = ((item.sp500Price - prevYearItem.sp500Price) / prevYearItem.sp500Price) * 100;
        divergence = marginDebtYoY - sp500YoY;
      }
    }

    // ── marginDebtRatio: % of SP500 total market cap ──────────────────────────
    // SP500_index ≈ SPY_price × 10
    // SP500_MarketCap_M ≈ SP500_index × market_cap_per_point_factor
    // Factor varies over time as the market grows (interpolated from known anchors)
    // Validated: Feb 2000 ≈2.9%, Jun 2007 ≈2.4%, Jan 2022 ≈2.6%, Jun 2026 ≈2.2%
    const MCAP_ANCHORS: [number, number][] = [
      [1997, 5000], [2000, 7097], [2003, 5500], [2007, 12876], [2009, 5500],
      [2013, 8000], [2016, 8500], [2019, 9000], [2020, 8000], [2021, 7872],
      [2022, 7100], [2023, 8000], [2024, 8500], [2025, 9000], [2026, 8994],
    ];
    const itemYear = item.date.getUTCFullYear() + (item.date.getUTCMonth()) / 12;
    let mcFactor = 8000;
    for (let ai = 0; ai < MCAP_ANCHORS.length - 1; ai++) {
      const [y1, f1] = MCAP_ANCHORS[ai];
      const [y2, f2] = MCAP_ANCHORS[ai + 1];
      if (itemYear >= y1 && itemYear <= y2) {
        mcFactor = f1 + (itemYear - y1) * (f2 - f1) / (y2 - y1);
        break;
      }
      if (itemYear > MCAP_ANCHORS[MCAP_ANCHORS.length - 1][0]) mcFactor = MCAP_ANCHORS[MCAP_ANCHORS.length - 1][1];
    }
    const sp500Index = item.sp500Price ? item.sp500Price * 10 : null;
    const sp500MarketCapM = sp500Index ? sp500Index * mcFactor : null;
    const marginDebtRatio = sp500MarketCapM
      ? Number(((item.debitBalances / sp500MarketCapM) * 100).toFixed(2))
      : null;

    // ── marginCurrencyRatio: % vs currency in circulation ────────────────────
    // item.currencyInCirculation is in Billions USD (FRED MBCURRCIR)
    // item.debitBalances is in Millions USD
    // Convert currency to Millions: val * 1000
    const currencyInMillions = item.currencyInCirculation ? item.currencyInCirculation * 1000 : null;
    const marginCurrencyRatio = (currencyInMillions && currencyInMillions > 0)
      ? Number(((item.debitBalances / currencyInMillions) * 100).toFixed(2))
      : null;

    // ── RISK SCORE v2 ─────────────────────────────────────────────────────────
    // Reference: docs/risk-score-margin-debt-v2.md
    
    // Helper: linear interpolation between anchor points (clamped 0–100)
    function interpScore(val: number, anchors: [number, number][]): number {
      if (val <= anchors[0][0]) return anchors[0][1];
      if (val >= anchors[anchors.length - 1][0]) return anchors[anchors.length - 1][1];
      for (let i = 0; i < anchors.length - 1; i++) {
        const [x1, y1] = anchors[i];
        const [x2, y2] = anchors[i + 1];
        if (val >= x1 && val <= x2) {
          return y1 + (val - x1) * (y2 - y1) / (x2 - x1);
        }
      }
      return 50;
    }

    // Component 1 (30%): Percentile of normalized debt ratio
    // Use marginDebtRatio (% of market cap) percentile if available, else use nominal debit percentile
    let comp1Score = 50;
    if (marginDebtRatio !== null) {
      // Build sorted array of all debt ratios for percentile calc
      // We use debitBalances percentile as proxy since ratios track proportionally
      const debitRank = allDebits.findIndex(d => d >= item.debitBalances);
      const debitPercentile = (debitRank / allDebits.length) * 100;
      comp1Score = Math.min(100, debitPercentile); // percentile IS the score (0–100)
    } else {
      const debitRank = allDebits.findIndex(d => d >= item.debitBalances);
      comp1Score = (debitRank / allDebits.length) * 100;
    }

    // Component 2 (25%): YoY Growth — interpolated, continuous
    let comp2Score = 50;
    if (marginDebtYoY !== null) {
      comp2Score = interpScore(marginDebtYoY, [
        [-20, 10],
        [0,   50],
        [20,  75],
        [40,  95],
        [60, 100],
      ]);
    }

    // Component 3 (20%): Divergence (Margin YoY - SP500 YoY) — interpolated
    let comp3Score = 40; // neutral default if no divergence data
    if (divergence !== null) {
      comp3Score = interpScore(divergence, [
        [-15, 15],
        [-10, 20],
        [0,   40],
        [10,  65],
        [25,  90],
        [35, 100],
      ]);
    }

    // Component 4 (15%): Net Credit Balance normalized by total debit
    let comp4Score = 20;
    if (netCreditBalance < 0) {
      const deficitRatio = (Math.abs(netCreditBalance) / item.debitBalances) * 100;
      comp4Score = interpScore(deficitRatio, [
        [0,  20],
        [20, 50],
        [40, 75],
        [70, 100],
      ]);
    }

    // Component 5 (10%): Approximate Fed Funds + margin spread
    const year = item.date.getUTCFullYear();
    const month = item.date.getUTCMonth() + 1;
    let approxFedRate = 3.0;
    if (year < 2004) approxFedRate = 5.5;
    else if (year >= 2004 && year < 2007) approxFedRate = 2.5 + (year - 2004) * 1.2;
    else if (year === 2007) approxFedRate = 5.0;
    else if (year === 2008) approxFedRate = Math.max(0.25, 3.0 - (month / 4));
    else if (year >= 2009 && year <= 2015) approxFedRate = 0.25;
    else if (year >= 2016 && year < 2019) approxFedRate = 1.0 + (year - 2016) * 0.75;
    else if (year === 2019) approxFedRate = 2.0;
    else if (year === 2020) approxFedRate = 0.25;
    else if (year === 2021) approxFedRate = 0.25;
    else if (year === 2022) approxFedRate = 0.25 + (month / 12) * 4.0;
    else if (year === 2023) approxFedRate = 4.5 + Math.min(1.0, month / 8);
    else if (year === 2024) approxFedRate = 5.25 - (month > 9 ? 0.75 : 0);
    else if (year === 2025) approxFedRate = 4.5;
    else approxFedRate = 4.25;
    const marginRate = approxFedRate + 1.75;
    const comp5Score = interpScore(marginRate, [
      [3,  20],
      [5,  50],
      [7,  75],
      [9, 100],
    ]);

    const riskScore = Math.round(
      (comp1Score * 0.30) +
      (comp2Score * 0.25) +
      (comp3Score * 0.20) +
      (comp4Score * 0.15) +
      (comp5Score * 0.10)
    );

    let riskLevel = 'LOW';
    if (riskScore >= 75) riskLevel = 'CRITICAL';
    else if (riskScore >= 60) riskLevel = 'HIGH';
    else if (riskScore >= 40) riskLevel = 'MODERATE';

    return {
      date: item.date,
      debitBalances: item.debitBalances,
      freeCreditCash: item.freeCreditCash,
      freeCreditMargin: item.freeCreditMargin,
      netCreditBalance,
      sp500Price: item.sp500Price || null,
      currencyInCirculation: currencyInMillions || null,
      marginCurrencyRatio,
      marginDebtRatio,
      marginDebtYoY: marginDebtYoY !== null ? Number(marginDebtYoY.toFixed(2)) : null,
      sp500YoY: sp500YoY !== null ? Number(sp500YoY.toFixed(2)) : null,
      divergence: divergence !== null ? Number(divergence.toFixed(2)) : null,
      riskScore: Math.min(100, Math.max(0, riskScore)),
      riskLevel,
      source: 'FINRA'
    };
  });
}


export async function seedMarginDebt() {
  console.log('Iniciando sincronización de Margin Debt de FINRA...');

  const excelData = await fetchExcelData();
  const pageData = await fetchPageTableData();

  const mapByDate = new Map<string, RawMarginData>();

  for (const item of [...excelData, ...pageData]) {
    const key = item.date.toISOString().substring(0, 10);
    mapByDate.set(key, item);
  }

  const combinedData = Array.from(mapByDate.values());
  console.log(`Total registros únicos combinados: ${combinedData.length}`);

  if (combinedData.length === 0) {
    console.error('No se pudieron obtener datos de FINRA.');
    return;
  }

  const sp500Map = await getSp500PriceMap();
  const currencyMap = await getCurrencyInCirculationMap();

  const dataEnrichedRaw = combinedData.map(item => {
    const dateKey = item.date.toISOString().substring(0, 7);
    const sp500Price = sp500Map.get(dateKey);
    const currencyInCirculation = currencyMap.get(dateKey);
    return { ...item, sp500Price, currencyInCirculation };
  });

  const enrichedData = calculateRiskMetrics(dataEnrichedRaw);

  console.log('Guardando en la base de datos PostgreSQL...');
  let savedCount = 0;

  for (const row of enrichedData) {
    await prisma.marginDebt.upsert({
      where: { date: row.date },
      create: row,
      update: row
    });
    savedCount++;
  }

  console.log(`Éxito! ${savedCount} registros guardados/actualizados en margin_debt.`);
}

if (require.main === module) {
  seedMarginDebt()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('Error durante la ejecución del seeder:', err);
      prisma.$disconnect();
      process.exit(1);
    });
}
