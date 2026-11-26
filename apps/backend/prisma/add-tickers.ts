// Da de alta tickers nuevos en `tickers` con nombre y sector de Yahoo (el resto lo llenan los syncs):
//   SYMBOLS=ABNB,ADBE npx ts-node prisma/add-tickers.ts        [DRY=1 para solo mostrar]
// Después: POST /tickers/sync (precios desde 1997 y valuación), SYMBOLS=... prisma/sync-all-stocks-edgar.ts
// (trimestres EDGAR), prisma/seed-sector-terminal-pe.ts y el sync de GuruFocus Scrapper (POST /api/sync).
// Los que ya existen se omiten. Sectores con el nombre que usa la BD ('Financial', no 'Financial Services').
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import YahooFinance from 'yahoo-finance2';
import { databaseUrl } from './db-url';

const SECTOR_MAP: Record<string, string> = { 'Financial Services': 'Financial' };

async function main() {
  const symbols = (process.env.SYMBOLS ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!symbols.length) throw new Error('SYMBOLS vacío');
  const dry = process.env.DRY === '1';
  const pool = new Pool({ connectionString: databaseUrl() });
  const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
  const have = new Set((await pool.query('SELECT symbol FROM tickers')).rows.map((r) => r.symbol as string));
  const added: string[] = [], skipped: string[] = [], failed: string[] = [];
  for (const sym of symbols) {
    if (have.has(sym)) { skipped.push(sym); continue; }
    try {
      const y = sym.replace('.', '-');
      const q: any = await yf.quote(y);
      if (!q || q.regularMarketPrice == null) throw new Error('sin cotización');
      let sector = q.quoteType === 'ETF' ? 'Index' : null;
      if (!sector) {
        const s: any = await yf.quoteSummary(y, { modules: ['assetProfile'] }).catch(() => null);
        sector = s?.assetProfile?.sector ?? null;
      }
      if (!sector) throw new Error('sin sector');
      sector = SECTOR_MAP[sector] ?? sector;
      const name = q.longName ?? q.shortName ?? sym;
      console.log(`${dry ? '[DRY] ' : ''}${sym.padEnd(6)} ${sector.padEnd(24)} ${name}`);
      if (!dry) {
        await pool.query(
          `INSERT INTO tickers (id, symbol, name, price, change_percent, sector, buy_hold_index, recommendation, pe, dy, cap, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 70, 'Hold', $7, $8, $9, now())`,
          [randomUUID(), sym, name, q.regularMarketPrice, q.regularMarketChangePercent ?? 0, sector, q.trailingPE ?? 0,
            q.trailingAnnualDividendYield != null ? q.trailingAnnualDividendYield * 100 : 0, 'N/A'],
        );
      }
      added.push(sym);
    } catch (e: any) {
      failed.push(`${sym} (${String(e?.message ?? e).slice(0, 80)})`);
    }
  }
  console.log(`\nAgregados ${added.length}: ${added.join(',')}\nYa existían ${skipped.length}: ${skipped.join(',')}\nFallaron ${failed.length}: ${failed.join(' · ')}`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
