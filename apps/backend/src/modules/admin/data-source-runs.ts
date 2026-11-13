// Registro de corridas de extracción por fuente (monitor de frescura, fase 2).
// Nunca lanza: un fallo al registrar no debe romper el proceso que extrae datos.
import { Logger } from '@nestjs/common';
import { sourceForSeries } from './data-freshness';

export type RunStatus = 'ok' | 'partial' | 'error';
export type SourceRun = { source: string; process: string; startedAt: Date; status: RunStatus; rows?: number | null; message?: string | null };

type RunWriter = { dataSourceRun: { create(args: { data: any }): Promise<unknown> } };
const logger = new Logger('DataSourceRuns');

/** ok si no hubo fallos; error si nada salió bien; partial en otro caso. */
export function runStatus(okCount: number, failCount: number): RunStatus {
  if (failCount === 0) return 'ok';
  return okCount === 0 ? 'error' : 'partial';
}

export async function logSourceRun(db: RunWriter, r: SourceRun): Promise<void> {
  try {
    await db.dataSourceRun.create({
      data: {
        source: r.source, process: r.process, startedAt: r.startedAt, status: r.status,
        rows: r.rows ?? null, message: r.message ? String(r.message).slice(0, 1000) : null,
      },
    });
  } catch (e: any) {
    logger.warn(`No se pudo registrar la corrida de ${r.source}: ${String(e?.message ?? e).slice(0, 200)}`);
  }
}

/**
 * Acumula resultados por serie de bt_market_data y registra una corrida por fuente al final
 * (p. ej. el stream de market-sync toca yfinance, FRED, CNN y WSJ en una sola pasada).
 */
export class SourceRunTracker {
  private readonly acc = new Map<string, { ok: number; fail: number; rows: number; errors: string[] }>();
  constructor(private readonly process: string, private readonly startedAt = new Date()) {}

  add(seriesOrSource: string, ok: boolean, rows = 0, error?: string, isSource = false): void {
    const source = isSource ? seriesOrSource : sourceForSeries(seriesOrSource);
    if (!source) return;
    const a = this.acc.get(source) ?? { ok: 0, fail: 0, rows: 0, errors: [] };
    if (ok) { a.ok++; a.rows += rows; } else { a.fail++; if (error) a.errors.push(`${seriesOrSource}: ${error}`); }
    this.acc.set(source, a);
  }

  runs(): SourceRun[] {
    return [...this.acc.entries()].map(([source, a]) => ({
      source, process: this.process, startedAt: this.startedAt, status: runStatus(a.ok, a.fail), rows: a.rows,
      message: a.errors.length ? a.errors.slice(0, 5).join(' | ') : null,
    }));
  }

  async flush(db: RunWriter): Promise<void> {
    for (const r of this.runs()) await logSourceRun(db, r);
  }
}
