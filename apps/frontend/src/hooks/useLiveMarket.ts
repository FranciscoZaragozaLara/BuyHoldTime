'use client';
import { useQuery } from '@tanstack/react-query';
import { getLiveStaleTime, isMarketOpen } from '@/lib/queryClient';

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return `http://${window.location.hostname}:4000`;
  return 'http://localhost:4000';
}

export interface LivePrice {
  ticker: string;
  close: number;
  date: string;
  source: string;
}

async function fetchLivePrice(ticker: string): Promise<LivePrice> {
  const base = getApiBase();
  const r = await fetch(`${base}/api/backtesting/market-data/live?ticker=${encodeURIComponent(ticker)}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`live ${ticker} ${r.status}`);
  const j: any = await r.json();
  // Guarda anti-basura: el live FRED llegó a devolver {close:400,date:"<link href"}
  // y pintaba 400.00% en todas las cards. Payload inválido => error para que
  // react-query lo trate como sin-live y todo caiga a valores DB/tabla.
  const dateOk = typeof j?.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(j.date) && !isNaN(new Date(j.date.slice(0, 10)).getTime());
  const closeOk = j?.close == null || (typeof j.close === 'number' && isFinite(j.close));
  if (!dateOk || !closeOk) throw new Error(`live ${ticker} payload inválido`);
  return j as LivePrice;
}

export function useLivePrice(ticker: string, enabled = true) {
  return useQuery({
    queryKey: ['live', ticker],
    queryFn: () => fetchLivePrice(ticker),
    enabled,
    staleTime: getLiveStaleTime(ticker),
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: () => {
      if (['DFEDTARU','DGS2','DGS10','DGS30','MSACSR','VIXCLS','CAPE'].includes(ticker)) return false as const;
      return isMarketOpen() ? 5 * 60 * 1000 : false as const;
    },
  });
}

export function useLivePrices(tickers: string[]) {
  // helper para múltiples tickers: cada uno con su query; el caller puede iterar
  return tickers;
}
