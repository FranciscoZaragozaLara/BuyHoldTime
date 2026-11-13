'use client';

import { Fragment, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Activity, RefreshCw } from 'lucide-react';
import { useDataFreshness, type FreshnessStatus } from './useDataFreshness';
import { timeAgo } from '@/lib/timeAgo';

const STATUS_CLS: Record<FreshnessStatus, string> = {
  fresh: 'bg-favorable-500/10 text-favorable-300 border-favorable-500/30',
  late: 'bg-caution-500/10 text-caution-300 border-caution-500/30',
  stale: 'bg-risk-500/10 text-risk-300 border-risk-500/30',
  missing: 'bg-slate-700/40 text-slate-300 border-slate-600',
};
const STATUS_DOT: Record<FreshnessStatus, string> = { fresh: '🟢', late: '🟡', stale: '🔴', missing: '⚪' };
const TYPE_CLS: Record<string, string> = {
  api: 'text-accent-300 border-accent-500/30', file: 'text-violet-300 border-violet-500/30',
  scraper: 'text-elevated-300 border-elevated-500/30', computed: 'text-slate-300 border-slate-600',
};
const ORDER: Record<FreshnessStatus, number> = { stale: 0, missing: 1, late: 2, fresh: 3 };
const RUN_ICON: Record<string, string> = { ok: '✅', partial: '⚠️', error: '❌' };
const RUN_CLS: Record<string, string> = { ok: 'text-slate-400', partial: 'text-caution-300', error: 'text-risk-300' };

/**
 * Monitor de frescura de datos (fase 1): por fuente, tipo, último dato en la BD, antigüedad y
 * estatus según su ritmo de publicación. No muestra corridas fallidas (fase 2: data_source_runs).
 */
const expandable = (s: { series: unknown[]; lastRun: unknown }) => s.series.length > 1 || s.lastRun != null;

export function DataFreshnessCard() {
  const t = useTranslations('Admin.freshness');
  const loc = useLocale();
  const q = useDataFreshness(true);
  const [open, setOpen] = useState<string | null>(null);
  const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(loc === 'es' ? 'es-MX' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  // Primero las vencidas/sin dato, luego las que tienen la última corrida en error, luego atrasadas.
  const sources = q.data ? [...q.data.sources].sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || (Number(b.runFailing) - Number(a.runFailing))) : [];
  const monthLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(loc === 'es' ? 'es-MX' : 'en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2"><Activity size={16} className="text-accent-400" /> {t('title')}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {q.data && (['fresh', 'late', 'stale', 'missing'] as const).map((s) => (
            <span key={s} className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 ${STATUS_CLS[s]}`}>{STATUS_DOT[s]} {q.data.summary[s]} {t(`status.${s}`)}</span>
          ))}
          {q.data && q.data.summary.failingRuns > 0 && <span className="text-[11px] font-semibold border rounded-full px-2 py-0.5 bg-risk-500/10 text-risk-300 border-risk-500/30">❌ {t('failingRuns', { n: q.data.summary.failingRuns })}</span>}
          <button type="button" onClick={() => q.refetch()} disabled={q.isFetching} title={t('refresh')}
            className="p-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-100 hover:border-slate-500 disabled:opacity-50">
            <RefreshCw size={14} className={q.isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {q.isLoading ? <div className="text-xs text-slate-500 py-6 text-center">{t('loading')}</div>
        : q.error ? <div className="text-xs text-risk-300 py-4">{(q.error as Error).message}</div>
        : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800 text-left">
                  <th className="py-2 pr-3 font-normal">{t('col.source')}</th>
                  <th className="py-2 pr-3 font-normal">{t('col.type')}</th>
                  <th className="py-2 pr-3 font-normal">{t('col.feeds')}</th>
                  <th className="py-2 pr-3 font-normal">{t('col.cadence')}</th>
                  <th className="py-2 pr-3 font-normal text-right">{t('col.lastDate')}</th>
                  <th className="py-2 pr-3 font-normal text-right">{t('col.age')}</th>
                  <th className="py-2 pr-3 font-normal">{t('col.lastRun')}</th>
                  <th className="py-2 font-normal text-right">{t('col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <Fragment key={s.id}>
                    <tr onClick={() => setOpen(open === s.id ? null : s.id)} className="border-b border-slate-800/60 hover:bg-slate-800/30 cursor-pointer">
                      <td className="py-2 pr-3 text-slate-100 font-medium whitespace-nowrap">{expandable(s) ? (open === s.id ? '▾ ' : '▸ ') : ''}{t(`src.${s.id}.name`)}</td>
                      <td className="py-2 pr-3"><span className={`text-[10px] uppercase tracking-wide border rounded px-1.5 py-px ${TYPE_CLS[s.type]}`}>{t(`type.${s.type}`)}</span></td>
                      <td className="py-2 pr-3 text-slate-400">{t(`src.${s.id}.feeds`)}</td>
                      <td className="py-2 pr-3 text-slate-400 whitespace-nowrap" title={t('thresholds', { late: s.lateDays, stale: s.staleDays })}>{t(`cadence.${s.cadence}`)}</td>
                      <td className="py-2 pr-3 text-right font-mono text-slate-200 whitespace-nowrap">
                        {!s.lastDate ? '—' : s.cadence === 'daily' ? fmtDate(s.lastDate) : (
                          <>
                            <div className="capitalize">{monthLabel(s.lastDate)}</div>
                            {s.expectedBy && <div className="text-[10px] text-slate-500 font-sans">{t('expectedBy', { d: fmtDate(s.expectedBy) })}</div>}
                          </>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-slate-400 whitespace-nowrap">{s.ageDays != null ? t('days', { n: s.ageDays }) : '—'}</td>
                      <td className="py-2 pr-3 whitespace-nowrap" title={s.lastRun?.message ?? undefined}>
                        {s.lastRun ? (
                          <span className={RUN_CLS[s.lastRun.status]}>
                            {RUN_ICON[s.lastRun.status]} {timeAgo(s.lastRun.finishedAt, loc)}
                            <span className="text-[10px] text-slate-500"> · {s.lastRun.process}</span>
                          </span>
                        ) : <span className="text-slate-600 text-[11px]">{t('noRuns')}</span>}
                      </td>
                      <td className="py-2 text-right"><span className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 whitespace-nowrap ${STATUS_CLS[s.status]}`} title={s.error ?? t('thresholds', { late: s.lateDays, stale: s.staleDays })}>{STATUS_DOT[s.status]} {t(`status.${s.status}`)}</span></td>
                    </tr>
                    {open === s.id && expandable(s) && (
                      <tr className="bg-slate-950/40">
                        <td colSpan={8} className="px-4 py-2 space-y-1.5">
                          {s.series.length > 1 && (
                            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
                              {s.series.map((x) => <span key={x.series} className="text-slate-400">{STATUS_DOT[x.status]} {x.series} <span className="text-slate-200">{x.lastDate ?? '—'}</span></span>)}
                            </div>
                          )}
                          {s.lastRun && (
                            <div className="text-[11px] text-slate-400">
                              {t('runDetail', { status: t(`run.${s.lastRun.status}`), when: new Date(s.lastRun.finishedAt).toLocaleString(loc === 'es' ? 'es-MX' : 'en-US'), process: s.lastRun.process, rows: s.lastRun.rows ?? '—' })}
                              {s.lastOkAt && s.lastRun.status !== 'ok' && <> · {t('lastOk', { when: timeAgo(s.lastOkAt, loc) })}</>}
                              {s.lastRun.message && <div className={`mt-0.5 font-mono ${RUN_CLS[s.lastRun.status]}`}>{s.lastRun.message}</div>}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {q.data && <p className="text-[10px] text-slate-500 mt-3">{t('footer', { today: q.data.today })}</p>}
          </div>
        )}
    </div>
  );
}
