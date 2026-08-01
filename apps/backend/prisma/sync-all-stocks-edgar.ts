import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical', 'yahooSurvey'] });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  await prisma.$connect();

  const fmpApiKey = process.env.FMP_API_KEY || 'demo';
  const todayStr = new Date().toISOString().split('T')[0];

  console.log('=====================================================');
  console.log('FETCHING SEC EDGAR CIK MAPPING...');
  console.log('=====================================================');
  const cikMap = new Map<string, string>();
  try {
    const secRes = await fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'User-Agent': 'BuyHoldTime Finance admin@buyholdtime.com' }
    });
    const secData = await secRes.json() as Record<string, any>;
    for (const key of Object.keys(secData)) {
      const sym = String(secData[key].ticker).toUpperCase();
      const cikStr = String(secData[key].cik_str).padStart(10, '0');
      cikMap.set(sym, cikStr);
    }
  } catch (err: any) {
    console.error('Error fetching SEC CIK mapping:', err.message);
  }

  const tickers = await prisma.ticker.findMany();
  console.log(`Found ${tickers.length} tickers in database.`);

  const skippedSymbols = new Set(['VOO', 'SPY', 'QQQ', 'TQQQ', 'SCHD', 'SOXX', 'SOXL', 'SMH', 'IBB', 'NLR', 'TSM', 'ASML', 'ARM', 'PDD', 'BRK.B']);
  let processedCount = 0;

  for (const ticker of tickers) {
    const symbol = ticker.symbol.toUpperCase();
    
    if (skippedSymbols.has(symbol) || ticker.sector === 'Index' || ticker.sector === 'ETF' || ticker.sector?.toLowerCase().includes('etf')) {
      console.log(`\n>>> Skipping Fund/ETF/ADR ${symbol} (Uses Sector/Index Benchmark)...`);
      continue;
    }

    processedCount++;
    console.log(`\n=====================================================`);
    console.log(`[${processedCount}/${tickers.length}] EXTRACTING & UPDATING STOCK: ${symbol} (${ticker.name})`);
    console.log(`=====================================================`);

    // 1. Fetch splits history dynamically from Yahoo Finance
    const yahooSymbol = symbol.replace('.', '-');
    let splitsList: Array<{ date: string; ratio: number }> = [];
    try {
      const rawSplits = await yahooFinance.historical(yahooSymbol, {
        period1: '1980-01-01',
        period2: todayStr,
        events: 'split'
      }) as any[];

      if (Array.isArray(rawSplits)) {
        splitsList = rawSplits.map(s => {
          const parts = String(s.stockSplits || '1:1').split(':');
          const num = parseFloat(parts[0]) || 1;
          const den = parseFloat(parts[1]) || 1;
          return {
            date: new Date(s.date).toISOString().split('T')[0],
            ratio: num / den
          };
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }
    } catch (err: any) {}

    const getCumulativeSplitFactor = (filedDateStr: string): number => {
      const filedTime = new Date(filedDateStr).getTime();
      let factor = 1;
      for (const s of splitsList) {
        if (filedTime < new Date(s.date).getTime()) {
          factor *= s.ratio;
        }
      }
      return factor;
    };

    // 2. Fetch SEC EDGAR XBRL Data
    const primaryCik = cikMap.get(symbol);
    const altCikMap: Record<string, string[]> = {
      'GOOGL': ['0001288776'],
      'GOOG': ['0001288776'],
      'META': ['0001326801'],
    };

    const targetCiks = primaryCik ? [primaryCik, ...(altCikMap[symbol] || [])] : (altCikMap[symbol] || []);
    const quartersMap = new Map<string, any>();

    let edgarUnits: any[] = [];
    let netUnits: any[] = [];
    let sharesUnits: any[] = [];

    for (const cik of targetCiks) {
      try {
        const edgarUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
        const edgarRes = await fetch(edgarUrl, {
          headers: { 'User-Agent': 'BuyHoldTime Finance admin@buyholdtime.com' }
        });
        if (edgarRes.status === 200) {
          const edgarJson = await edgarRes.json() as any;
          const usGaap = edgarJson?.facts?.['us-gaap'];

          edgarUnits.push(...(usGaap?.['EarningsPerShareDiluted']?.units?.['USD/shares'] || usGaap?.['EarningsPerShareBasic']?.units?.['USD/shares'] || []));
          netUnits.push(...(usGaap?.['NetIncomeLoss']?.units?.['USD'] || []));
          sharesUnits.push(...(usGaap?.['WeightedAverageNumberOfDilutedSharesOutstanding']?.units?.['shares'] || usGaap?.['WeightedAverageNumberOfSharesOutstandingBasic']?.units?.['shares'] || []));
        }
      } catch (err: any) {}
    }

    if (edgarUnits.length > 0) {
      try {
        // Group 10-K FY annual reports
        const fyEpsMap = new Map<number, any>();
        for (const u of edgarUnits) {
          if (u.form === '10-K' && u.fp === 'FY' && u.end) {
            const yr = parseInt(u.end.split('-')[0], 10);
            if (!fyEpsMap.has(yr) || new Date(u.filed).getTime() > new Date(fyEpsMap.get(yr).filed).getTime()) {
              fyEpsMap.set(yr, u);
            }
          }
        }

        // Pure 3-Month 10-Qs
        const pure3MQuarters = edgarUnits.filter((u: any) => {
          if (!u.start || !u.end || u.form !== '10-Q') return false;
          const days = (new Date(u.end).getTime() - new Date(u.start).getTime()) / 86400000;
          return days >= 75 && days <= 110;
        });

        // Group by end date & select the MOST RECENT FILED report
        const latestFiled3MMap = new Map<string, any>();
        for (const u of pure3MQuarters) {
          if (!latestFiled3MMap.has(u.end) || new Date(u.filed).getTime() > new Date(latestFiled3MMap.get(u.end).filed).getTime()) {
            latestFiled3MMap.set(u.end, u);
          }
        }

        const yearQuarters = new Map<number, Map<string, any>>();

        for (const u of Array.from(latestFiled3MMap.values())) {
          const splitFactor = getCumulativeSplitFactor(u.filed || u.end);
          const adjustedEps = parseFloat((u.val / splitFactor).toFixed(4));
          
          const parts = u.end.split('-');
          const yr = parseInt(parts[0], 10);
          const mo = parseInt(parts[1], 10);

          let fpPeriod = 'Q1';
          if (mo <= 4) fpPeriod = 'Q1';
          else if (mo <= 7) fpPeriod = 'Q2';
          else if (mo <= 10) fpPeriod = 'Q3';
          else fpPeriod = 'Q4';

          let fyNum = yr;
          if (u.fy && Math.abs(u.fy - yr) === 1 && (mo === 1 || mo === 2)) {
            fyNum = u.fy;
          }

          const fyYear = String(fyNum);

          if (!yearQuarters.has(fyNum)) yearQuarters.set(fyNum, new Map());
          yearQuarters.get(fyNum)!.set(fpPeriod, { ...u, adjustedEps });

          quartersMap.set(u.end, {
            date: u.end,
            period: fpPeriod,
            fiscalYear: fyYear,
            revenue: 0,
            netIncome: 0,
            eps: adjustedEps,
            epsDiluted: adjustedEps,
            sharesOutstanding: 0,
            source: 'EDGAR' as const,
            filed: u.filed
          });
        }

        // Derive Q4 for each Fiscal Year from official 10-K FY report
        for (const [yr, fyFact] of fyEpsMap.entries()) {
          const yq = yearQuarters.get(yr);
          const q1Val = yq?.get('Q1')?.adjustedEps || 0;
          const q2Val = yq?.get('Q2')?.adjustedEps || 0;
          const q3Val = yq?.get('Q3')?.adjustedEps || 0;

          if (q1Val !== 0 && q2Val !== 0 && q3Val !== 0) {
            const splitFactorFY = getCumulativeSplitFactor(fyFact.filed || fyFact.end);
            const fyEpsValAdjusted = fyFact.val / splitFactorFY;
            const q4Date = fyFact.end;

            const q4DerivedEps = parseFloat((fyEpsValAdjusted - (q1Val + q2Val + q3Val)).toFixed(4));
            quartersMap.set(q4Date, {
              date: q4Date,
              period: 'Q4',
              fiscalYear: String(yr),
              revenue: 0,
              netIncome: 0,
              eps: q4DerivedEps,
              epsDiluted: q4DerivedEps,
              sharesOutstanding: 0,
              source: 'EDGAR' as const,
              filed: fyFact.filed
            });
          }
        }

        // Populate Net Income & Shares
        const quarterlyNet = netUnits.filter((u: any) => u.start && u.end && ((new Date(u.end).getTime() - new Date(u.start).getTime()) / 86400000) >= 75);
        for (const n of quarterlyNet) {
          if (quartersMap.has(n.end) && n.val) quartersMap.get(n.end).netIncome = n.val;
        }

        const quarterlyShares = sharesUnits.filter((u: any) => u.start && u.end && ((new Date(u.end).getTime() - new Date(u.start).getTime()) / 86400000) >= 75);
        for (const s of quarterlyShares) {
          if (quartersMap.has(s.end) && s.val) {
            const splitFactor = getCumulativeSplitFactor(s.filed || s.end);
            quartersMap.get(s.end).sharesOutstanding = Math.round(s.val * splitFactor);
          }
        }
      } catch (err: any) {
        console.warn(`SEC EDGAR Warning for ${symbol}:`, err.message);
      }
    }

    // 3. Merge FMP recent quarters for latest real-time updates
    try {
      const fmpUrl = `https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}&period=quarter&apikey=${fmpApiKey}`;
      const fmpRes = await fetch(fmpUrl);
      const fmpData = await fmpRes.json() as any[];
      if (Array.isArray(fmpData)) {
        for (const item of fmpData) {
          if (item.date && item.eps !== undefined) {
            const existing = quartersMap.get(item.date);
            if (existing) {
              existing.source = 'FMP';
              existing.eps = Number(item.epsDiluted || item.eps);
              existing.epsDiluted = Number(item.epsDiluted || item.eps);
              if (item.netIncome) existing.netIncome = Number(item.netIncome);
              if (item.weightedAverageShsOutDil) existing.sharesOutstanding = Number(item.weightedAverageShsOutDil);
            }
          }
        }
      }
    } catch (err) {}

    const finalQuarters = Array.from(quartersMap.values())
      .map(({ filed, ...rest }) => rest)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Update in DB
    await prisma.ticker.update({
      where: { id: ticker.id },
      data: { historicalEpsQuarterly: finalQuarters as any, updatedAt: new Date() }
    });

    console.log(`Summary Table of Extracted Quarters for ${symbol} (Total: ${finalQuarters.length}):`);
    console.table(
      finalQuarters.slice(0, 5).map(q => ({
        Date: q.date,
        Period: `${q.period} ${q.fiscalYear}`,
        'EPS ($)': q.eps,
        'Net Income ($B)': q.netIncome ? `${(q.netIncome / 1e9).toFixed(2)}B` : '0B',
        Source: q.source,
      }))
    );
  }

  await prisma.$disconnect();
  await pool.end();
  console.log('\n=====================================================');
  console.log('ALL STOCKS EXTRACTION & SYNC COMPLETED SUCCESSFULLY!');
  console.log('=====================================================');
}

main().catch(console.error);
