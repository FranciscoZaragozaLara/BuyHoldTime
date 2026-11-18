'use client';
import type { StockSyncStatus, SyncPhase } from './useStockSync';

const STATE: Record<SyncPhase['state'], { label: string; cls: string }> = {
  idle: { label: 'Sin correr', cls: 'bg-slate-800 text-slate-400' },
  running: { label: 'En curso', cls: 'bg-sky-500/20 text-sky-300' },
  done: { label: 'Terminado', cls: 'bg-favorable-500/20 text-favorable-300' },
  error: { label: 'Error', cls: 'bg-risk-500/20 text-risk-300' },
  skipped: { label: 'Omitido', cls: 'bg-elevated-500/20 text-elevated-300' },
};
const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const mins = (a: string | null, b: string | null) => {
  if (!a) return null;
  const m = (Date.parse(b ?? new Date().toISOString()) - Date.parse(a)) / 60000;
  return m < 1 ? '<1 min' : `${Math.round(m)} min`;
};
// Resumen legible: GuruFocus (planned/ok/incomplete/failed…) y EDGAR (processed/skippedFunds).
const SUMMARY_LABEL: Record<string, string> = {
  planned: 'Planeadas', ok: 'Completas', incomplete: 'Incompletas', failed: 'Fallidas', queued: 'En cola', retried: 'Reintentadas',
  minutes: 'Minutos', processed: 'Acciones procesadas', skippedFunds: 'Fondos/ADR omitidos', total: 'Tickers',
};

function Phase({ title, sub, p }: { title: string; sub: string; p: SyncPhase }) {
  const pct = p.total ? Math.min(100, Math.round(((p.done ?? 0) / p.total) * 100)) : null;
  const st = STATE[p.state];
  const summary = p.summary ? Object.entries(p.summary).filter(([k, v]) => k !== 'tickers' && (typeof v === 'number' || (Array.isArray(v) && v.length))) : [];
  const tk = p.summary?.tickers as { inserted?: number; reactivated?: number; deactivated?: number } | undefined;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">{title}</div>
          <div className="text-[11px] text-slate-500">{sub}</div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
      </div>
      {p.state !== 'idle' && (
        <div className="mt-2 text-[11px] text-slate-400">Inicio {hm(p.startedAt)}{p.finishedAt ? ` · fin ${hm(p.finishedAt)}` : ''}{mins(p.startedAt, p.finishedAt) ? ` · ${mins(p.startedAt, p.finishedAt)}` : ''}</div>
      )}
      {(p.state === 'running' || p.state === 'done') && p.total != null && (
        <div className="mt-2">
          <div className="flex justify-between text-[11px] text-slate-300 font-mono">
            <span>{p.done ?? 0} / {p.total}{p.current ? ` · ${p.current}` : ''}</span><span>{pct}%</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${p.state === 'done' ? 'bg-favorable-500' : 'bg-sky-500'}`} style={{ width: `${pct ?? 0}%` }} />
          </div>
        </div>
      )}
      {p.message && <div className={`mt-2 text-[11px] ${p.state === 'error' ? 'text-risk-300' : p.state === 'skipped' ? 'text-elevated-300' : 'text-slate-400'}`}>{p.message}</div>}
      {(summary.length > 0 || tk) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono">
          {tk && <span className="text-slate-400">Tickers → stocks: <span className="text-slate-100">+{tk.inserted ?? 0}</span> nuevos, <span className="text-slate-100">{tk.reactivated ?? 0}</span> reactivados</span>}
          {summary.map(([k, v]) => (
            <span key={k} className="text-slate-400">{SUMMARY_LABEL[k] ?? k}: <span className="text-slate-100">{Array.isArray(v) ? v.join(', ') : String(v)}</span></span>
          ))}
        </div>
      )}
      {/* Lo más reciente arriba. */}
      {p.log.length > 0 && (
        <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-slate-950 border border-slate-800 p-2 text-[10px] leading-snug text-slate-400 whitespace-pre-wrap">{[...p.log].reverse().join('\n')}</pre>
      )}
    </div>
  );
}

export default function StockSyncModal({ open, status, error, onClose, onRefresh }: { open: boolean; status: StockSyncStatus | null; error: string | null; onClose: () => void; onRefresh: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Sincronización de acciones</h3>
            <p className="text-xs text-slate-400 mt-1">
              Corre en segundo plano en el backend: puedes cerrar esta ventana y volver con «Consultar sincronización».
              {status?.startedAt && <> Lanzada {hm(status.startedAt)}{status.finishedAt ? ` · terminó ${hm(status.finishedAt)}` : status.running ? ' · se actualiza cada 5 s' : ''}.</>}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={onRefresh} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700">↻</button>
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700">✕ Cerrar</button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-3">
          {error && <div className="text-xs text-risk-300">{error}</div>}
          {!status ? <div className="text-xs text-slate-500">Consultando…</div> : status.gurufocus.state === 'idle' && status.edgar.state === 'idle' ? (
            <div className="text-xs text-slate-400">No se ha corrido desde que arrancó el backend.</div>
          ) : (
            <>
              <Phase title="GuruFocus" sub="Métricas, GF Score, P/E, P/B y estimados (GuruFocus Scrapper)" p={status.gurufocus} />
              <Phase title="Informes trimestrales (SEC EDGAR)" sub="10-Q / 10-K: EPS, utilidad neta, ingresos y acciones por trimestre" p={status.edgar} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
