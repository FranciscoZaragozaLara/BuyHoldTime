import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { databaseUrl } from './db-url';

const adapter = new PrismaPg({ connectionString: databaseUrl() });
const prisma = new PrismaClient({ adapter });

// Forward 12m EPS del S&P 500 (operating, consenso) -> ticker SPX_FWD_EPS en bt_market_data.
// Fuente oficial: Excel trimestral S&P Dow Jones "S&P 500 EPS Estimates"
// (https://www.spglobal.com/spdji/en/documents/additional-material/sp-500-eps-est.xlsx,
// bloquea descargas por script — 403 Akamai). Procedimiento cada trimestre:
// 1) descargar el xlsx con el navegador, 2) forward-12m EPS = suma de los próximos
// 4 trimestres estimados (columna de estimados, fila del quarter actual),
// 3) agregar fila `YYYY-MM-DD,fwd_eps,sp-global-eps-est` a source/sp500-forward-eps.csv,
// 4) re-correr este seed. Re-ejecutable: upsert por (ticker, date).
// La columna "Fwd PE" del frontend = precio SPX / SPX_FWD_EPS (igual que PE = SPX / SPX_EPS).
const CSV = path.resolve(__dirname, '../../../source/sp500-forward-eps.csv');

async function main() {
  const raw = fs.readFileSync(CSV, 'utf8').trim().split('\n');
  const rows: Array<{ date: string; eps: number; source: string }> = [];
  for (let i = 1; i < raw.length; i++) {
    const [date, eps, source] = raw[i].split(',').map(s => s.trim());
    const v = parseFloat(eps);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isFinite(v) || v <= 0) {
      throw new Error(`Fila inválida en sp500-forward-eps.csv línea ${i + 1}: ${raw[i]}`);
    }
    rows.push({ date, eps: parseFloat(v.toFixed(4)), source: source || 'sp-global-eps-est' });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`Parsed ${rows.length} forward-EPS entries ${rows[0].date} -> ${rows[rows.length - 1].date}`);
  let done = 0;
  for (const r of rows) {
    await prisma.btMarketData.upsert({
      where: { ticker_date: { ticker: 'SPX_FWD_EPS', date: new Date(r.date) } },
      update: { open: r.eps, high: r.eps, low: r.eps, close: r.eps, adjClose: r.eps, isValidated: true, source: r.source },
      create: { ticker: 'SPX_FWD_EPS', date: new Date(r.date), open: r.eps, high: r.eps, low: r.eps, close: r.eps, adjClose: r.eps, volume: BigInt(0), isValidated: true, source: r.source },
    });
    done++;
  }
  console.log(`done ${done} SPX_FWD_EPS rows`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
