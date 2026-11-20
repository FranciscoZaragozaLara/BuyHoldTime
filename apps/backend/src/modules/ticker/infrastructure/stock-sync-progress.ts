// Avance de la sincronización de acciones (botón del panel admin): lectura de la salida del script de
// SEC EDGAR y del estado del job de GuruFocus. Funciones puras para poder probarlas.

export type PhaseState = 'idle' | 'running' | 'done' | 'error' | 'skipped';
export type SyncPhase = {
  state: PhaseState;
  startedAt: string | null; finishedAt: string | null;
  done: number | null; total: number | null; current: string | null;
  message: string | null;
  summary: Record<string, unknown> | null;
  log: string[]; // últimas líneas relevantes
};

export const LOG_LINES = 15;

export const emptyPhase = (): SyncPhase => ({
  state: 'idle', startedAt: null, finishedAt: null, done: null, total: null, current: null, message: null, summary: null, log: [],
});

const pushLog = (p: SyncPhase, line: string) => {
  p.log.push(line.slice(0, 200));
  if (p.log.length > LOG_LINES) p.log.splice(0, p.log.length - LOG_LINES);
};

/**
 * Una línea de stdout de `sync-all-stocks-edgar.ts`. Cuenta como avance cada acción procesada y cada fondo
 * omitido (el script numera solo las procesadas sobre el total de tickers). Devuelve true si cambió algo.
 */
export function applyEdgarLine(p: SyncPhase, raw: string, skipped: { n: number }): boolean {
  const line = raw.trim();
  if (!line) return false;
  let m = line.match(/^Found (\d+) tickers in database/);
  if (m) { p.total = Number(m[1]); p.done = 0; pushLog(p, line); return true; }
  m = line.match(/^\[(\d+)\/(\d+)\] EXTRACTING & UPDATING STOCK: (\S+)/);
  if (m) {
    p.done = Number(m[1]) - 1 + skipped.n; // la acción actual aún no termina
    p.total = Number(m[2]);
    p.current = m[3];
    pushLog(p, `${m[3]} (${m[1]}/${m[2]})`);
    return true;
  }
  m = line.match(/^>>> Skipping Fund\/ETF\/ADR (\S+)/);
  if (m) { skipped.n++; if (p.done != null) p.done++; return true; }
  if (/^\[(OK|ERROR)\]|SEC EDGAR Warning|Error/.test(line)) { pushLog(p, line); return true; }
  if (/ALL STOCKS EXTRACTION & SYNC COMPLETED SUCCESSFULLY/.test(line)) { if (p.total != null) p.done = p.total; p.current = null; pushLog(p, line); return true; }
  return false;
}

/** Respuesta de GET {GuruFocus}/api/sync/status. `progress` solo existe en versiones con avance en vivo. */
export type GuruStatus = {
  running: boolean; lastStartedAt: string | null; lastFinishedAt: string | null;
  lastSummary: Record<string, unknown> | null;
  progress?: { phase: string; done: number; total: number; current: string | null } | null;
};

/** Actualiza la fase con el estado de GuruFocus. Devuelve true cuando el job ya terminó. */
export const NOTHING_PENDING = 'Nada pendiente: todas las acciones activas ya tienen datos completos de hoy';

export function applyGuruStatus(p: SyncPhase, s: GuruStatus, now: string): boolean {
  if (s.running) {
    if (s.progress) {
      p.done = s.progress.done; p.total = s.progress.total; p.current = s.progress.current;
      p.message = s.progress.phase === 'retry' ? 'Reintentando incompletos' : s.progress.phase === 'tickers' ? 'Copiando tickers a stocks' : 'Scrapeando';
    } else {
      p.message = 'Scrapeando (esta versión de GuruFocus no reporta avance)';
    }
    return false;
  }
  // Terminó: solo cuenta si el job terminó después de que lo lanzamos.
  if (s.lastFinishedAt && p.startedAt && s.lastFinishedAt >= p.startedAt) {
    p.state = s.lastSummary ? 'done' : 'error';
    p.summary = s.lastSummary;
    p.message = s.lastSummary ? null : 'El job de GuruFocus terminó sin resumen (abortado; ver su log)';
    p.finishedAt = now; p.current = null;
    if (s.lastSummary && typeof s.lastSummary.planned === 'number') { p.total = s.lastSummary.planned as number; p.done = p.total; }
    // Sin nada que scrapear (todas con snapshot completo de hoy, p. ej. tras el cron de las 6 AM): decirlo, no parece un fallo.
    if (s.lastSummary && s.lastSummary.planned === 0) p.message = NOTHING_PENDING;
    return true;
  }
  return false;
}
