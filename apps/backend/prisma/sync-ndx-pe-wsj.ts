import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { databaseUrl } from './db-url';
import { fetchWsjPeHtml, MonthlyPeEntry, parseWsjPeYields, setMonthlyPe, WSJ_NDX } from '../src/modules/market-data/wsj-pe';

// P/E del Nasdaq 100 automático desde la tabla de WSJ (Birinyi Associates, viernes):
// - NDX_PE (trailing) y NDX_FWD_PE (estimado a 12 meses) en bt_market_data, fecha de corte, source 'wsj-birinyi'.
// - QQQ/TQQQ: el trailing va a la entrada del mes en historical_eps_quarterly (la que usan las tablas
//   de precios para el EPS implícito). Sustituye la captura manual de GuruFocus (source/nasdaq_100_pe.js);
//   la historia anterior queda como está. Idempotente. Lo corre el cron diario de market-sync (07:15 ET).
const adapter = new PrismaPg({ connectionString: databaseUrl() });
const prisma = new PrismaClient({ adapter });

async function upsertSeries(ticker: string, asOf: string, v: number) {
  const date = new Date(`${asOf}T00:00:00Z`);
  await prisma.btMarketData.upsert({
    where: { ticker_date: { ticker, date } },
    update: { open: v, high: v, low: v, close: v, adjClose: v, source: 'wsj-birinyi', isValidated: true },
    create: { ticker, date, open: v, high: v, low: v, close: v, adjClose: v, volume: BigInt(0), isValidated: true, source: 'wsj-birinyi' },
  });
}

async function main() {
  const row = parseWsjPeYields(await fetchWsjPeHtml(), WSJ_NDX);
  if (!row) throw new Error(`No se encontró la fila ${WSJ_NDX} en la tabla de WSJ (¿cambió el HTML?)`);
  if (!row.trailing) throw new Error(`WSJ sin P/E trailing del Nasdaq 100 para ${row.asOf}`);
  await upsertSeries('NDX_PE', row.asOf, row.trailing);
  if (row.estimate) await upsertSeries('NDX_FWD_PE', row.asOf, row.estimate);
  for (const symbol of ['QQQ', 'TQQQ']) {
    const t = await prisma.ticker.findFirst({ where: { symbol }, select: { id: true, historicalEpsQuarterly: true } });
    if (!t) { console.warn(`${symbol} no está en tickers`); continue; }
    const entries = setMonthlyPe((t.historicalEpsQuarterly as MonthlyPeEntry[] | null) ?? [], row.asOf, row.trailing);
    await prisma.ticker.update({ where: { id: t.id }, data: { historicalEpsQuarterly: entries as any } });
  }
  console.log(`NDX ${row.asOf}: P/E trailing ${row.trailing} · estimado ${row.estimate ?? '—'} → QQQ/TQQQ ${row.asOf.slice(0, 7)}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
