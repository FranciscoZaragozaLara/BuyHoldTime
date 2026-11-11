import { useCallback, useRef, useState } from 'react';

export type MarketSyncLog = {
  ticker: string;
  name?: string;
  status?: string;
  daysExtracted?: number | null;
  before?: number | null;
  beforeDate?: string | null;
  after?: number | null;
  afterDate?: string | null;
  nominal?: number | null;
  pct?: number | null;
  source?: string;
  purpose?: string;
  api?: string;
  error?: string;
};

// Mismo proceso de sync para indicadores y regímenes: POST /daily/stream (SSE)
// con progreso por indicador. onDone se ejecuta una vez al terminar.
export function useMarketSyncStream(onDone?: () => void | Promise<void>) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<MarketSyncLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const finish = useCallback(async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setRefreshing(false);
    try {
      await onDoneRef.current?.();
    } catch {}
  }, []);

  const start = useCallback(async (base: string) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const failSafe = setTimeout(() => { try { ctrl.abort(); } catch {} }, 120_000);
    doneRef.current = false;
    setOpen(true); setLogs([]); setRefreshing(true); setError(null);
    try {
      const res = await fetch(`${base}/api/market-sync/daily/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal as any });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        if (ctrl.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim().startsWith('data:')) {
            try {
              const obj = JSON.parse(buffer.trim().slice(5).trim());
              if (obj.type === 'done') await finish();
            } catch {}
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          try {
            const obj = JSON.parse(line.slice(5).trim());
            if (obj.type === 'progress') {
              setLogs((prev) => {
                const exists = prev.findIndex((p) => p.ticker === obj.ticker);
                if (exists >= 0) { const copy = [...prev]; copy[exists] = obj; return copy; }
                return [...prev, obj];
              });
            } else if (obj.type === 'done') {
              await finish();
            }
          } catch {}
        }
      }
      await finish();
    } catch (e: any) {
      if (e?.name === 'AbortError' || String(e).includes('aborted') || ctrl.signal.aborted) {
        setError(null);
      } else {
        setError(e.message || String(e));
      }
      await finish();
    } finally {
      clearTimeout(failSafe);
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, [finish]);

  const close = useCallback(() => {
    try { abortRef.current?.abort(); } catch {}
    setOpen(false);
  }, []);

  return { open, logs, refreshing, error, start, close };
}
