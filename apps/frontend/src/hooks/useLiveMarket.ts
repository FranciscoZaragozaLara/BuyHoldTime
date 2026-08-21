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
  return r.json();
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
      if (['DFEDTARU','DGS2','DGS10','DGS30','CAPE'].includes(ticker)) return false as const;
      return isMarketOpen() ? 5 * 60 * 1000 : false as const;
    },
  });
}

export function useLivePrices(tickers: string[]) {
  // helper para múltiples tickers: cada uno con su query; el caller puede iterar
  return tickers;
}
