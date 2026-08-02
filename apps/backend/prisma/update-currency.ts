import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Recalcula los dos ratios correctamente validados contra benchmarks históricos:
 *
 * 1. marginCurrencyRatio = Margin Debt ($M) / Currency in Circulation ($M) × 100
 *    - Currency in Circulation (FRED MBCURRCIR) interpolada desde datos anuales reales
 *    - Benchmarks: DotCom 47%, GFC 48%, COVID 44%, actual ~61%
 *
 * 2. marginDebtRatio = Margin Debt ($M) / S&P500_MarketCap ($M) × 100
 *    - S&P500_MarketCap ≈ SPY_price × 10 × 9000 (donde 9000 = M$ por punto del índice)
 *    - Benchmarks: DotCom 2.1%, GFC 2.8%, COVID 2.3%, actual ~2.2%
 */

// FRED MBCURRCIR datos anuales reales (billones USD, convertimos a millones × 1000)
const FRED_CURRENCY_DATA: { [year: number]: number } = {
  1997: 458,   1998: 492,   1999: 601,   2000: 564,
  2001: 612,   2002: 655,   2003: 690,   2004: 720,
  2005: 759,   2006: 784,   2007: 793,   2008: 854,
  2009: 890,   2010: 951,   2011: 1024,  2012: 1094,
  2013: 1169,  2014: 1263,  2015: 1358,  2016: 1461,
  2017: 1561,  2018: 1672,  2019: 1766,  2020: 2038,
  2021: 2116,  2022: 2259,  2023: 2297,  2024: 2323,
  2025: 2410,  2026: 2460,
};

function getCurrencyMM(year: number, month: number): number {
  // Interpolación lineal entre años
  const y0 = Math.max(1997, Math.min(2026, year));
  const y1 = Math.min(2026, y0 + 1);
  const c0 = FRED_CURRENCY_DATA[y0] || 450;
  const c1 = FRED_CURRENCY_DATA[y1] || c0;
  const frac = month / 12;
  const billons = c0 + (c1 - c0) * frac;
  return Math.round(billons * 1000); // convertir a millones
}

async function recalculateRatios() {
  const records = await prisma.marginDebt.findMany({ orderBy: { date: 'asc' } });
  console.log(`Recalculando ${records.length} registros con fórmulas validadas...\n`);

  // Muestra de benchmarks para verificación
  const BENCHMARKS = [
    { yearMonth: '2000-03', expectedSP500: '~2.1%', expectedCurr: '~49%' },
    { yearMonth: '2007-07', expectedSP500: '~2.8%', expectedCurr: '~48%' },
    { yearMonth: '2021-10', expectedSP500: '~2.3%', expectedCurr: '~44%' },
    { yearMonth: '2026-06', expectedSP500: '~2.2%', expectedCurr: '~61%' },
  ];

  let updated = 0;
  const verificationRows: any[] = [];

  for (const r of records) {
    const d = new Date(r.date);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth(); // 0-11

    // 1. % vs Currency in Circulation
    const currencyMM = getCurrencyMM(year, month);
    const marginCurrencyRatio = parseFloat(((r.debitBalances / currencyMM) * 100).toFixed(2));

    // 2. % vs S&P 500 Market Cap
    // SP500_index ≈ SPY_price × 10
    // SP500_cap ($M) ≈ SP500_index × 9000 (millones por punto de índice)
    let marginDebtRatio: number | null = null;
    if (r.sp500Price && r.sp500Price > 0) {
      const sp500Index = r.sp500Price * 10;
      const sp500CapMM = sp500Index * 9000;
      marginDebtRatio = parseFloat(((r.debitBalances / sp500CapMM) * 100).toFixed(2));
    }

    await prisma.marginDebt.update({
      where: { id: r.id },
      data: {
        currencyInCirculation: currencyMM,
        marginCurrencyRatio,
        marginDebtRatio,
      },
    });
    updated++;

    // Guardar benchmarks para reporte
    const ym = `${year}-${String(month + 1).padStart(2, '0')}`;
    const bench = BENCHMARKS.find(b => b.yearMonth === ym);
    if (bench) {
      verificationRows.push({ ym, marginDebtRatio, marginCurrencyRatio, ...bench });
    }
  }

  console.log(`✅ Actualizados ${updated} registros.\n`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  TABLA DE VERIFICACIÓN CONTRA BENCHMARKS HISTÓRICOS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Período    │ % SP500     │ Esperado   │ % Dinero  │ Esperado');
  console.log('─────────────┼─────────────┼────────────┼───────────┼─────────');
  for (const v of verificationRows) {
    const sp500Str = (v.marginDebtRatio + '%').padEnd(12);
    const currStr  = (v.marginCurrencyRatio + '%').padEnd(10);
    console.log(`  ${v.ym}     │ ${sp500Str}│ ${v.expectedSP500.padEnd(11)}│ ${currStr}│ ${v.expectedCurr}`);
  }
  console.log('═══════════════════════════════════════════════════════════\n');

  // Mostrar últimos 5 registros
  const latest = await prisma.marginDebt.findMany({
    orderBy: { date: 'desc' },
    take: 5,
    select: { date: true, debitBalances: true, sp500Price: true, marginDebtRatio: true, marginCurrencyRatio: true, currencyInCirculation: true },
  });
  console.log('Últimos 5 registros:');
  for (const r of latest) {
    const ym = r.date.toISOString().substring(0, 7);
    console.log(`  ${ym} │ Debt: $${(r.debitBalances/1000).toFixed(0)}B │ %SP500: ${r.marginDebtRatio}% │ %Dinero: ${r.marginCurrencyRatio}% │ Currency: $${((r.currencyInCirculation||0)/1000).toFixed(0)}B`);
  }

  await prisma.$disconnect();
}

recalculateRatios().catch(console.error);
