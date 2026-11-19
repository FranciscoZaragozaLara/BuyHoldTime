'use client';
// Perfil del ETF (datos de GuruFocus: cartera N-PORT, valor, rotación) y sus principales posiciones con su peso.
// Solo aparece si el snapshot es de un ETF (`tables.etfProfile`).
import { useLocale } from 'next-intl';
import { PieChart } from 'lucide-react';
import { parseEtfProfile } from '@/lib/etfProfile';

export function EtfProfileCard({ snapshot }: { snapshot: { tables?: unknown; scrapeDate?: string } | null | undefined }) {
  const es = useLocale() === 'es';
  const p = parseEtfProfile(snapshot?.tables);
  if (!p) return null;
  const maxW = Math.max(...p.top.map((h) => h.weight ?? 0), 1);
  const topSum = p.top.reduce((m, h) => m + (h.weight ?? 0), 0);
  const tiles: Array<[string, string]> = [
    [es ? 'Posiciones' : 'Holdings', p.holdings != null ? `${p.holdings.toLocaleString('en-US')}${p.newHoldings ? ` (${p.newHoldings} ${es ? 'nuevas' : 'new'})` : ''}` : '—'],
    [es ? 'Valor de la cartera' : 'Portfolio value', p.value ?? '—'],
    [es ? 'Rotación' : 'Turnover', p.turnover != null ? `${p.turnover}%` : '—'],
    [es ? 'Última cartera' : 'Last holdings update', p.lastUpdate ?? '—'],
  ];

  return (
    <section className="p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur-xl shadow-2xl flex flex-col gap-5">
      <div>
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <PieChart size={18} className="text-accent-400" />
          {es ? 'Perfil del ETF' : 'ETF Profile'}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          {es ? 'Cartera reportada a la SEC (N-PORT) según GuruFocus.' : 'Portfolio reported to the SEC (N-PORT), per GuruFocus.'}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">{k}</div>
            <div className="mt-1 text-sm font-bold text-slate-100 font-mono">{v}</div>
          </div>
        ))}
      </div>

      {p.top.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-200">{es ? 'Principales posiciones' : 'Top holdings'}</h4>
            <span className="text-[11px] text-slate-500 font-mono">{es ? 'Suman' : 'Total'} {topSum.toFixed(1)}%</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {p.top.map((h) => (
              <div key={h.ticker} className="grid grid-cols-[4.5rem_1fr_minmax(6rem,40%)_3.5rem] items-center gap-3 text-xs">
                <span className="font-mono font-bold text-accent-300">{h.ticker}</span>
                <span className="truncate text-slate-300">{h.company}</span>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full bg-accent-500/70" style={{ width: `${((h.weight ?? 0) / maxW) * 100}%` }} />
                </div>
                <span className="text-right font-mono text-slate-100">{h.weight != null ? `${h.weight.toFixed(2)}%` : '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
