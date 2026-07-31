import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import YahooFinance from 'yahoo-finance2';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  await prisma.$connect();

  const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical', 'yahooSurvey'] });
  const fmpApiKey = 'aHWvhgdKuBbca6TnHQyXFDwe4w5I6ja5';
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

  const skippedFunds = new Set(['VOO', 'SPY', 'QQQ', 'TQQQ', 'SCHD', 'SOXX', 'SOXL', 'SMH', 'IBB', 'NLR']);
  let processedCount = 0;

  for (const ticker of tickers) {
    const symbol = ticker.symbol.toUpperCase();
    
    if (skippedFunds.has(symbol) || ticker.sector === 'Index' || ticker.sector === 'ETF' || ticker.sector?.toLowerCase().includes('etf')) {
      console.log(`\n>>> Skipping Fund/ETF ${symbol} (Uses Sector/Index Benchmark)...`);
      continue;
    }

    processedCount++;
    console.log(`\n=====================================================`);
    console.log(`[${processedCount}] PROCESSING STOCK: ${symbol} (${ticker.name})`);
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
        }).sort((a, b) => new Date(a.date).getTime() - new Date(a.date).getTime());
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

    // 2. Fetch SEC EDGAR XBRL Data (including historical CIKs for corporate restructurings like Alphabet/Google)
    const primaryCik = cikMap.get(symbol);
    const altCikMap: Record<string, string[]> = {
      'GOOGL': ['0001288776'], // Google Inc (2004-2015 pre-Alphabet restructuring)
      'GOOG': ['0001288776'],
      'META': ['0001326801'],
    };

    const targetCiks = primaryCik ? [primaryCik, ...(altCikMap[symbol] || [])] : (altCikMap[symbol] || []);
    const quartersMap = new Map<string, any>();

    let epsUnits: any[] = [];
    let revUnits: any[] = [];
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

          epsUnits.push(...(usGaap?.['EarningsPerShareDiluted']?.units?.['USD/shares'] || usGaap?.['EarningsPerShareBasic']?.units?.['USD/shares'] || []));
          revUnits.push(...(usGaap?.['RevenueFromContractWithCustomerExcludingAssessedTax']?.units?.['USD'] || usGaap?.['SalesRevenueNet']?.units?.['USD'] || []));
          netUnits.push(...(usGaap?.['NetIncomeLoss']?.units?.['USD'] || []));
          sharesUnits.push(...(usGaap?.['WeightedAverageNumberOfDilutedSharesOutstanding']?.units?.['shares'] || usGaap?.['WeightedAverageNumberOfSharesOutstandingBasic']?.units?.['shares'] || []));
        }
      } catch (err: any) {}
    }

    if (epsUnits.length > 0) {

        // Group 10-K FY annual reports to derive exact Q4 values
        const fyEpsMap = new Map<number, any>();
        const fyNetMap = new Map<number, any>();
        const fyRevMap = new Map<number, any>();

        for (const u of epsUnits) {
          if (u.form === '10-K' && u.fp === 'FY' && u.end) {
            const yr = parseInt(u.end.split('-')[0], 10);
            if (!fyEpsMap.has(yr) || new Date(u.filed).getTime() > new Date(fyEpsMap.get(yr).filed).getTime()) {
              fyEpsMap.set(yr, u);
            }
          }
        }
        for (const u of netUnits) {
          if (u.form === '10-K' && u.fp === 'FY' && u.end) {
            const yr = parseInt(u.end.split('-')[0], 10);
            if (!fyNetMap.has(yr) || new Date(u.filed).getTime() > new Date(fyNetMap.get(yr).filed).getTime()) {
              fyNetMap.set(yr, u);
            }
          }
        }
        for (const u of revUnits) {
          if (u.form === '10-K' && u.fp === 'FY' && u.end) {
            const yr = parseInt(u.end.split('-')[0], 10);
            if (!fyRevMap.has(yr) || new Date(u.filed).getTime() > new Date(fyRevMap.get(yr).filed).getTime()) {
              fyRevMap.set(yr, u);
            }
          }
        }

        // Process 3-Month Quarters (Q1, Q2, Q3)
        const quarterlyEps = epsUnits.filter((u: any) => {
          if (!u.start || !u.end) return false;
          const days = (new Date(u.end).getTime() - new Date(u.start).getTime()) / 86400000;
          return days >= 75 && days <= 110;
        });

        const yearQuarters = new Map<number, { q1?: any, q2?: any, q3?: any }>();

        for (const u of quarterlyEps) {
          const splitFactor = getCumulativeSplitFactor(u.filed || u.end);
          const adjustedEps = parseFloat((u.val / splitFactor).toFixed(4));
          const parts = u.end.split('-');
          const yr = parseInt(parts[0], 10);
          const mo = parseInt(parts[1], 10);

          if (!yearQuarters.has(yr)) yearQuarters.set(yr, {});
          const yq = yearQuarters.get(yr)!;

          let period = 'Q4';
          if (mo <= 3) { period = 'Q1'; yq.q1 = u; }
          else if (mo <= 6) { period = 'Q2'; yq.q2 = u; }
          else if (mo <= 9) { period = 'Q3'; yq.q3 = u; }

          if (!quartersMap.has(u.end) || new Date(u.filed).getTime() > new Date(quartersMap.get(u.end).filed).getTime()) {
            quartersMap.set(u.end, {
              date: u.end,
              period,
              fiscalYear: String(u.fy || yr),
              revenue: 0,
              netIncome: 0,
              eps: adjustedEps,
              epsDiluted: adjustedEps,
              sharesOutstanding: 0,
              source: 'EDGAR' as const,
              filed: u.filed
            });
          }
        }

        // Derive Q4 (Form 10-K FY - [Q1 + Q2 + Q3]) so 4Q TTM sum matches 10-K FY perfectly
        for (const [yr, fyFact] of fyEpsMap.entries()) {
          const yq = yearQuarters.get(yr);
          if (yq && yq.q1 && yq.q2 && yq.q3) {
            const splitFactor = getCumulativeSplitFactor(fyFact.filed || fyFact.end);
            const fyEpsVal = fyFact.val / splitFactor;
            const q1Val = yq.q1.val / getCumulativeSplitFactor(yq.q1.filed || yq.q1.end);
            const q2Val = yq.q2.val / getCumulativeSplitFactor(yq.q2.filed || yq.q2.end);
            const q3Val = yq.q3.val / getCumulativeSplitFactor(yq.q3.filed || yq.q3.end);

            const q4DerivedEps = parseFloat((fyEpsVal - (q1Val + q2Val + q3Val)).toFixed(4));
            const q4Date = `${yr}-12-31`;

            let q4Net = 0;
            const fyNetFact = fyNetMap.get(yr);
            if (fyNetFact) {
              q4Net = fyNetFact.val;
            }

            if (!quartersMap.has(q4Date) || new Date(fyFact.filed).getTime() >= new Date(quartersMap.get(q4Date)?.filed || 0).getTime()) {
              quartersMap.set(q4Date, {
                date: q4Date,
                period: 'Q4',
                fiscalYear: String(yr),
                revenue: 0,
                netIncome: q4Net,
                eps: q4DerivedEps,
                epsDiluted: q4DerivedEps,
                sharesOutstanding: 0,
                source: 'EDGAR' as const,
                filed: fyFact.filed
              });
            }
          }
        }

        // Pre-2008 fallback using 10-K annuals divided by 4
        for (const [yr, a] of fyEpsMap.entries()) {
          if (yr < 2008) {
            const splitFactor = getCumulativeSplitFactor(a.filed || a.end);
            const qEps = parseFloat((a.val / (4 * splitFactor)).toFixed(4));

            const qConfigs = [
              { period: 'Q1', dateStr: `${yr}-03-31` },
              { period: 'Q2', dateStr: `${yr}-06-30` },
              { period: 'Q3', dateStr: `${yr}-09-30` },
              { period: 'Q4', dateStr: `${yr}-12-31` }
            ];
            for (const qc of qConfigs) {
              if (!quartersMap.has(qc.dateStr)) {
                quartersMap.set(qc.dateStr, {
                  date: qc.dateStr,
                  period: qc.period,
                  fiscalYear: String(yr),
                  revenue: 0,
                  netIncome: 0,
                  eps: qEps,
                  epsDiluted: qEps,
                  sharesOutstanding: 0,
                  source: 'EDGAR' as const,
                });
              }
            }
          }
        }

        // Populate Revenue, Net Income & Shares Outstanding
        const quarterlyRev = revUnits.filter((u: any) => u.start && u.end && ((new Date(u.end).getTime() - new Date(u.start).getTime()) / 86400000) >= 75);
        for (const r of quarterlyRev) {
          if (quartersMap.has(r.end) && r.val) quartersMap.get(r.end).revenue = r.val;
        }

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

    // 3. Merge FMP recent quarters
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
      data: { historicalEpsQuarterly: finalQuarters as any }
    });

    console.log(`Summary Table of Extracted Quarters & Shares for ${symbol} (Total: ${finalQuarters.length}):`);
    console.table(
      finalQuarters.slice(0, 10).map(q => ({
        Date: q.date,
        Period: `${q.period} ${q.fiscalYear}`,
        'EPS ($)': q.eps,
        'Net Income ($B)': q.netIncome ? `${(q.netIncome / 1e9).toFixed(2)}B` : '0B',
        'Shares (M)': q.sharesOutstanding ? `${(q.sharesOutstanding / 1e6).toFixed(1)}M` : '0M',
        Source: q.source,
      }))
    );
  }

  await prisma.$disconnect();
  await pool.end();
  console.log('\nALL STOCKS SYNC WITH EXACT 10-K Q4 DERIVATION COMPLETED SUCCESSFULLY!');
}

main().catch(console.error);
