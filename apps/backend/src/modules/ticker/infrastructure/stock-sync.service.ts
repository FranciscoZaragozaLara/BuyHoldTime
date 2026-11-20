import { Injectable, Logger, Optional } from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import { logSourceRun } from '../../admin/data-source-runs';
import { applyEdgarLine, applyGuruStatus, emptyPhase, NOTHING_PENDING, type GuruStatus, type SyncPhase } from './stock-sync-progress';

/**
 * Sincronización de acciones bajo demanda (botón del panel admin), en segundo plano y en paralelo:
 *  - GuruFocus: lanza el job unificado del GuruFocus Scrapper (POST {GURUFOCUS_API_URL}/api/sync con
 *    x-api-key = GURUFOCUS_API_KEY) y consulta su estado cada 10 s. Sin clave o sin servicio, la fase se omite.
 *  - Informes trimestrales: corre `prisma/sync-all-stocks-edgar.ts` (SEC EDGAR, el mismo del cron del domingo)
 *    y lee su salida para el avance.
 * El estado vive en memoria (se pierde al reiniciar el backend; los datos ya escritos se quedan).
 */
@Injectable()
export class StockSyncService {
  private readonly logger = new Logger(StockSyncService.name);
  private startedAt: string | null = null;
  private finishedAt: string | null = null;
  private gurufocus: SyncPhase = emptyPhase();
  private edgar: SyncPhase = emptyPhase();

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  get running(): boolean {
    return this.gurufocus.state === 'running' || this.edgar.state === 'running';
  }

  status() {
    return { running: this.running, startedAt: this.startedAt, finishedAt: this.finishedAt, gurufocus: this.gurufocus, edgar: this.edgar };
  }

  /** Lanza ambas fases sin esperar. Si ya hay una corriendo, no duplica. */
  start(): { started: boolean } & ReturnType<StockSyncService['status']> {
    if (this.running) return { started: false, ...this.status() };
    this.startedAt = new Date().toISOString();
    this.finishedAt = null;
    this.gurufocus = { ...emptyPhase(), state: 'running', startedAt: this.startedAt };
    this.edgar = { ...emptyPhase(), state: 'running', startedAt: this.startedAt };
    const done = () => { if (!this.running) this.finishedAt = new Date().toISOString(); };
    void this.runGuruFocus().finally(done);
    void this.runEdgar().finally(done);
    return { started: true, ...this.status() };
  }

  // ── GuruFocus ──────────────────────────────────────────────────────────────
  private async runGuruFocus(): Promise<void> {
    const p = this.gurufocus;
    const base = (process.env.GURUFOCUS_API_URL || 'http://localhost:5001').replace(/\/+$/, '');
    const key = process.env.GURUFOCUS_API_KEY;
    const end = (state: SyncPhase['state'], message: string) => { p.state = state; p.message = message; p.finishedAt = new Date().toISOString(); };
    if (!key) return end('skipped', 'GURUFOCUS_API_KEY no configurada en el backend');
    try {
      const res = await fetch(`${base}/api/sync`, { method: 'POST', headers: { 'x-api-key': key }, signal: AbortSignal.timeout(15_000) });
      if (res.status === 404) return end('error', 'Esta versión de GuruFocus no tiene POST /api/sync: reinicia el GuruFocus Scrapper');
      if (!res.ok) return end('error', `GuruFocus respondió ${res.status}${res.status === 401 ? ' (revisa GURUFOCUS_API_KEY)' : ''}`);
      const j = (await res.json().catch(() => ({}))) as { started?: boolean };
      if (j.started === false) {
        // Ya había un sync corriendo (cron de las 6 AM o manual): se sigue ese.
        const st = await this.guruStatus(base);
        if (st?.lastStartedAt) p.startedAt = st.lastStartedAt;
        p.message = 'Ya había un sync de GuruFocus en curso; se muestra su avance';
      }
    } catch (e: any) {
      return end('error', `GuruFocus no responde en ${base} (${String(e?.message ?? e).slice(0, 80)})`);
    }
    // Hasta 6 h: el scrape va con pausas entre acciones.
    const deadline = Date.now() + 6 * 3600_000;
    let misses = 0;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10_000));
      const st = await this.guruStatus(base);
      if (!st) { if (++misses >= 6) return end('error', 'Se perdió la conexión con GuruFocus'); continue; }
      misses = 0;
      if (applyGuruStatus(p, st, new Date().toISOString())) {
        if (p.message === NOTHING_PENDING) p.message = await this.nothingPendingDetail();
        return;
      }
    }
    end('error', 'GuruFocus superó 6 h sin terminar');
  }

  /** "Nada pendiente" con cuántas acciones activas hay y a qué hora fue la extracción de hoy que las dejó completas. */
  private async nothingPendingDetail(): Promise<string> {
    try {
      if (!this.prisma) return NOTHING_PENDING;
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      const [active, last] = await Promise.all([
        this.prisma.stock.count({ where: { isActive: true } }),
        this.prisma.dataSourceRun.findFirst({ where: { source: 'gurufocus', rows: { gt: 0 }, startedAt: { gte: dayStart } }, orderBy: { startedAt: 'desc' } }),
      ]);
      const at = last ? ` (extracción de las ${last.startedAt.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}, ${last.rows} acciones)` : '';
      return `Nada pendiente: las ${active} acciones activas ya tienen datos completos de hoy${at}`;
    } catch {
      return NOTHING_PENDING;
    }
  }

  private async guruStatus(base: string): Promise<GuruStatus | null> {
    try {
      const r = await fetch(`${base}/api/sync/status`, { signal: AbortSignal.timeout(10_000) });
      return r.ok ? ((await r.json()) as GuruStatus) : null;
    } catch {
      return null;
    }
  }

  // ── SEC EDGAR ──────────────────────────────────────────────────────────────
  private async runEdgar(): Promise<void> {
    const p = this.edgar;
    const t0 = new Date();
    const skipped = { n: 0 };
    try {
      await runTsScript('prisma/sync-all-stocks-edgar.ts', 2 * 3600_000, (line) => applyEdgarLine(p, line, skipped));
      p.state = 'done';
      p.current = null;
      p.summary = { processed: (p.done ?? 0) - skipped.n, skippedFunds: skipped.n, total: p.total };
      if (this.prisma) await logSourceRun(this.prisma, { source: 'sec_edgar', process: 'edgar-manual', startedAt: t0, status: 'ok' });
    } catch (e: any) {
      p.state = 'error';
      p.message = String(e?.message ?? e).slice(0, 300);
      this.logger.error(`EDGAR manual falló: ${p.message}`);
      if (this.prisma) await logSourceRun(this.prisma, { source: 'sec_edgar', process: 'edgar-manual', startedAt: t0, status: 'error', message: p.message });
    } finally {
      p.finishedAt = new Date().toISOString();
    }
  }
}

/** Lanza un script ts-node desde la raíz de apps/backend (src/ o dist/src/) y entrega cada línea de stdout. */
export function runTsScript(script: string, timeoutMs: number, onLine: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let root = path.resolve(__dirname, '..', '..', '..', '..');
    if (path.basename(root) === 'dist') root = path.resolve(root, '..');
    const proc = spawn('npx', ['ts-node', script], { cwd: root, env: process.env });
    let stderr = '', buf = '';
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`${script} superó el tiempo límite de ${Math.round(timeoutMs / 60000)} min`));
    }, timeoutMs);
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.stdout.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const l of lines) if (l.trim()) onLine(l);
    });
    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (buf.trim()) onLine(buf);
      code === 0 ? resolve() : reject(new Error(`${script} exit ${code}: ${stderr.slice(0, 800)}`));
    });
  });
}
