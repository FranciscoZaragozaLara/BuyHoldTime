'use client';
import { useCallback, useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { getApiBase } from '@/lib/apiBase';
import { describeHttpError, getAuthHeaders } from '@/lib/authHeaders';

export type SyncPhase = {
  state: 'idle' | 'running' | 'done' | 'error' | 'skipped';
  startedAt: string | null; finishedAt: string | null;
  done: number | null; total: number | null; current: string | null;
  message: string | null; summary: Record<string, unknown> | null; log: string[];
};
export type StockSyncStatus = { running: boolean; startedAt: string | null; finishedAt: string | null; gurufocus: SyncPhase; edgar: SyncPhase };

// Sincronización de acciones (GuruFocus + SEC EDGAR) del panel admin: el backend la corre en segundo plano;
// aquí se lanza y se consulta su estado (cada 5 s mientras corre).
export function useStockSync() {
  const [status, setStatus] = useState<StockSyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const call = useCallback(async (method: 'GET' | 'POST') => {
    await auth.authStateReady(); // al cargar la página la sesión aún se está restaurando
    const res = await fetch(`${getApiBase()}/api/stock-sync${method === 'GET' ? '/status' : ''}`, { method, headers: await getAuthHeaders(), cache: 'no-store' });
    if (!res.ok) throw new Error(describeHttpError(res.status));
    return (await res.json()) as StockSyncStatus;
  }, []);

  const refresh = useCallback(async () => {
    try { setStatus(await call('GET')); setError(null); } catch (e: any) { setError(e.message); }
  }, [call]);

  const start = useCallback(async () => {
    setStarting(true);
    try { setStatus(await call('POST')); setError(null); } catch (e: any) { setError(e.message); } finally { setStarting(false); }
  }, [call]);

  useEffect(() => { void refresh(); }, [refresh]);
  const running = !!status?.running;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => { void refresh(); }, 5000);
    return () => clearInterval(t);
  }, [running, refresh]);

  return { status, running, error, starting, start, refresh };
}
