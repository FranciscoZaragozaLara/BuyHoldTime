/**
 * recalculate-risk-v2.ts
 *
 * Recalculates marginDebtRatio (as true % of SP500 market cap) and
 * riskScore/riskLevel using the v2 formula for ALL existing margin_debt rows.
 * No external HTTP calls needed — uses data already in the DB.
 *
 * CORRECTION: marginDebtRatio formula
 * ------------------------------------
 * The correct formula is: (debitBalances_M / SP500_MarketCap_M) × 100
 *
 * Since we only have SPY price (not total S&P 500 market cap), we estimate:
 *   SP500_index ≈ SPY_price × 10
 *   SP500_MarketCap_M ≈ SP500_index × market_cap_per_point_M
 *
 * The market_cap_per_point factor has grown over time:
 *   ~2000: SP500 ~1550pts, MarketCap ~$11T → factor ≈ 7,097 M/pt
 *   ~2007: SP500 ~1530pts, MarketCap ~$19.7T → factor ≈ 12,876 M/pt
 *   ~2021: SP500 ~4,700pts, MarketCap ~$37T → factor ≈ 7,872 M/pt
 *   ~2026: SP500 ~7,470pts, MarketCap ~$67.2T → factor ≈ 8,994 M/pt
 *
 * We interpolate this factor linearly between known anchor years.
 *
 * Validation targets:
 *   Feb 2000: margin debt $278B / ~$11T ≈ 2.3%
 *   Jun 2007: margin debt $381B / ~$18T ≈ 3.0%   (peak, per analysts)
 *   Jan 2022: margin debt $936B / ~$38T ≈ 2.6%
 *   Jun 2026: margin debt $1,502B / ~$67.2T ≈ 2.2%
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Market cap per SP500 index point (in millions USD), by year.
// Interpolated linearly between anchor years.
// SP500_MarketCap_M = SP500_index × factor
const MARKET_CAP_FACTOR_ANCHORS: [number, number][] = [
  [1997, 5000],   // ~early FINRA data: SP500 ~900pts, MarketCap ~$4.5T
  [2000, 7097],   // Peak dot-com: SP500 ~1550pts, MarketCap ~$11T
  [2003, 5500],   // Post dot-com trough
  [2007, 12876],  // Peak GFC: SP500 ~1530pts, MarketCap ~$19.7T
  [2009, 5500],   // GFC trough
  [2013, 8000],   // Recovery
  [2016, 8500],
  [2019, 9000],
  [2020, 8000],   // COVID trough
  [2021, 7872],   // Meme peak: SP500 ~4700pts, MarketCap ~$37T
  [2022, 7100],   // Bear market: SP500 ~3800pts, MarketCap ~$27T
  [2023, 8000],
  [2024, 8500],
  [2025, 9000],
  [2026, 8994],   // Jun 2026: SP500 ~7470pts, MarketCap ~$67.2T
];

function getMarketCapFactor(year: number): number {
  if (year <= MARKET_CAP_FACTOR_ANCHORS[0][0]) return MARKET_CAP_FACTOR_ANCHORS[0][1];
  if (year >= MARKET_CAP_FACTOR_ANCHORS[MARKET_CAP_FACTOR_ANCHORS.length - 1][0]) {
    return MARKET_CAP_FACTOR_ANCHORS[MARKET_CAP_FACTOR_ANCHORS.length - 1][1];
  }
  for (let i = 0; i < MARKET_CAP_FACTOR_ANCHORS.length - 1; i++) {
    const [y1, f1] = MARKET_CAP_FACTOR_ANCHORS[i];
    const [y2, f2] = MARKET_CAP_FACTOR_ANCHORS[i + 1];
    if (year >= y1 && year <= y2) {
      return f1 + (year - y1) * (f2 - f1) / (y2 - y1);
    }
  }
  return 8000;
}

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

function approxFedFundsRate(year: number, month: number): number {
  if (year < 2004) return 5.5;
  if (year >= 2004 && year < 2007) return 2.5 + (year - 2004) * 1.2;
  if (year === 2007) return 5.0;
  if (year === 2008) return Math.max(0.25, 3.0 - month / 4);
  if (year >= 2009 && year <= 2015) return 0.25;
  if (year >= 2016 && year < 2019) return 1.0 + (year - 2016) * 0.75;
  if (year === 2019) return 2.0;
  if (year === 2020) return 0.25;
  if (year === 2021) return 0.25;
  if (year === 2022) return 0.25 + (month / 12) * 4.0;
  if (year === 2023) return 4.5 + Math.min(1.0, month / 8);
  if (year === 2024) return 5.25 - (month > 9 ? 0.75 : 0);
  if (year === 2025) return 4.5;
  return 4.25; // 2026+
}

async function main() {
  console.log('Cargando todos los registros de margin_debt...');
  const allRows = await prisma.marginDebt.findMany({ orderBy: { date: 'asc' } });
  console.log(`  → ${allRows.length} registros cargados.`);

  const sortedDebits = [...allRows].map(r => r.debitBalances).sort((a, b) => a - b);

  let updated = 0;

  const testDates = ['2000-02', '2000-03', '2007-06', '2021-01', '2022-01', '2026-06'];
  console.log('\n=== VALIDATION TABLE (benchmark against known analyst data) ===');
  console.log('Expected: 2000≈2.3%, 2007≈3.0%, 2021≈2.6%, 2026≈2.2%');
  console.log('Date          | MarketCap($T) | DebtRatio%  | YoY%   | Score | Level');
  console.log('-'.repeat(75));

  for (const row of allRows) {
    const year = row.date.getUTCFullYear();
    const month = row.date.getUTCMonth() + 1;
    const yearFraction = year + (month - 1) / 12;

    // --- SP500 market cap estimation ---
    const sp500Index = row.sp500Price ? row.sp500Price * 10 : null;
    const mcFactor = getMarketCapFactor(yearFraction);
    const sp500MarketCapM = sp500Index ? sp500Index * mcFactor : null; // in millions
    const sp500MarketCapT = sp500MarketCapM ? sp500MarketCapM / 1_000_000 : null; // in trillions (approx)

    // marginDebtRatio = % of SP500 market cap
    const marginDebtRatio = sp500MarketCapM
      ? Number(((row.debitBalances / sp500MarketCapM) * 100).toFixed(2))
      : null;

    // --- Component 1: Percentile (30%) ---
    const rank = sortedDebits.findIndex(d => d >= row.debitBalances);
    const comp1Score = (rank / sortedDebits.length) * 100;

    // --- Component 2: YoY Growth (25%) ---
    let comp2Score = 50;
    if (row.marginDebtYoY !== null) {
      comp2Score = interpScore(row.marginDebtYoY, [
        [-20, 10], [0, 50], [20, 75], [40, 95], [60, 100],
      ]);
    }

    // --- Component 3: Divergence (20%) ---
    let comp3Score = 40;
    if (row.divergence !== null) {
      comp3Score = interpScore(row.divergence, [
        [-15, 15], [-10, 20], [0, 40], [10, 65], [25, 90], [35, 100],
      ]);
    }

    // --- Component 4: Normalized Net Credit deficit (15%) ---
    const netCredit = row.netCreditBalance;
    let comp4Score = 20;
    if (netCredit < 0) {
      const deficitRatio = (Math.abs(netCredit) / row.debitBalances) * 100;
      comp4Score = interpScore(deficitRatio, [
        [0, 20], [20, 50], [40, 75], [70, 100],
      ]);
    }

    // --- Component 5: Margin rate cost (10%) ---
    const fedRate = approxFedFundsRate(year, month);
    const marginRate = fedRate + 1.75;
    const comp5Score = interpScore(marginRate, [
      [3, 20], [5, 50], [7, 75], [9, 100],
    ]);

    const riskScore = Math.min(100, Math.max(0, Math.round(
      comp1Score * 0.30 +
      comp2Score * 0.25 +
      comp3Score * 0.20 +
      comp4Score * 0.15 +
      comp5Score * 0.10
    )));

    let riskLevel = 'LOW';
    if (riskScore >= 75) riskLevel = 'CRITICAL';
    else if (riskScore >= 60) riskLevel = 'HIGH';
    else if (riskScore >= 40) riskLevel = 'MODERATE';

    const dateStr = row.date.toISOString().substring(0, 7);
    if (testDates.includes(dateStr)) {
      console.log(
        `${dateStr.padEnd(14)}| ` +
        `$${(sp500MarketCapT?.toFixed(1) ?? '-').padEnd(13)}| ` +
        `${(marginDebtRatio?.toString() ?? '-').padEnd(12)}| ` +
        `${(row.marginDebtYoY?.toFixed(1) ?? '-').padEnd(8)}| ` +
        `${String(riskScore).padEnd(7)}| ${riskLevel}`
      );
    }

    await prisma.marginDebt.update({
      where: { id: row.id },
      data: { marginDebtRatio, riskScore, riskLevel },
    });
    updated++;
  }

  console.log(`\n✅ Actualizados ${updated} registros.`);

  const recent6 = allRows.slice(-6).reverse();
  console.log('\n=== ÚLTIMOS 6 MESES ===');
  for (const r of recent6) {
    const row = await prisma.marginDebt.findUnique({ where: { id: r.id } });
    if (row) {
      console.log(`${row.date.toISOString().substring(0, 7)} | marginDebtRatio: ${row.marginDebtRatio}% | riskScore: ${row.riskScore} | ${row.riskLevel}`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
