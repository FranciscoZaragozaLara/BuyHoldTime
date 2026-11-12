import { Injectable, Logger } from '@nestjs/common';
import { BACKTEST_DIR } from '../../config/backtest-dir';
import { Cron } from '@nestjs/schedule';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { restoreShillerCsvFromDb, SHILLER_CSV_PATH, syncShillerCsvToDb } from '../backtesting/shiller-daily';

/**
 * Construye la línea planchada del día `date` para shiller_daily.csv SIN asumir
 * posición de columnas. El CSV ganó la columna `pe` en 2ª posición (oct-2026);
 * el código anterior leía lastCols[1] como CAPE y publicaba el PE (~26) como
 * CAPE hasta que daily_update.py reconstruía el archivo — la card Schiller PE
 * mostraba 26.x tras sincronizar y 41+ al refrescar.
 */
/**
 * Ratio de planchado entre el último cierre hábil ≤ lastDate y el cierre de `d`.
 * Si falta alguno (fin de semana, día sin cierre aún) el ratio es 1: línea plana.
 * Regresión nov-2026: buscar el prev por fecha exacta devolvía null tras un fin
 * de semana y congelaba el CAPE del lunes aunque el SPX hubiera subido.
 */
export function planchadoRatioFor(closes: Map<string, number>, lastDate: string, d: string): { prev: number | null; cur: number | null; ratio: number } {
  // Último cierre con fecha ≤ lastDate (sábados/domingos no tienen fila).
  let prevKey: string | null = null;
  for (const k of closes.keys()) if (k <= lastDate && (prevKey == null || k > prevKey)) prevKey = k;
  const prev = prevKey == null ? null : (closes.get(prevKey) ?? null);
  const cur = closes.get(d) ?? null;
  if (prev != null && cur != null && prev !== 0) return { prev, cur, ratio: cur / prev };
  return { prev, cur, ratio: 1 };
}

/**
 * La línea de un día ya existente solo se reescribe si es el día objetivo
 * (hoy/último con cierre recién llegado). El resto histórico queda congelado.
 */
export function shouldRefreshLine(exists: boolean, d: string, targetDate: string): boolean {
  return exists && d === targetDate;
}

export function buildShillerPlanchadoLine(headerLine: string, lastLine: string, date: string, ratio: number, capeHistory: number[]): string {
  const header = headerLine.split(',');
  const last = lastLine.split(',');
  const at = (name: string, legacyIdx: number) => {
    const i = header.indexOf(name);
    return i >= 0 ? i : legacyIdx;
  };
  const capeI = at('cape', 1), peI = header.indexOf('pe');
  const sma3I = at('cape_sma3', 2), sma5I = at('cape_sma5', 3), sma10I = at('cape_sma10', 4);
  const ema3I = at('cape_ema3', 5), ema5I = at('cape_ema5', 6), ema10I = at('cape_ema10', 7);
  const num = (v: string | undefined) => { const n = parseFloat(v ?? ''); return isNaN(n) ? null : n; };
  const lastCape = num(last[capeI]);
  const lastPe = peI >= 0 ? num(last[peI]) : null;
  const newCape = lastCape == null ? NaN : (ratio !== 1 ? lastCape * ratio : lastCape);
  const newPe = lastPe == null ? null : (ratio !== 1 ? lastPe * ratio : lastPe);
  const vals = [...capeHistory.filter(v => !isNaN(v)).slice(-9)];
  if (!isNaN(newCape)) vals.push(newCape);
  const ema = (prev: number | null, span: number) => (prev ?? newCape) * (1 - 2 / (span + 1)) + newCape * 2 / (span + 1);
  const out = [...last];
  out[0] = date;
  out[capeI] = isNaN(newCape) ? last[capeI] : newCape.toFixed(5);
  if (peI >= 0 && newPe != null) out[peI] = newPe.toFixed(5);
  if (vals.length) {
    out[sma3I] = (vals.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, vals.length)).toFixed(5);
    out[sma5I] = (vals.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, vals.length)).toFixed(5);
    out[sma10I] = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(5);
  }
  if (!isNaN(newCape)) {
    out[ema3I] = ema(num(last[ema3I]), 3).toFixed(5);
    out[ema5I] = ema(num(last[ema5I]), 5).toFixed(5);
    out[ema10I] = ema(num(last[ema10I]), 10).toFixed(5);
  }
  return out.join(',');
}

@Injectable()
export class MarketSyncService {
  private readonly logger = new Logger(MarketSyncService.name);
  private readonly base = BACKTEST_DIR;
  private fullSyncRunning = false;
  constructor(private readonly prisma: PrismaService) {}

  // Unificación con POST /daily: el stream es el proceso completo on-demand.
  // Dispara daily_update.py en background (FINRA + CAPE daily + BH patch) sin
  // bloquear el SSE; el guard evita corridas concurrentes. Upserts idempotentes.
  private kickFullSyncBackground() {
    if (this.fullSyncRunning) {
      this.logger.log('Full sync ya en curso — se omite duplicado');
      return;
    }
    this.fullSyncRunning = true;
    this.logger.log('Full sync background start (daily_update.py + BH patch)');
    this.restoreShillerCsv()
      .then(() => this.runPython('daily_update.py', []))
      .then(() => this.patchBHPerformance())
      .then(() => this.syncShillerDb())
      .then(() => this.refreshThermoTail())
      .then(() => this.logger.log('Full sync background done'))
      .catch((e: any) => this.logger.error(`Full sync background failed: ${e.message?.slice(0, 200)}`))
      .finally(() => { this.fullSyncRunning = false; });
  }

  // CAPE diario: el CSV (/tmp) es solo intercambio con BackTesting; la fuente es
  // bt_shiller_daily. Si /tmp se borró (reinicio), se reconstruye desde la BD.
  private async restoreShillerCsv(): Promise<void> {
    try {
      const n = await restoreShillerCsvFromDb(this.prisma);
      if (n) this.logger.warn(`${SHILLER_CSV_PATH} no existía: reconstruido desde bt_shiller_daily (${n} filas)`);
    } catch (e: any) {
      this.logger.error(`No se pudo reconstruir ${SHILLER_CSV_PATH}: ${e.message?.slice(0, 200)}`);
    }
  }

  // Vuelca el CSV (regenerado por daily_update.py / planchado) a bt_shiller_daily. Nunca revienta el sync.
  private async syncShillerDb(): Promise<void> {
    try {
      const n = await syncShillerCsvToDb(this.prisma);
      if (n) this.logger.log(`bt_shiller_daily sincronizada (${n} filas del CSV)`);
      else this.logger.warn(`${SHILLER_CSV_PATH} no existe: bt_shiller_daily sin cambios`);
    } catch (e: any) {
      this.logger.error(`Sync bt_shiller_daily falló: ${e.message?.slice(0, 200)}`);
    }
  }

  // Cola del termómetro + BHT tras el sync: recalcula los últimos 7 días para que
  // las fechas nuevas no amanezcan con BHT vacío. Idempotente; nunca revienta el sync.
  private refreshThermoTail(): Promise<void> {
    const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    this.logger.log(`Thermo tail refresh desde ${from}`);
    return this.runTsScript('prisma/compute-thermo-history.ts', { FROM: from })
      .then(() => this.runTsScript('prisma/compute-bht-forward.ts', { FROM: from }))
      .then(() => this.logger.log('Thermo tail refresh done'))
      .catch((e: any) => this.logger.error(`Thermo tail refresh failed: ${e.message?.slice(0, 200)}`));
  }

  private runTsScript(script: string, extraEnv: Record<string, string>): Promise<void> {
    return new Promise((resolve, reject) => {
      let root = path.resolve(__dirname, '..', '..', '..');
      if (path.basename(root) === 'dist') root = path.resolve(root, '..');
      const proc = spawn('npx', ['ts-node', script], {
        cwd: root,
        env: { ...process.env, ...extraEnv },
      });
      let stderr = '';
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.stdout.on('data', (d) => this.logger.log(d.toString().trim()));
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exit ${code}: ${stderr.slice(0, 800)}`))));
    });
  }

  // L-V 22:05 America/New_York (tras cierre). Cambia a '0 30 8 * * *' si prefieres mañana.
  @Cron('5 22 * * 1-5', { timeZone: 'America/New_York' })
  async handleDailySync() {
    this.logger.log('Daily market sync start');
    try {
      await this.restoreShillerCsv();
      await this.runPython('daily_update.py', []);
      await this.patchBHPerformance();
      await this.syncShillerDb();
      await this.refreshThermoTail();
      this.logger.log('Daily market sync done');
    } catch (e: any) {
      this.logger.error(`Daily sync failed: ${e.message}`);
    }
  }

  // Amplitud S&P 500 diaria (constituyentes actuales — sesgo supervivencia declarado).
  // L-V 22:35 ET: refresca últimos 5 días de SPX_ADV_VOL/SPX_DEC_VOL (500 reqs gentiles, ~10 min en background).
  @Cron('35 22 * * 1-5', { timeZone: 'America/New_York' })
  async handleBreadthSync() {
    this.logger.log('Breadth sync start');
    try {
      await this.refreshSpxBreadth(10);
      this.logger.log('Breadth sync done');
    } catch (e: any) {
      this.logger.error(`Breadth sync failed: ${e.message}`);
    }
  }

  async refreshSpxBreadth(rangeDays = 10): Promise<{ tickers: number; days: number }> {
    const listPath = path.join(__dirname, 'spx-constituents.txt');
    const syms = fs.readFileSync(listPath, 'utf8').split('\n').map((s) => s.trim().replace(/\./g, '-')).filter(Boolean);
    const to = Math.floor(Date.now() / 1000);
    const from = to - rangeDays * 86400;
    const adv: Record<string, number> = {};
    const dec: Record<string, number> = {};
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let n = 0;
    for (const sym of syms) {
      let bars: any[] | null = null;
      for (let a = 1; a <= 4; a++) {
        try {
          const r: any = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=${from}&period2=${to}&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } as any, signal: AbortSignal.timeout(15000) } as any);
          if (r.status === 429) { await sleep(20000 * a); continue; }
          if (!r.ok) throw new Error(`Yahoo ${r.status}`);
          const j: any = await r.json();
          const res = j?.chart?.result?.[0];
          if (!res) throw new Error('sin datos');
          const q = res.indicators.quote[0];
          const adj = res.indicators.adjclose?.[0]?.adjclose || q.close;
          bars = res.timestamp.map((t: number, i: number) => ({ d: new Date(t * 1000).toISOString().slice(0, 10), c: adj[i], v: q.volume[i] || 0 }));
          break;
        } catch (e) { if (a === 4) break; await sleep(3000 * a); }
      }
      if (bars) {
        n++;
        let prev: number | null = null;
        for (const b of bars) {
          if (b.c == null) continue;
          if (prev != null) {
            if (b.c > prev) adv[b.d] = (adv[b.d] || 0) + b.v;
            else if (b.c < prev) dec[b.d] = (dec[b.d] || 0) + b.v;
          }
          prev = b.c;
        }
      }
      await sleep(1500);
    }
    for (const d of Object.keys({ ...adv, ...dec }).sort()) {
      for (const [tick, v] of [['SPX_ADV_VOL', adv[d] || 0], ['SPX_DEC_VOL', dec[d] || 0]] as const) {
        await this.prisma.btMarketData.upsert({
          where: { ticker_date: { ticker: tick, date: new Date(d) } },
          update: { open: v, high: v, low: v, close: v, adjClose: v, volume: BigInt(0), isValidated: true },
          create: { ticker: tick, date: new Date(d), open: v, high: v, low: v, close: v, adjClose: v, volume: BigInt(0), isValidated: true, source: 'yahoo-breadth' },
        });
      }
    }
    return { tickers: n, days: Object.keys({ ...adv, ...dec }).length };
  }

  // Endpoint manual para probar sin esperar al cron: POST /api/market-sync/daily
  async runNow(): Promise<{ ok: boolean; log: string }> {
    await this.restoreShillerCsv();
    await this.runPython('daily_update.py', []);
    await this.patchBHPerformance();
    await this.syncShillerDb();
    await this.refreshThermoTail();
    return { ok: true, log: 'sync ok' };
  }

  // Parchea btEquityCurve de BH/Régimen para que Performance Daily llegue hasta hoy (dinámico: descubre todas las estrategias)
  private async patchBHPerformance() {
    const strategies = await this.prisma.btStrategy.findMany();
    const inferTicker = (code: string, strat: any): string | undefined => {
      const explicit = (strat?.paramsSchema?.ticker as string | undefined)?.toUpperCase();
      if (explicit) return explicit;
      const c = code.toUpperCase();
      if (c.includes('SCHD')) return 'SCHD';
      if (c.includes('JEPQ')) return 'JEPQ';
      if (c.includes('SQQQ')) return 'SQQQ';
      if (c.includes('TQQQ')) return 'TQQQ';
      if (c.includes('VOO')) return 'VOO';
      if (c.includes('SPY')) return 'SPY';
      if (c.includes('QQQ')) return 'QQQ';
      return undefined;
    };
    const resolveInception = (strat: any): string => {
      const explicit = strat?.paramsSchema?.inception as string | undefined;
      if (explicit && /^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
      const ticker = inferTicker(strat.code, strat);
      const map: Record<string, string> = { TQQQ: '2010-02-11', QQQ: '1999-03-10', SPY: '1993-01-29', VOO: '2010-09-09', SCHD: '2011-10-20', JEPQ: '2022-05-03', SQQQ: '2010-02-11' };
      if (ticker && map[ticker]) return map[ticker];
      if (strat.code.includes('TQQQ')) return '2010-02-11';
      if (strat.code.includes('SPY')) return '1993-01-29';
      return '1993-01-29';
    };
    for (const strat of strategies) {
      const code = strat.code;
      const ticker = inferTicker(code, strat);
      if (!ticker) continue;
      const inception = resolveInception(strat as any);
      // Solo estrategias con run existente y que usan BH o Régimen (tienen equity)
      const runs = await this.prisma.btBacktestRun.findMany({ where: { strategyId: strat.id }, orderBy: { startDate: 'desc' } });
      const target = runs.find((r) => r.startDate.toISOString().slice(0, 10) === inception) || runs[0];
      if (!target) continue;
      const maxRow: any = await this.prisma.btEquityCurve.findFirst({ where: { runId: target.id }, orderBy: { date: 'desc' } });
      const maxDate = maxRow ? maxRow.date.toISOString().slice(0, 10) : inception;
      const today = new Date().toISOString().slice(0, 10);
      if (maxDate >= today) { this.logger.log(`Patch skip ${code}: ya al día (${maxDate})`); continue; }
      try {
        const isBH = code.includes('_BH') || code.startsWith('BH_');
        const script = (() => {
          const lower = code.toLowerCase();
          if (fs.existsSync(path.join(this.base, `run_${lower}.py`))) return `run_${lower}.py`;
          if (isBH) return 'run_generic_bh.py';
          if (fs.existsSync(path.join(this.base, `run_${ticker.toLowerCase()}_bh.py`))) return `run_${ticker.toLowerCase()}_bh.py`;
          return 'run_generic_bh.py';
        })();
        await this.runPythonWithEnv(script, [], { TICKER: ticker, START_DATE: inception });
        // Lee equity generado — dinámica según tipo
        const lower = code.toLowerCase();
        const candidates = isBH
          ? [`result_${ticker.toLowerCase()}_bh_${inception}_equity.json`, `result_${ticker.toLowerCase()}_bh_equity_full.json`, `result_${lower}_${inception}_equity.json`]
          : [`result_${lower}_${inception}_equity.json`, `result_${lower}_equity_full.json`, `result_${ticker.toLowerCase()}_bh_${inception}_equity.json`];
        let eq: any[] | null = null;
        for (const c of candidates) { const p = path.join(this.base, c); if (fs.existsSync(p)) { try { const raw = JSON.parse(fs.readFileSync(p, 'utf8')); eq = Array.isArray(raw) ? raw : raw.equity || null; if (eq && eq[0]?.portfolio_value != null) eq = eq.map((e:any)=>({ date: e.date, portfolioValue: e.portfolio_value })); break; } catch {} } }
        if (!eq || !eq.length) { this.logger.warn(`Patch skip ${code}: no equity file`); continue; }
        const missing = eq.filter((e: any) => (e.date || '').slice(0, 10) > maxDate);
        if (!missing.length) { this.logger.log(`Patch ${code}: ya al día (${maxDate})`); continue; }
        const allocCandidates = isBH
          ? [`result_${ticker.toLowerCase()}_bh_${inception}_allocations.json`]
          : [`result_${lower}_${inception}_allocations.json`, `result_${lower}_allocations.json`];
        let allocs: any[] = [];
        for (const c of allocCandidates) { const p = path.join(this.base, c); if (fs.existsSync(p)) { try { allocs = JSON.parse(fs.readFileSync(p, 'utf8')); break; } catch {} } }
        const allocByDate = new Map(allocs.map((a: any) => [(a.date || '').slice(0, 10), a]));
        for (const e of missing) {
          const d = (e.date || '').slice(0, 10);
          const a = allocByDate.get(d);
          await this.prisma.btEquityCurve.create({ data: { runId: target.id, date: new Date(d), portfolioValue: Number(e.portfolioValue ?? e.portfolio_value) } });
          if (a) {
            await this.prisma.btAllocation.create({
              data: {
                runId: target.id, date: new Date(d),
                tqqqPct: (a as any).tqqq_pct ?? (a as any).tqqqPct ?? 1,
                cashPct: (a as any).cash_pct ?? (a as any).cashPct ?? 0,
                tqqqValue: (a as any).tqqq_value ?? (a as any).tqqqValue ?? (a as any).schd_value ?? 0,
                cashValue: (a as any).cash_value ?? (a as any).cashValue ?? 0,
                portfolioValue: (a as any).portfolio_value ?? (a as any).portfolioValue,
                targetPct: (a as any).target_pct ?? (a as any).targetPct ?? null, indicators: (a as any).indicators ?? {},
              },
            });
          }
        }
        const last = eq[eq.length - 1];
        await this.prisma.btBacktestRun.update({ where: { id: target.id }, data: { endDate: new Date((last.date||'').slice(0,10)) } });
        if (last.portfolioValue) await this.prisma.btBacktestMetrics.updateMany({ where: { runId: target.id }, data: { finalValue: Number(last.portfolioValue ?? last.portfolio_value) } });
        this.logger.log(`Patch ${code}: +${missing.length} días hasta ${last.date} (desde ${maxDate})`);
      } catch (e: any) {
        this.logger.error(`Patch ${code} failed: ${e.message?.slice(0,300)}`);
      }
    }
  }

  private runPythonWithEnv(script: string, args: string[], extraEnv: Record<string, string>): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('python3', [path.join(this.base, script), ...args], {
        cwd: this.base,
        env: { ...process.env, ...extraEnv },
      });
      let stderr = '';
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.stdout.on('data', (d) => this.logger.log(d.toString().trim()));
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exit ${code}: ${stderr.slice(0,800)}`))));
    });
  }

  private runPython(script: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('python3', [path.join(this.base, script), ...args], {
        cwd: this.base,
        env: { ...process.env, TICKERS: process.env.TICKERS || 'TQQQ,QQQ,SCHD,JEPQ,SQQQ,VOO,SPY,^GSPC,^IXIC' },
      });
      let stderr = '';
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.stdout.on('data', (d) => this.logger.log(d.toString().trim()));
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exit ${code}: ${stderr.slice(0,800)}`))));
    });
  }

  // Streaming incremental refresh for UI modal — emits per-indicator log with before/after
  async streamRefresh(res: any) {
    const indicators: Array<{
      ticker: string;
      name: string;
      purpose: string;
      source: string;
      api: string;
      kind: 'yahoo' | 'fred' | 'finra' | 'cape' | 'cnn' | 'wsj';
    }> = [
      { ticker: 'TQQQ', name: 'TQQQ', purpose: 'Precio TQQQ 3x Nasdaq — subyacente apalancado', source: 'yfinance', api: 'https://query1.finance.yahoo.com/v8/finance/chart/TQQQ', kind: 'yahoo' },
      { ticker: 'QQQ', name: 'QQQ', purpose: 'Nasdaq 100 ETF — referencia Nasdaq', source: 'yfinance', api: 'https://query1.finance.yahoo.com/v8/finance/chart/QQQ', kind: 'yahoo' },
      { ticker: 'SPY', name: 'SPY', purpose: 'S&P 500 ETF — mercado amplio', source: 'yfinance', api: 'https://query1.finance.yahoo.com/v8/finance/chart/SPY', kind: 'yahoo' },
      { ticker: 'VOO', name: 'VOO', purpose: 'S&P 500 Vanguard — alternativo SPY', source: 'yfinance', api: 'https://query1.finance.yahoo.com/v8/finance/chart/VOO', kind: 'yahoo' },
      { ticker: 'SCHD', name: 'SCHD', purpose: 'Dividendos USA — factor defensivo', source: 'yfinance', api: 'https://query1.finance.yahoo.com/v8/finance/chart/SCHD', kind: 'yahoo' },
      { ticker: 'JEPQ', name: 'JEPQ', purpose: 'Nasdaq con covered calls', source: 'yfinance', api: 'https://query1.finance.yahoo.com/v8/finance/chart/JEPQ', kind: 'yahoo' },
      { ticker: 'SQQQ', name: 'SQQQ', purpose: 'Inverso Nasdaq 3x — cobertura', source: 'yfinance', api: 'https://query1.finance.yahoo.com/v8/finance/chart/SQQQ', kind: 'yahoo' },
      { ticker: '^GSPC', name: '^GSPC', purpose: 'S&P 500 índice — SMA50/100 y CPI perf', source: 'yfinance', api: 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC', kind: 'yahoo' },
      { ticker: '^IXIC', name: '^IXIC', purpose: 'Nasdaq Composite — momentum tecnológico', source: 'yfinance', api: 'https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC', kind: 'yahoo' },
      { ticker: 'DFEDTARU', name: 'DFEDTARU', purpose: 'Fed Funds Upper — carry SGOV y G1/G2', source: 'FRED', api: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFEDTARU', kind: 'fred' },
      { ticker: 'DGS2', name: 'DGS2', purpose: 'Treasury 2Y — curva', source: 'FRED', api: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS2', kind: 'fred' },
      { ticker: 'DGS10', name: 'DGS10', purpose: 'Treasury 10Y — G1 1.10 y régimen', source: 'FRED', api: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10', kind: 'fred' },
      { ticker: 'DGS30', name: 'DGS30', purpose: 'Treasury 30Y — curva larga', source: 'FRED', api: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS30', kind: 'fred' },
      { ticker: 'MSACSR', name: 'MSACSR', purpose: 'Meses inventario casas nuevas — mercado vivienda', source: 'FRED', api: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=MSACSR', kind: 'fred' },
      { ticker: 'VIXCLS', name: 'VIX', purpose: 'VIX volatilidad implícita S&P 500 — sentimiento', source: 'FRED', api: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS', kind: 'fred' },
      { ticker: 'FEAR_GREED', name: 'FEAR_GREED', purpose: 'CNN Fear & Greed — sentimiento mercado', source: 'CNN', api: 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata', kind: 'cnn' },
      { ticker: 'NYSE_ADV_VOL', name: 'NYSE_ADV_VOL', purpose: 'Volumen avance NYSE — amplitud', source: 'WSJ', api: 'https://www.wsj.com/market-data/stocks/marketsdiary?id=%7B%22application%22%3A%22WSJ%22%2C%22marketsDiaryType%22%3A%22diaries%22%7D&type=mdc_marketsdiary', kind: 'wsj' },
      { ticker: 'NYSE_DEC_VOL', name: 'NYSE_DEC_VOL', purpose: 'Volumen retroceso NYSE — amplitud', source: 'WSJ', api: 'https://www.wsj.com/market-data/stocks/marketsdiary?id=%7B%22application%22%3A%22WSJ%22%2C%22marketsDiaryType%22%3A%22diaries%22%7D&type=mdc_marketsdiary', kind: 'wsj' },
      { ticker: 'NSDQ_ADV_VOL', name: 'NSDQ_ADV_VOL', purpose: 'Volumen avance Nasdaq — amplitud', source: 'WSJ', api: 'https://www.wsj.com/market-data/stocks/marketsdiary?id=%7B%22application%22%3A%22WSJ%22%2C%22marketsDiaryType%22%3A%22diaries%22%7D&type=mdc_marketsdiary', kind: 'wsj' },
      { ticker: 'NSDQ_DEC_VOL', name: 'NSDQ_DEC_VOL', purpose: 'Volumen retroceso Nasdaq — amplitud', source: 'WSJ', api: 'https://www.wsj.com/market-data/stocks/marketsdiary?id=%7B%22application%22%3A%22WSJ%22%2C%22marketsDiaryType%22%3A%22diaries%22%7D&type=mdc_marketsdiary', kind: 'wsj' },
      { ticker: 'BAMLH0A0HYM2', name: 'BAMLH0A0HYM2', purpose: 'HY OAS — complacencia crediticia G1-G4', source: 'FRED', api: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2', kind: 'fred' },
      { ticker: 'BAMLH0A0HYM2EY', name: 'BAMLH0A0HYM2EY', purpose: 'HY Effective Yield — spread + yield', source: 'FRED', api: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2EY', kind: 'fred' },
      { ticker: 'CPIAUCSL', name: 'CPIAUCSL', purpose: 'CPI YoY — inflación headline', source: 'FRED', api: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL', kind: 'fred' },
      { ticker: 'CPILFESL', name: 'CPILFESL', purpose: 'Core CPI YoY — F0/G2/G4 régimen', source: 'FRED', api: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPILFESL', kind: 'fred' },
      { ticker: 'GDP', name: 'GDP', purpose: 'PIB nominal — Margin/GDP', source: 'FRED', api: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=GDP', kind: 'fred' },
      { ticker: 'GDPC1', name: 'GDPC1', purpose: 'PIB real — contexto macro', source: 'FRED', api: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=GDPC1', kind: 'fred' },
      { ticker: 'FINRA_DEBIT', name: 'FINRA_DEBIT', purpose: 'Margin Debt FINRA — apalancamiento Z', source: 'FINRA', api: 'https://www.finra.org/sites/default/files/2021-03/margin-statistics.xlsx', kind: 'finra' },
      { ticker: 'M2SL', name: 'M2SL', purpose: 'M2 oferta monetaria — liquidez semáforo', source: 'FRED', api: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=M2SL', kind: 'fred' },
      { ticker: 'BOGMBASE', name: 'BOGMBASE', purpose: 'Base monetaria M0 — inyección Fed semáforo', source: 'FRED', api: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=BOGMBASE', kind: 'fred' },
      { ticker: 'DCOILWTICO', name: 'DCOILWTICO', purpose: 'WTI petróleo — shock inflación semáforo', source: 'FRED', api: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILWTICO', kind: 'fred' },
      { ticker: 'CAPE', name: 'CAPE', purpose: 'Shiller CAPE — valuación R1', source: 'Shiller', api: '/tmp/shiller_daily.csv (build_shiller_daily)', kind: 'cape' },
    ];

    const send = (obj: any) => {
      try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch {}
    };
    let clientClosed = false;
    try { res.on('close', () => { clientClosed = true; }); } catch {}

    // Mismo proceso completo que POST /daily: FINRA + CAPE daily + BH patch en background
    this.kickFullSyncBackground();

    try {
    for (const ind of indicators) {
      const startTs = Date.now();
      send({ type: 'start', ticker: ind.ticker, name: ind.name, purpose: ind.purpose, source: ind.source, api: ind.api, status: 'updating' });
      let before: any = null;
      let beforeDate: string | null = null;
      try {
        if (ind.kind !== 'cape') {
          const row: any = await this.prisma.btMarketData.findFirst({ where: { ticker: ind.ticker }, orderBy: { date: 'desc' } });
          if (row) { before = Number(row.close); beforeDate = row.date.toISOString().slice(0, 10); }
        } else {
          // CAPE: read last file value as before
          try {
            const capes = await this.prisma.$queryRawUnsafe(`SELECT current_value FROM indicators WHERE key='schiller_pe' LIMIT 1`) as any[];
            if (capes?.[0]?.current_value != null) before = Number(capes[0].current_value);
          } catch {}
        }
      } catch {}
      let daysExtracted = 0;
      let after: number | null = null;
      let afterDate: string | null = null;
      let status: 'success' | 'error' = 'success';
      let errorMsg: string | null = null;
      try {
        if (ind.kind === 'yahoo' || ind.kind === 'fred') {
          // For yahoo/fred we can reuse daily_update per ticker but to keep incremental we call Node fetch + upsert
          if (ind.kind === 'yahoo') {
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ind.ticker)}?interval=1d&range=1mo`;
            let r: any;
            {
              const ac = new AbortController();
              const to = setTimeout(() => { try { ac.abort(); } catch {} }, 8000);
              try {
                r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } as any, signal: ac.signal as any } as any);
              } finally { clearTimeout(to); }
            }
            if (!r.ok) throw new Error(`yahoo ${r.status}`);
            const j: any = await r.json();
            const result = j?.chart?.result?.[0];
            const closes: number[] = result?.indicators?.quote?.[0]?.close || [];
            const highs: number[] = result?.indicators?.quote?.[0]?.high || [];
            const lows: number[] = result?.indicators?.quote?.[0]?.low || [];
            const opens: number[] = result?.indicators?.quote?.[0]?.open || [];
            const volumes: number[] = result?.indicators?.quote?.[0]?.volume || [];
            const timestamps: number[] = result?.timestamp || [];
            let upserts = 0;
            for (let i = 0; i < timestamps.length; i++) {
              const c = closes[i];
              if (c == null || isNaN(c)) continue;
              const d = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
              const o = opens[i] ?? c, h = highs[i] ?? c, l = lows[i] ?? c, v = volumes[i] ?? 0;
              await this.prisma.btMarketData.upsert({
                where: { ticker_date: { ticker: ind.ticker, date: new Date(d) } },
                update: { open: Number(o), high: Number(h), low: Number(l), close: Number(c), adjClose: Number(c), volume: BigInt(Math.round(Number(v) || 0)), isValidated: true },
                create: { ticker: ind.ticker, date: new Date(d), open: Number(o), high: Number(h), low: Number(l), close: Number(c), adjClose: Number(c), volume: BigInt(Math.round(Number(v) || 0)), isValidated: true, source: 'yfinance' },
              });
              upserts++;
              after = Number(c); afterDate = d;
            }
            daysExtracted = upserts; // yahoo cubre ~22 días (10 previos incluidos) con upsert -> plancha parcial a final
          } else if (ind.kind === 'fred') {
            const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(ind.ticker)}&cosd=1990-01-01`;
            let r: any;
            {
              const ac = new AbortController();
              const to = setTimeout(() => { try { ac.abort(); } catch {} }, 10000);
              try {
                r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } as any, signal: ac.signal as any } as any);
              } finally { clearTimeout(to); }
            }
            if (!r.ok) throw new Error(`FRED ${r.status}`);
            const text = await r.text();
            const lines = text.trim().split('\n');
            let upserts = 0;
            for (let i = 1; i < lines.length; i++) {
              const line = lines[i].trim(); if (!line) continue;
              const parts = line.split(',');
              const d = (parts[0] || '').slice(0, 10);
              const v = parseFloat(parts[1]);
              if (!d || isNaN(v)) continue;
              // only last 60 for incremental performance, but count total for daysExtracted if needed
              const isRecent = i >= lines.length - 60;
              if (!isRecent) continue;
              await this.prisma.btMarketData.upsert({
                where: { ticker_date: { ticker: ind.ticker, date: new Date(d) } },
                update: { open: v, high: v, low: v, close: v, adjClose: v, volume: BigInt(0), isValidated: true },
                create: { ticker: ind.ticker, date: new Date(d), open: v, high: v, low: v, close: v, adjClose: v, volume: BigInt(0), isValidated: true, source: 'fred' },
              });
              upserts++;
              after = v; afterDate = d;
            }
            daysExtracted = upserts;
            // fallback after from last line if not recent
            if (after == null) {
              for (let i = lines.length - 1; i >= 1; i--) {
                const parts = lines[i].split(',');
                const v = parseFloat(parts[1]);
                if (!isNaN(v)) { after = v; afterDate = parts[0].slice(0, 10); break; }
              }
            }
          }
        } else if (ind.kind === 'cnn') {
          // CNN Fear & Greed: requiere headers de navegador (418 sin ellos). Solo últimos 60 como fred.
          const r: any = await fetch(ind.api, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 'Accept': 'application/json', 'Referer': 'https://www.cnn.com/markets/fear-and-greed' } as any, signal: AbortSignal.timeout(12000) } as any);
          if (!r.ok) throw new Error(`CNN ${r.status}`);
          const cj: any = await r.json();
          const pts: any[] = cj?.fear_and_greed_historical?.data || [];
          let upserts = 0;
          for (let i = 0; i < pts.length; i++) {
            const v = Number(pts[i]?.y);
            if (!isFinite(v)) continue;
            const d = new Date(Number(pts[i]?.x)).toISOString().slice(0, 10);
            const isRecent = i >= pts.length - 60;
            if (!isRecent) continue;
            await this.prisma.btMarketData.upsert({
              where: { ticker_date: { ticker: ind.ticker, date: new Date(d) } },
              update: { open: v, high: v, low: v, close: v, adjClose: v, volume: BigInt(0), isValidated: true },
              create: { ticker: ind.ticker, date: new Date(d), open: v, high: v, low: v, close: v, adjClose: v, volume: BigInt(0), isValidated: true, source: 'cnn' },
            });
            upserts++;
            after = v; afterDate = d;
          }
          daysExtracted = upserts;
        } else if (ind.kind === 'wsj') {
          // WSJ Market Diary: volúmenes avance/retroceso (acciones) NYSE + Nasdaq, solo sesión actual.
          const wmap: Record<string, [string, string]> = {
            NYSE_ADV_VOL: ['NYSE', 'advvolume'], NYSE_DEC_VOL: ['NYSE', 'declvolume'],
            NSDQ_ADV_VOL: ['NASDAQ', 'advvolume'], NSDQ_DEC_VOL: ['NASDAQ', 'declvolume'],
          };
          const [setLabel, insId] = wmap[ind.ticker] || [];
          if (!setLabel) throw new Error(`WSJ sin mapeo ${ind.ticker}`);
          const r: any = await fetch(ind.api, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 'Accept': 'application/json' } as any, signal: AbortSignal.timeout(12000) } as any);
          if (!r.ok) throw new Error(`WSJ ${r.status}`);
          const wj: any = await r.json();
          const sets: any[] = wj?.data?.instrumentSets || [];
          const set = sets.find((x: any) => (x?.headerFields?.[0]?.label || '') === setLabel);
          // composite ("Adv. volume") sobre primary ("Adv. volume*")
          const ins = (set?.instruments || []).find((x: any) => x?.id === insId && !(x?.name || '').endsWith('*'))
            || (set?.instruments || []).find((x: any) => x?.id === insId);
          const v = ins?.latestClose != null ? Number(String(ins.latestClose).replace(/,/g, '')) : NaN;
          if (!isFinite(v)) throw new Error(`WSJ sin dato ${ind.ticker}`);
          const ts: string = wj?.data?.timestamp || '';
          const parsed = ts ? new Date(ts) : new Date();
          const d = isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
          await this.prisma.btMarketData.upsert({
            where: { ticker_date: { ticker: ind.ticker, date: new Date(d) } },
            update: { open: v, high: v, low: v, close: v, adjClose: v, volume: BigInt(0), isValidated: true },
            create: { ticker: ind.ticker, date: new Date(d), open: v, high: v, low: v, close: v, adjClose: v, volume: BigInt(0), isValidated: true, source: 'wsj' },
          });
          daysExtracted = 1;
          after = v; afterDate = d;
        } else if (ind.kind === 'finra') {
          // FINRA no bloquea SSE: solo lectura DB, python va en background via patchBH/cron
          // no await runPython
          // after value from DB
          const row: any = await this.prisma.btMarketData.findFirst({ where: { ticker: ind.ticker }, orderBy: { date: 'desc' } });
          if (row) { after = Number(row.close); afterDate = row.date.toISOString().slice(0, 10); }
          daysExtracted = 1;
        } else if (ind.kind === 'cape') {
          // CAPE no bloquea SSE: solo lectura indicators, build_shiller_daily va en cron/background
          // no await runPython
          try {
            const rows: any[] = await this.prisma.$queryRawUnsafe(`SELECT current_value FROM indicators WHERE key='schiller_pe' LIMIT 1`) as any[];
            if (rows?.[0]?.current_value != null) { after = Number(rows[0].current_value); afterDate = new Date().toISOString().slice(0, 10); }
          } catch {}
          daysExtracted = 1;
        }
        if (after == null) {
          const row: any = await this.prisma.btMarketData.findFirst({ where: { ticker: ind.ticker }, orderBy: { date: 'desc' } });
          if (row) { after = Number(row.close); afterDate = row.date.toISOString().slice(0, 10); }
        }
      } catch (e: any) {
        status = 'error';
        errorMsg = e.message?.slice(0, 300) || String(e);
      }
      const nominal = before != null && after != null ? after - before : null;
      const pct = before != null && after != null && before !== 0 ? (after / before - 1) * 100 : null;
      // if not yet fetched after, keep before as after with 0 diff
      if (after == null && before != null) { after = before; afterDate = beforeDate; daysExtracted = 0; }
      send({
        type: 'progress',
        ticker: ind.ticker,
        name: ind.name,
        purpose: ind.purpose,
        source: ind.source,
        api: ind.api,
        daysExtracted,
        before,
        beforeDate,
        after,
        afterDate,
        nominal,
        pct,
        status,
        error: errorMsg,
        durationMs: Date.now() - startTs,
      });
      if (clientClosed) break;
      // small delay to make incremental visible
      await new Promise((r) => setTimeout(r, 120));
    }
    } catch (e:any) { try { send({ type: 'progress', ticker: 'SYSTEM', status: 'error', error: String(e?.message||e).slice(0,400)}); } catch {} }
    // Generar valores diarios completos con lo más reciente para Today (sincrónico, antes de done)
    // 1) extender shiller_daily.csv a Today (loop, planchado)
    try {
      const fs = await import('fs');
      const csvPath = SHILLER_CSV_PATH;
      await this.restoreShillerCsv();
      if (fs.existsSync(csvPath)) {
        let raw = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
        let lastLine = raw[raw.length-1];
        let lastDate = lastLine.split(',')[0].slice(0,10);
        const gspc: any = await this.prisma.btMarketData.findFirst({ where: { ticker: '^GSPC' }, orderBy: { date: 'desc' } });
        if (gspc) {
          const gspcDate = gspc.date.toISOString().slice(0,10);
          const today = new Date().toISOString().slice(0,10);
          const targetDate = gspcDate > today ? gspcDate : today;
          // Cierres recientes una sola vez (el prev debe tolerar fines de semana).
          const backFrom = new Date(lastDate); backFrom.setDate(backFrom.getDate() - 10);
          const gspcRecent: any[] = await this.prisma.btMarketData.findMany({ where: { ticker: '^GSPC', date: { gte: backFrom, lte: new Date(targetDate) } }, orderBy: { date: 'asc' } });
          const closeMap = new Map(gspcRecent.map((m: any) => [m.date.toISOString().slice(0, 10), Number(m.close)]));
          // La cola ya es el día objetivo pero pudo crearse plana (sin su cierre):
          // en ese caso también se entra para reescribirla.
          const tailIsTarget = raw[raw.length-1].startsWith(targetDate + ',');
          const needTailRefresh = tailIsTarget && closeMap.has(targetDate);
          // Si lastDate < targetDate, planchar cada día hábil faltante
          if (targetDate > lastDate || needTailRefresh) {
            const missing: any[] = await this.prisma.btMarketData.findMany({ where: { ticker: '^GSPC', date: { gt: new Date(lastDate), lte: new Date(targetDate) } }, orderBy: { date: 'asc' } });
            // Si no hay ^GSPC para el rango (fin de semana), crear al menos Today planchado
            const datesToCreate = missing.length ? missing.map((m:any)=> m.date.toISOString().slice(0,10)) : [];
            // Si Today es hábil y no está en missing, añadirlo
            // T12:00 evita que UTC-medianoche caiga en el día anterior (CST) y un lunes parezca domingo.
            const todayWeekday = new Date(targetDate + 'T12:00:00').getDay();
            if (todayWeekday>=1 && todayWeekday<=5 && !datesToCreate.includes(targetDate) && targetDate > lastDate) {
              datesToCreate.push(targetDate);
            }
            if (needTailRefresh && !datesToCreate.includes(targetDate)) datesToCreate.push(targetDate);
            let fileChanged = false;
            for (const d of datesToCreate) {
              const exIdx = raw.findIndex(l=> l.startsWith(d+','));
              if (exIdx >= 0 && !shouldRefreshLine(true, d, targetDate)) continue; // histórico congelado
              if (exIdx >= 0) raw.splice(exIdx, 1); // el día objetivo se reescribe con el cierre
              lastLine = raw[raw.length-1]; lastDate = lastLine.split(',')[0].slice(0,10);
              const { ratio } = planchadoRatioFor(closeMap, lastDate, d);
              const capeIdx = raw[0].split(',').indexOf('cape');
              const ci = capeIdx >= 0 ? capeIdx : 1;
              const capeVals = raw.slice(1).map(l=> parseFloat(l.split(',')[ci])).filter(v=>!isNaN(v)).slice(-9);
              const newLine = buildShillerPlanchadoLine(raw[0], lastLine, d, ratio, capeVals);
              raw.push(newLine);
              lastLine = newLine;
              lastDate = d;
              fileChanged = true;
            }
            // Si aún falta Today por ser fin de semana sin ^GSPC, planchar
            if (targetDate > lastDate) {
              const wd = new Date(targetDate + 'T12:00:00').getDay();
              if (wd>=1 && wd<=5) {
                const lastCols = lastLine.split(',');
                const newLine = [targetDate, ...lastCols.slice(1)].join(',');
                // evitar duplicado
                if (!raw.some(l=> l.startsWith(targetDate+','))) {
                  raw.push(newLine);
                  fileChanged = true;
                }
              }
            }
            if (fileChanged) {
              fs.writeFileSync(csvPath, raw.join('\n') + '\n');
              await this.syncShillerDb();
            }
          }
        }
      }
    } catch {}
    // patch BH y equity sincrónico también para Today (rápido, ratio)
    try {
      const gspc: any = await this.prisma.btMarketData.findFirst({ where: { ticker: '^GSPC' }, orderBy: { date: 'desc' } });
      if (gspc) {
        const latest = gspc.date.toISOString().slice(0,10);
        const runs: any[] = await this.prisma.btBacktestRun.findMany({ where: { endDate: { lt: new Date(latest) } } });
        for (const r of runs) {
          const strat: any = await this.prisma.btStrategy.findUnique({ where: { id: r.strategyId } });
          if (!strat) continue;
          const code = strat.code as string;
          let ticker: string | undefined = (strat.paramsSchema as any)?.ticker;
          if (!ticker) {
            const c = code.toUpperCase();
            if (c.includes('TQQQ')) ticker='TQQQ';
            else if (c.includes('SPY')) ticker='SPY';
            else if (c.includes('QQQ')) ticker='QQQ';
            else if (c.includes('VOO')) ticker='VOO';
            else if (c.includes('SCHD')) ticker='SCHD';
            else if (c.includes('JEPQ')) ticker='JEPQ';
            else if (c.includes('SQQQ')) ticker='SQQQ';
            else continue;
          }
          ticker = ticker.toUpperCase();
          // extender día a día hasta latest
          const lastEq: any = await this.prisma.btEquityCurve.findFirst({ where: { runId: r.id }, orderBy: { date: 'desc' } });
          if (!lastEq) continue;
          let curDate = lastEq.date.toISOString().slice(0,10);
          const missingEq: any[] = await this.prisma.btMarketData.findMany({ where: { ticker, date: { gt: new Date(curDate), lte: new Date(latest) } }, orderBy: { date: 'asc' } });
          for (const md of missingEq) {
            const d = md.date.toISOString().slice(0,10);
            const prevMd: any = await this.prisma.btMarketData.findFirst({ where: { ticker, date: new Date(curDate) } });
            let ratio = 1;
            if (prevMd) ratio = Number(md.close) / Number(prevMd.close);
            const lastVal: any = await this.prisma.btEquityCurve.findFirst({ where: { runId: r.id }, orderBy: { date: 'desc' } });
            const newVal = Number(lastVal.portfolioValue) * ratio;
            const exists: any = await this.prisma.btEquityCurve.findFirst({ where: { runId: r.id, date: new Date(d) } });
            if (exists) await this.prisma.btEquityCurve.update({ where: { id: exists.id }, data: { portfolioValue: newVal } });
            else await this.prisma.btEquityCurve.create({ data: { runId: r.id, date: new Date(d), portfolioValue: newVal } });
            await this.prisma.btBacktestRun.update({ where: { id: r.id }, data: { endDate: new Date(d) } });
            await this.prisma.btBacktestMetrics.updateMany({ where: { runId: r.id }, data: { finalValue: newVal } });
            curDate = d;
          }
        }
      }
    } catch {}
    // Cola del termómetro + BHT hasta hoy antes de cerrar el stream,
    // para que la tabla pinte el registro del día sin recargar la página.
    try { await this.refreshThermoTail(); } catch {}
    try { send({ type: 'done' }); } catch {}
    try { res.end(); } catch {}
    // en background por si algo faltó, reintentar patchBH completo
    (async () => {
      try {
        // 2) extender equity curves de todos los runs al último market_data de su ticker
        try { await this.patchBHPerformance(); } catch {}
        // 3) asegurar que runs con end_date < gspcDate se extiendan vía ratio (fallback si patchBH no cubrió)
        try {
          const gspc: any = await this.prisma.btMarketData.findFirst({ where: { ticker: '^GSPC' }, orderBy: { date: 'desc' } });
          if (gspc) {
            const latest = gspc.date.toISOString().slice(0,10);
            const runs: any[] = await this.prisma.btBacktestRun.findMany({ where: { endDate: { lt: new Date(latest) } } });
            for (const r of runs) {
              const strat: any = await this.prisma.btStrategy.findUnique({ where: { id: r.strategyId } });
              if (!strat) continue;
              const code = strat.code as string;
              let ticker: string | undefined = (strat.paramsSchema as any)?.ticker;
              if (!ticker) {
                const c = code.toUpperCase();
                if (c.includes('TQQQ')) ticker='TQQQ';
                else if (c.includes('SPY')) ticker='SPY';
                else if (c.includes('QQQ')) ticker='QQQ';
                else if (c.includes('VOO')) ticker='VOO';
                else if (c.includes('SCHD')) ticker='SCHD';
                else if (c.includes('JEPQ')) ticker='JEPQ';
                else if (c.includes('SQQQ')) ticker='SQQQ';
                else continue;
              }
              ticker = ticker.toUpperCase();
              const lastEq: any = await this.prisma.btEquityCurve.findFirst({ where: { runId: r.id }, orderBy: { date: 'desc' } });
              if (!lastEq) continue;
              const lastDate = lastEq.date.toISOString().slice(0,10);
              if (lastDate >= latest) continue;
              const cLast: any = await this.prisma.btMarketData.findFirst({ where: { ticker, date: new Date(lastDate) } });
              const cLatest: any = await this.prisma.btMarketData.findFirst({ where: { ticker, date: new Date(latest) } });
              if (!cLast || !cLatest) continue;
              const ratio2 = Number(cLatest.close) / Number(cLast.close);
              const newVal = Number(lastEq.portfolioValue) * ratio2;
              const exists: any = await this.prisma.btEquityCurve.findFirst({ where: { runId: r.id, date: new Date(latest) } });
              if (exists) await this.prisma.btEquityCurve.update({ where: { id: exists.id }, data: { portfolioValue: newVal } });
              else await this.prisma.btEquityCurve.create({ data: { runId: r.id, date: new Date(latest), portfolioValue: newVal } });
              await this.prisma.btBacktestRun.update({ where: { id: r.id }, data: { endDate: new Date(latest) } });
              await this.prisma.btBacktestMetrics.updateMany({ where: { runId: r.id }, data: { finalValue: newVal } });
            }
          }
        } catch {}
      } catch {}
    })();
  }
}
