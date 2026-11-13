'use client';

import { useQueryClient } from '@tanstack/react-query';
import { DatabaseZap } from 'lucide-react';
import { getApiBase } from '@/lib/apiBase';
import { useMarketSyncStream } from '@/components/backtesting/useMarketSyncStream';
import MarketSyncModal from '@/components/backtesting/MarketSyncModal';

/**
 * Operaciones de datos del administrador, en un solo lugar: el mismo sync de mercado
 * (POST /api/market-sync/daily/stream, protegido con AdminOrApiKeyGuard) que también
 * aparece —solo para admins— en Indicadores y Regímenes.
 */
export function DataOpsCard() {
  const queryClient = useQueryClient();
  const sync = useMarketSyncStream(async () => {
    await queryClient.invalidateQueries({ queryKey: ['live'] });
    window.dispatchEvent(new CustomEvent('bht:synced'));
  });

  return (
    <section className="mb-8 rounded-2xl border border-slate-900 bg-slate-950/60 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <DatabaseZap size={18} className="text-accent-400" /> Operaciones de datos
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
            Sincroniza precios, series FRED, CAPE Shiller, termómetro (BHT) y BHT forward. Corre solo cada día
            hábil a las 22:05 ET (<code>daily_update.py</code>); úsalo si el cron no corrió (Mac apagada) o tras
            corregir datos. Run &amp; Seed de estrategias está en Backtesting → Estrategias (solo admins).
          </p>
        </div>
        <button
          onClick={() => sync.start(getApiBase())}
          disabled={sync.refreshing}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-accent-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-accent-500 disabled:bg-slate-700 disabled:text-slate-400"
        >
          <span className={sync.refreshing ? 'inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white' : ''}>{sync.refreshing ? '' : '↻'}</span>
          {sync.refreshing ? 'Sincronizando…' : 'Sincronizar mercado'}
        </button>
      </div>
      <MarketSyncModal open={sync.open} logs={sync.logs} refreshing={sync.refreshing} error={sync.error} onClose={sync.close} />
    </section>
  );
}
