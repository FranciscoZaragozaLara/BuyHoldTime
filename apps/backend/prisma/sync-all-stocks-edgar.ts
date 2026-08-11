import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical', 'yahooSurvey'] });

function getFiscalPeriodAndYear(endYr: number, endMo: number, closingMonth: number) {
  let period = "Q1";
  let fyNum = endYr;

  if (closingMonth === 8 || closingMonth === 9 || closingMonth === 10) { // COST, AAPL, QCOM
    if (endMo >= 11 || endMo <= 1) { period = "Q1"; fyNum = (endMo === 11 || endMo === 12) ? endYr + 1 : endYr; }
    else if (endMo >= 2 && endMo <= 4) { period = "Q2"; fyNum = endYr; }
    else if (endMo >= 5 && endMo <= 7) { period = "Q3"; fyNum = endYr; }
    else if (endMo >= 8 && endMo <= 10) { period = "Q4"; fyNum = endYr; }
  } else if (closingMonth === 6 || closingMonth === 7) { // MSFT, STX, WDC
    if (endMo >= 8 && endMo <= 10) { period = "Q1"; fyNum = endYr + 1; }
    else if (endMo >= 11 || endMo <= 1) { period = "Q2"; fyNum = (endMo === 11 || endMo === 12) ? endYr + 1 : endYr; }
    else if (endMo >= 2 && endMo <= 4) { period = "Q3"; fyNum = endYr; }
    else if (endMo >= 5 && endMo <= 7) { period = "Q4"; fyNum = endYr; }
  } else if (closingMonth === 1 || closingMonth === 2) { // NVDA, WMT, CRWD
    if (endMo >= 3 && endMo <= 5) { period = "Q1"; fyNum = endYr + 1; }
    else if (endMo >= 6 && endMo <= 8) { period = "Q2"; fyNum = endYr + 1; }
    else if (endMo >= 9 && endMo <= 11) { period = "Q3"; fyNum = endYr + 1; }
    else if (endMo === 12 || endMo <= 2) { period = "Q4"; fyNum = (endMo === 12) ? endYr + 1 : endYr; }
  } else { // 12 - AMZN, GOOGL, META, TSLA, NFLX
    if (endMo <= 3) { period = "Q1"; fyNum = endYr; }
    else if (endMo <= 6) { period = "Q2"; fyNum = endYr; }
    else if (endMo <= 9) { period = "Q3"; fyNum = endYr; }
    else { period = "Q4"; fyNum = endYr; }
  }

  return { period, fyNum };
}

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
      if (symbol === 'GOOGL' || symbol === 'GOOG') {
        const d = new Date(filedDateStr);
        let factor = 1.0;
        if (d < new Date("2022-07-16")) factor *= 20.0;
        if (d < new Date("2014-04-03")) factor *= 1.998;
        return factor;
      }
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
      'GOOGL': ['0001652044', '0001288776'],
      'GOOG': ['0001652044', '0001288776'],
      'META': ['0001326801'],
      'XOM': ['0000034088', '0002115436'],  // ExxonMobil: CIK histórico + moderno
    };


    const targetCiks = Array.from(new Set([
      ...(primaryCik ? [primaryCik] : []),
      ...(altCikMap[symbol] || [])
    ]));
    const quartersMap = new Map<string, any>();

    let edgarUnits: any[] = [];
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

        // 1. Pure 3-Month / 4-Month Quarters across ANY form (70 to 125 days)
        const pure3MQuarters = edgarUnits.filter((u: any) => {
          if (!u.start || !u.end) return false;
          const days = (new Date(u.end).getTime() - new Date(u.start).getTime()) / 86400000;
          return days >= 70 && days <= 125;
        });

        // Map 3M Revenues
        const revMap = new Map<string, number>();
        for (const u of revUnits) {
          if (u.start && u.end && u.val) {
            const days = (new Date(u.end).getTime() - new Date(u.start).getTime()) / 86400000;
            if (days >= 70 && days <= 125) {
              revMap.set(u.end, u.val);
            }
          }
        }

        // Map 3M NetIncome
        const netMap = new Map<string, number>();
        for (const u of netUnits) {
          if (u.start && u.end && u.val) {
            const days = (new Date(u.end).getTime() - new Date(u.start).getTime()) / 86400000;
            if (days >= 70 && days <= 125) {
              netMap.set(u.end, u.val);
            }
          }
        }

        // Map 3M Shares
        const sharesMap = new Map<string, number>();
        for (const s of sharesUnits) {
          if (s.end && s.val) sharesMap.set(s.end, s.val);
        }

        const end3MMap = new Map<string, any>();
        for (const u of pure3MQuarters) {
          if (!end3MMap.has(u.end) || new Date(u.filed).getTime() < new Date(end3MMap.get(u.end).filed).getTime()) {
            end3MMap.set(u.end, u);
          }
        }

        const pure10KFullYears = edgarUnits.filter((u: any) => {
          if (!u.start || !u.end) return false;
          const days = (new Date(u.end).getTime() - new Date(u.start).getTime()) / 86400000;
          return days >= 350 && days <= 375;
        });

        const end10KMap = new Map<string, any>();
        for (const u of pure10KFullYears) {
          if (!end10KMap.has(u.end) || new Date(u.filed).getTime() < new Date(end10KMap.get(u.end).filed).getTime()) {
            end10KMap.set(u.end, u);
          }
        }

        let companyClosingMonth = 12;
        if (end10KMap.size > 0) {
          const latest10K = Array.from(end10KMap.values()).sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime())[0];
          companyClosingMonth = parseInt(latest10K.end.split("-")[1], 10);
        }

        const fyGroupMap = new Map<number, { Q1?: number; Q2?: number; Q3?: number; Q4?: number }>();

        for (const u of Array.from(end3MMap.values())) {
          const splitFactor = getCumulativeSplitFactor(u.filed || u.end);
          const adjustedEps = parseFloat((u.val / splitFactor).toFixed(4));
          const parts = u.end.split("-");
          const endYr = parseInt(parts[0], 10);
          const endMo = parseInt(parts[1], 10);

          const { period, fyNum } = getFiscalPeriodAndYear(endYr, endMo, companyClosingMonth);

          if (!fyGroupMap.has(fyNum)) fyGroupMap.set(fyNum, {});
          const fyObj = fyGroupMap.get(fyNum)!;
          if ((fyObj as any)[period] !== undefined) continue;

          (fyObj as any)[period] = adjustedEps;

          const qRev = revMap.get(u.end) || 0;
          const qNet = netMap.get(u.end) || 0;
          const qShares = sharesMap.get(u.end) || 0;

          quartersMap.set(u.end, {
            date: u.end,
            filedDate: u.filed || null,
            accn: u.accn || null,
            form: u.form || "10-Q",
            cik: primaryCik || targetCiks[0] || "",
            period: period,
            fiscalYear: String(fyNum),
            revenue: qRev,
            netIncome: qNet,
            eps: adjustedEps,
            epsDiluted: adjustedEps,
            sharesOutstanding: qShares,
            source: "EDGAR" as const
          });
        }

        // Derive Q4 for each real 10-K Annual Report if Q4 is missing
        for (const [fyEndDate, fyFact] of end10KMap.entries()) {
          const parts = fyEndDate.split("-");
          const endYr = parseInt(parts[0], 10);
          const endMo = parseInt(parts[1], 10);

          const { fyNum } = getFiscalPeriodAndYear(endYr, endMo, companyClosingMonth);
          const fyObj = fyGroupMap.get(fyNum);

          if (fyObj && (fyObj as any).Q1 !== undefined && (fyObj as any).Q2 !== undefined && (fyObj as any).Q3 !== undefined && (fyObj as any).Q4 === undefined) {
            const splitFactor = getCumulativeSplitFactor(fyFact.filed || fyFact.end);
            const fyEpsAdjusted = fyFact.val / splitFactor;
            let q4Derived = parseFloat((fyEpsAdjusted - ((fyObj as any).Q1 + (fyObj as any).Q2 + (fyObj as any).Q3)).toFixed(4));

            (fyObj as any).Q4 = q4Derived;

            // Calcular NetIncome Q4 = FY_anual - suma(Q1+Q2+Q3)
            const annualNet = netMap.get(fyEndDate) || 0;
            const q1q2q3Net = [fyEndDate]
              .flatMap(() => Array.from(quartersMap.values())
                .filter(q => q.fiscalYear === String(fyNum) && ['Q1','Q2','Q3'].includes(q.period))
                .map(q => q.netIncome || 0)
              ).reduce((a: number, b: number) => a + b, 0);
            const q4NetIncome = annualNet > 0 ? annualNet - q1q2q3Net : 0;

            quartersMap.set(fyEndDate, {
              date: fyEndDate,
              filedDate: fyFact.filed || null,
              accn: fyFact.accn || null,
              form: '10-K',
              cik: primaryCik || targetCiks[0] || '',
              period: 'Q4',
              fiscalYear: String(fyNum),
              revenue: revMap.get(fyEndDate) || 0,
              netIncome: q4NetIncome,
              eps: q4Derived,
              epsDiluted: q4Derived,
              sharesOutstanding: sharesMap.get(fyEndDate) || 0,
              source: 'EDGAR' as const,
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
    } catch {}

    const finalQuarters = Array.from(quartersMap.values())
      .map(({ filed, ...rest }) => rest)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Update in DB
    if (finalQuarters.length > 0) {
      await prisma.ticker.update({
        where: { id: ticker.id },
        data: { historicalEpsQuarterly: finalQuarters as any, updatedAt: new Date() }
      });
    } else {
      // Fallback for companies with multi-class SEC reporting structure (e.g. Visa - V)
      try {
        const fallbackQuartersMap = new Map<string, any>();
        const fyGroupMap = new Map<number, { Q1?: number; Q2?: number; Q3?: number; Q4?: number }>();

        // 1. Try fetching earningsHistory from Yahoo
        const yahooEpsMap = new Map<string, number>();
        try {
          const summary = await yahooFinance.quoteSummary(symbol, { modules: ["earningsHistory"] }) as any;
          const historyList = summary?.earningsHistory?.history || [];
          for (const h of historyList) {
            if (h.quarter && h.epsActual !== undefined && h.epsActual !== null) {
              const dStr = new Date(h.quarter).toISOString().split("T")[0];
              yahooEpsMap.set(dStr, parseFloat(h.epsActual.toFixed(4)));
            }
          }
        } catch {}

        // 2. Fetch NetIncomeLoss facts from SEC EDGAR across target CIKs
        const netUnits: any[] = [];
        for (const cik of targetCiks) {
          try {
            const edgarUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
            const edgarRes = await fetch(edgarUrl, { headers: { "User-Agent": "BuyHoldTime Finance admin@buyholdtime.com" } });
            if (edgarRes.status === 200) {
              const edgarJson = await edgarRes.json() as any;
              const usGaap = edgarJson?.facts?.["us-gaap"];
              netUnits.push(...(usGaap?.["NetIncomeLoss"]?.units?.["USD"] || []));
            }
          } catch {}
        }

        const pure3MNet = netUnits.filter((u: any) => {
          if (!u.start || !u.end) return false;
          const days = (new Date(u.end).getTime() - new Date(u.start).getTime()) / 86400000;
          return days >= 75 && days <= 110;
        });

        const end3MMap = new Map<string, any>();
        for (const u of pure3MNet) {
          if (!end3MMap.has(u.end) || new Date(u.filed).getTime() < new Date(end3MMap.get(u.end).filed).getTime()) {
            end3MMap.set(u.end, u);
          }
        }

        let companyClosingMonth = 12;
        if (symbol === "V") companyClosingMonth = 9;

        for (const [end, netFact] of end3MMap.entries()) {
          const splitFactor = getCumulativeSplitFactor(netFact.filed || end);
          let epsVal = yahooEpsMap.get(end);

          if (epsVal === undefined) {
            const endYear = parseInt(end.split("-")[0], 10);
            const estShares = endYear >= 2015 ? 2.15e9 : 6.8e8;
            const rawEps = netFact.val / estShares;
            epsVal = parseFloat((rawEps / splitFactor).toFixed(4));
          }

          const parts = end.split("-");
          const endYr = parseInt(parts[0], 10);
          const endMo = parseInt(parts[1], 10);

          const { period, fyNum } = getFiscalPeriodAndYear(endYr, endMo, companyClosingMonth);

          if (!fyGroupMap.has(fyNum)) fyGroupMap.set(fyNum, {});
          const fyObj = fyGroupMap.get(fyNum)!;
          if ((fyObj as any)[period] !== undefined) continue;

          (fyObj as any)[period] = epsVal;

          fallbackQuartersMap.set(end, {
            date: end,
            period: period,
            fiscalYear: String(fyNum),
            revenue: 0,
            netIncome: netFact.val,
            eps: epsVal,
            epsDiluted: epsVal,
            sharesOutstanding: 0,
            source: "EDGAR" as const
          });
        }

        // 3. Derive Q4 for Fallback Companies using 10-K Net Income / Annual Reports
        const pure10KNet = netUnits.filter((u: any) => {
          if (!u.start || !u.end) return false;
          const days = (new Date(u.end).getTime() - new Date(u.start).getTime()) / 86400000;
          return days >= 350 && days <= 375;
        });

        const end10KMap = new Map<string, any>();
        for (const u of pure10KNet) {
          if (!end10KMap.has(u.end) || new Date(u.filed).getTime() < new Date(end10KMap.get(u.end).filed).getTime()) {
            end10KMap.set(u.end, u);
          }
        }

        for (const [fyEndDate, fyFact] of end10KMap.entries()) {
          const parts = fyEndDate.split("-");
          const endYr = parseInt(parts[0], 10);
          const endMo = parseInt(parts[1], 10);

          const { fyNum } = getFiscalPeriodAndYear(endYr, endMo, companyClosingMonth);
          const fyObj = fyGroupMap.get(fyNum);

          if (fyObj && fyObj.Q1 !== undefined && fyObj.Q2 !== undefined && fyObj.Q3 !== undefined && fyObj.Q4 === undefined) {
            const splitFactor = getCumulativeSplitFactor(fyFact.filed || fyFact.end);
            const estShares = endYr >= 2015 ? 2.15e9 : 6.8e8;
            const fyEpsAdjusted = (fyFact.val / estShares) / splitFactor;
            let q4Derived = parseFloat((fyEpsAdjusted - (fyObj.Q1 + fyObj.Q2 + fyObj.Q3)).toFixed(4));

            if (yahooEpsMap.has(fyEndDate)) {
              q4Derived = yahooEpsMap.get(fyEndDate)!;
            }

            fyObj.Q4 = q4Derived;

            fallbackQuartersMap.set(fyEndDate, {
              date: fyEndDate,
              period: "Q4",
              fiscalYear: String(fyNum),
              revenue: 0,
              netIncome: 0,
              eps: q4Derived,
              epsDiluted: q4Derived,
              sharesOutstanding: 0,
              source: "EDGAR" as const
            });
          }
        }

        const fallbackFinalQuarters = Array.from(fallbackQuartersMap.values())
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        if (fallbackFinalQuarters.length > 0) {
          await prisma.ticker.update({
            where: { id: ticker.id },
            data: { historicalEpsQuarterly: fallbackFinalQuarters as any, updatedAt: new Date() }
          });
          console.log(`[OK] Full Fallback Sync completed for ${symbol} with ${fallbackFinalQuarters.length} quarters.`);
        }
      } catch (err: any) {
        console.error(`[ERROR] Fallback Sync failed for ${symbol}:`, err?.message || err);
      }
    }

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
