'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DatabaseZap } from 'lucide-react';
import { getApiBase } from '@/lib/apiBase';
import { useMarketSyncStream } from '@/components/backtesting/useMarketSyncStream';
import MarketSyncModal from '@/components/backtesting/MarketSyncModal';
import { useStockSync } from './useStockSync';
import StockSyncModal from './StockSyncModal';

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
  // Acciones (GuruFocus + informes trimestrales): tarda muchos minutos, corre en segundo plano en el backend.
  const stocks = useStockSync();
  const [stocksOpen, setStocksOpen] = useState(false);
  const hasRun = !!stocks.status?.startedAt;

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
      <div className="mt-5 flex flex-col gap-4 border-t border-slate-900 pt-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">Acciones: GuruFocus e informes trimestrales</h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
            Scrapea GuruFocus (GF Score, P/E, P/B, estimados) y descarga de la SEC EDGAR los 10-Q/10-K de cada acción
            (EPS, utilidad e ingresos por trimestre). Corre en segundo plano y suele tardar muchos minutos; mientras corre,
            el botón cambia a «Consultar sincronización». Crons: GuruFocus diario 6:00 AM, EDGAR domingos 03:00 ET.
          </p>
          {hasRun && !stocks.running && (
            <button onClick={() => setStocksOpen(true)} className="mt-1 text-[11px] text-accent-400 hover:text-accent-300">Ver resumen de la última sincronización →</button>
          )}
        </div>
        <button
          onClick={async () => { if (!stocks.running) await stocks.start(); setStocksOpen(true); }}
          disabled={stocks.starting}
          className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white transition disabled:bg-slate-700 disabled:text-slate-400 ${stocks.running ? 'bg-sky-600 hover:bg-sky-500' : 'bg-accent-600 hover:bg-accent-500'}`}
        >
          <span className={stocks.running ? 'inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white' : ''}>{stocks.running ? '' : '↻'}</span>
          {stocks.running ? 'Consultar sincronización' : stocks.starting ? 'Lanzando…' : 'Sincronizar acciones'}
        </button>
      </div>
      <MarketSyncModal open={sync.open} logs={sync.logs} refreshing={sync.refreshing} error={sync.error} onClose={sync.close} />
      <StockSyncModal open={stocksOpen} status={stocks.status} error={stocks.error} onClose={() => setStocksOpen(false)} onRefresh={() => void stocks.refresh()} />
    </section>
  );
}
