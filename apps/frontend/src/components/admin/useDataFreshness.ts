'use client';

import { useQuery } from '@tanstack/react-query';
import { getApiBase } from '@/lib/apiBase';
import { describeHttpError, getAuthHeaders } from '@/lib/authHeaders';

export type FreshnessStatus = 'fresh' | 'late' | 'stale' | 'missing';
export type SourceFreshness = {
  id: string; type: 'api' | 'file' | 'scraper' | 'computed'; cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  lateDays: number; staleDays: number; lastDate: string | null; ageDays: number | null; status: FreshnessStatus;
  series: { series: string; lastDate: string | null; status: FreshnessStatus }[]; error?: string;
};
export type DataFreshness = { today: string; generatedAt: string; summary: Record<FreshnessStatus, number>; sources: SourceFreshness[] };

/** GET /admin/data-freshness (solo ADMIN). Compartido por la tarjeta del panel y el aviso del menú. */
export function useDataFreshness(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'data-freshness'],
    queryFn: async (): Promise<DataFreshness> => {
      const r = await fetch(`${getApiBase()}/admin/data-freshness`, { headers: await getAuthHeaders(), cache: 'no-store' });
      if (!r.ok) throw new Error(describeHttpError(r.status));
      return r.json();
    },
    enabled,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}
