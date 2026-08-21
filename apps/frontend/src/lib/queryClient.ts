'use client';
import { QueryClient } from '@tanstack/react-query';

function isMarketOpen(): boolean {
  // ET: 9:30-16:00 Mon-Fri
  const now = new Date();
  // Convert to ET
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = et.getHours() * 60 + et.getMinutes();
  return minutes >= 570 && minutes < 960; // 9:30=570, 16:00=960
}

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 min default for live prices
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  });
}

export function getLiveStaleTime(ticker: string): number {
  const fredTickers = ['DFEDTARU','DGS2','DGS10','DGS30'];
  if (fredTickers.includes(ticker)) return 60 * 60 * 1000; // 1h for FED/treasury
  if (ticker === 'CAPE' || ticker === 'schiller_pe') return 24 * 60 * 60 * 1000; // 24h
  // market tickers
  return isMarketOpen() ? 5 * 60 * 1000 : 30 * 60 * 1000;
}

export { isMarketOpen };
