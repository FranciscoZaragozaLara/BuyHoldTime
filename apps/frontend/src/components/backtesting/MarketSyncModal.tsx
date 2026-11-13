import { useTranslations } from 'next-intl';
import type { MarketSyncLog } from './useMarketSyncStream';

// Modal de progreso del sync — idéntico para indicadores y regímenes.
export default function MarketSyncModal({ open, logs, refreshing, error, onClose }: {
  open: boolean;
  logs: MarketSyncLog[];
  refreshing: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('Backtesting.regimes');
  if (!open) return null;
  return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-6xl max-h-[85vh] flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-100">{t('refreshModalTitle')}</h3>
              <p className="text-xs text-slate-400 mt-1">{t('refreshModalSubtitle')}</p>
            </div>
            <button onClick={onClose} className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700">✕ {t('close')}</button>
          </div>
          <div className="flex-1 overflow-auto">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-800/95 backdrop-blur border-b border-slate-700">
                  <tr className="text-slate-300">
                    <th className="p-2 text-left whitespace-nowrap">{t('colIndicator')}</th>
                    <th className="p-2 text-left">{t('colPurpose')}</th>
                    <th className="p-2 text-left">{t('colSource')}</th>
                    <th className="p-2 text-left font-mono text-[11px]">{t('colApi')}</th>
                    <th className="p-2 text-right">{t('colDays')}</th>
                    <th className="p-2 text-right">{t('colBefore')}</th>
                    <th className="p-2 text-right">{t('colAfter')}</th>
                    <th className="p-2 text-right">{t('colDiffNominal')}</th>
                    <th className="p-2 text-right">{t('colDiffPct')}</th>
                    <th className="p-2 text-center">{t('colStatus')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {logs.map((r) => (
                    <tr key={r.ticker} className="hover:bg-slate-800/40">
                      <td className="p-2 font-mono font-semibold text-sky-300 whitespace-nowrap">{r.ticker}</td>
                      <td className="p-2 text-slate-300 max-w-[220px] leading-tight">{r.purpose}</td>
                      <td className="p-2"><span className="inline-flex px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-[11px]">{r.source}</span></td>
                      <td className="p-2 font-mono text-[10px] text-slate-500 max-w-[200px] truncate" title={r.api}>{r.api}</td>
                      <td className="p-2 text-right font-mono text-caution-300">{r.daysExtracted ?? '—'}</td>
                      <td className="p-2 text-right font-mono text-slate-400">{r.before != null ? Number(r.before).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}<span className="text-slate-600 text-[10px] ml-1">{r.beforeDate ? r.beforeDate.slice(0,10) : ''}</span></td>
                      <td className="p-2 text-right font-mono text-favorable-300">{r.after != null ? Number(r.after).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}<span className="text-slate-600 text-[10px] ml-1">{r.afterDate ? r.afterDate.slice(0,10) : ''}</span></td>
                      <td className={`p-2 text-right font-mono ${r.nominal == null ? 'text-slate-500' : r.nominal >= 0 ? 'text-favorable-400' : 'text-risk-400'}`}>{r.nominal != null ? `${r.nominal >= 0 ? '+' : ''}${r.nominal.toFixed(2)}` : '—'}</td>
                      <td className={`p-2 text-right font-mono ${r.pct == null ? 'text-slate-500' : r.pct >= 0 ? 'text-favorable-400' : 'text-risk-400'}`}>{r.pct != null ? `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(2)}%` : '—'}</td>
                      <td className="p-2 text-center">
                        {r.status === 'updating' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-caution-500/20 text-caution-300 border border-caution-500/30 text-[11px]"><span className="w-2 h-2 rounded-full bg-caution-400 animate-pulse" /> {t('statusUpdating')}</span>}
                        {r.status === 'success' && <span className="inline-flex px-2 py-1 rounded-full bg-favorable-500/20 text-favorable-300 border border-favorable-500/30 text-[11px]">✓ {t('statusSuccess')}</span>}
                        {r.status === 'error' && <span className="inline-flex px-2 py-1 rounded-full bg-risk-500/20 text-risk-300 border border-risk-500/30 text-[11px]" title={r.error}>✕ {t('statusError')}</span>}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr><td colSpan={10} className="p-8 text-center text-slate-500 text-sm">{t('loading')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-slate-800 bg-slate-800/50 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">{refreshing ? t('refreshing') : error ? `⚠️ ${error}` : logs.length ? t('refreshDone') + ` · ${logs.filter(r=>r.status==='success').length}/${logs.length}` : ''}</span>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700">{t('close')}</button>
            </div>
          </div>
        </div>
      </div>
  );
}
