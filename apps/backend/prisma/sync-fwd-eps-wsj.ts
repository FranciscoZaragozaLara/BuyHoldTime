import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { databaseUrl } from './db-url';
import { fetchWsjPeHtml, impliedForwardEps, parseWsjPeYields } from '../src/modules/market-data/wsj-pe';

// SPX_FWD_EPS automático: P/E estimado a 12 meses del S&P 500 (Birinyi Associates, tabla de WSJ,
// actualizada cada viernes) → EPS estimado = cierre del S&P 500 de esa fecha / P/E estimado.
// Upsert en la fecha de corte (source 'wsj-birinyi'). Idempotente: si WSJ no cambió, reescribe lo mismo.
// Lo corre el cron diario de market-sync (07:15 ET). Sustituye la captura manual de Yardeni.
const adapter = new PrismaPg({ connectionString: databaseUrl() });
const prisma = new PrismaClient({ adapter });

async function main() {
  const row = parseWsjPeYields(await fetchWsjPeHtml());
  if (!row) throw new Error('No se encontró la fila S&P 500 Index en la tabla de WSJ (¿cambió el HTML?)');
  if (!row.estimate) throw new Error(`WSJ sin P/E estimado para ${row.asOf}`);
  const px = await prisma.btMarketData.findFirst({ where: { ticker: '^GSPC', date: { lte: new Date(`${row.asOf}T00:00:00Z`) } }, orderBy: { date: 'desc' } });
  if (!px?.close) throw new Error(`Sin cierre del S&P 500 al ${row.asOf}`);
  const pxDate = px.date.toISOString().slice(0, 10);
  if (pxDate !== row.asOf) console.warn(`Aviso: cierre del S&P 500 de ${pxDate} (no hay ${row.asOf})`);
  const eps = impliedForwardEps(Number(px.close), row.estimate);
  const date = new Date(`${row.asOf}T00:00:00Z`);
  await prisma.btMarketData.upsert({
    where: { ticker_date: { ticker: 'SPX_FWD_EPS', date } },
    update: { open: eps, high: eps, low: eps, close: eps, adjClose: eps, source: 'wsj-birinyi', isValidated: true },
    create: { ticker: 'SPX_FWD_EPS', date, open: eps, high: eps, low: eps, close: eps, adjClose: eps, volume: BigInt(0), isValidated: true, source: 'wsj-birinyi' },
  });
  console.log(`SPX_FWD_EPS ${row.asOf}: P/E estimado ${row.estimate} · S&P 500 ${Number(px.close).toFixed(2)} → EPS ${eps}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
