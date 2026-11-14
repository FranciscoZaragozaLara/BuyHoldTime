'use client';
import { getApiBase } from '@/lib/apiBase';
import { type MonthlyParts } from '@/lib/orbHistory';
import { useQuery } from '@tanstack/react-query';
import { getLiveStaleTime, isMarketOpen } from '@/lib/queryClient';

// Termómetro de hoy (BHT en vivo + bonus HY/LIQ/Oil) calculado en el backend con la misma
// computeThermoDay que guarda el histórico y con los datos en vivo que él consulta.
// La clave empieza con 'live' para que el botón Sync la invalide junto con los tickers.
export type ThermoLive = {
  date: string; value: number | null;
  parts: { key: string; score: number; weight: number; value: number }[];
  hy: { bonus: number; label: string; hy: number | null; z: number | null; d1: number | null };
  liq: { bonus: number; label: string; yoy: number | null; m0d3: number | null; drop: number | null };
  oil: { bonus: number; label: string; ratio: number | null; price: number | null };
};
export function useThermoLive(){
  return useQuery({
    queryKey: ['live', 'thermo'],
    queryFn: async (): Promise<ThermoLive> => {
      const r = await fetch(`${getApiBase()}/api/backtesting/thermo-live`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const j: any = await r.json();
      if (!j || !Array.isArray(j.parts) || typeof j.hy?.bonus !== 'number') throw new Error('thermo-live payload inválido');
      return j as ThermoLive;
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useLiveTicker(ticker: string){
  return useQuery({
    queryKey: ['live', ticker],
    queryFn: async ()=>{
      const base = getApiBase();
      const r = await fetch(`${base}/api/backtesting/market-data/live?ticker=${encodeURIComponent(ticker)}`, { cache: 'no-store' });
      if(!r.ok) throw new Error(String(r.status));
      const j: any = await r.json();
      // Guarda anti-basura: el live FRED llegó a devolver {close:400,date:"<link href"}
      // y pintaba 400.00% en todas las cards. Payload inválido => error para que
      // react-query lo trate como sin-live y todo caiga a valores DB/tabla.
      const dateOk = typeof j?.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(j.date) && !isNaN(new Date(j.date.slice(0, 10)).getTime());
      const closeOk = j?.close == null || (typeof j.close === 'number' && isFinite(j.close));
      if (!dateOk || !closeOk) throw new Error(`live ${ticker} payload inválido`);
      return j as {ticker:string; close:number|null; date:string; source:string};
    },
    staleTime: getLiveStaleTime(ticker),
    gcTime: 10*60*1000,
    refetchOnWindowFocus: false,
    refetchInterval: (q)=>{
      const t = (q.queryKey as string[])[1];
      if (['DFEDTARU','DGS2','DGS10','DGS30','MSACSR','VIXCLS','BAMLH0A0HYM2','BAMLH0A0HYM2EY','CPIAUCSL','CPILFESL','M2SL','BOGMBASE','NYSE_ADV_VOL','NYSE_DEC_VOL','NSDQ_ADV_VOL','NSDQ_DEC_VOL','SPX_ADV_VOL','SPX_DEC_VOL','CAPE'].includes(t)) return false as any;
      return isMarketOpen() ? 5*60*1000 : false as any;
    },
  });
}

/** Historia mensual compartida (una petición para todos los orbes y el detalle del BHT). */
export function useThermoPartsMonthly(enabled: boolean, to?: string) {
  return useQuery({
    // v4: respuesta con bht, perf, peak y filas de 2/3 años; la versión evita reutilizar una caché con otra forma.
    queryKey: ['thermo-parts-monthly', 12, 'v4', to ?? 'hoy'],
    queryFn: async (): Promise<MonthlyParts[]> => {
      const r = await fetch(`${getApiBase()}/api/backtesting/thermo-parts-monthly?months=12${to ? `&to=${to}` : ''}`);
      if (!r.ok) throw new Error(`thermo-parts-monthly ${r.status}`);
      return r.json();
    },
    enabled,
    staleTime: 15 * 60 * 1000,
    retry: false,
  });
}
