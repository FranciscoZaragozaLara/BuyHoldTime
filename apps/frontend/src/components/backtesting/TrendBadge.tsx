'use client';
// Insignia del régimen tendencial del S&P 500 (acompaña al BHT): flecha y nombre con el color del semáforo; el
// title explica la regla, la lectura histórica y la distancia del cierre a las SMA 50/200.
import { useLocale } from 'next-intl';
import { smaGapPct, toTrendRegime, TREND_META, trendText } from '@/lib/trendRegime';

type Trend = { regime: string | null; close?: number | null; sma50?: number | null; sma200?: number | null } | null | undefined;

export function TrendBadge({ trend, size = 'sm', showRule = false, className = '' }: { trend: Trend; size?: 'xs' | 'sm' | 'md'; showRule?: boolean; className?: string }) {
  const locale = useLocale();
  const r = toTrendRegime(trend?.regime);
  if (!r) return null;
  const m = TREND_META[r], t = trendText(r, locale);
  const g50 = smaGapPct(trend?.close, trend?.sma50), g200 = smaGapPct(trend?.close, trend?.sma200);
  const fmt = (g: number | null) => (g == null ? '' : `${g > 0 ? '+' : ''}${g.toFixed(1)}%`);
  const gaps = g50 != null && g200 != null ? ` · SMA50 ${fmt(g50)} · SMA200 ${fmt(g200)}` : '';
  const title = `${t.name}: ${t.rule}${gaps}. ${t.read}`;
  const pad = size === 'xs' ? 'px-1.5 py-px text-[10px]' : size === 'md' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-[11px]';
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap align-middle ${pad} ${className}`}
      style={{ color: m.color, borderColor: `${m.color}66`, backgroundColor: `${m.color}1a` }}>
      <span aria-hidden>{m.arrow}</span>{t.name}
      {showRule && <span className="font-normal text-slate-400">· {t.rule}{gaps}</span>}
    </span>
  );
}
