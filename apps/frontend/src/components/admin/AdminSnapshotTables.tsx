'use client';
// Tablas del snapshot de GuruFocus (métricas, rankings, estimados) en la ficha de una acción: solo para admin, como
// referencia interna. El API público ya no las manda (GET /tickers/:symbol); aquí se piden con la sesión de admin a
// GET /tickers/:symbol/snapshot. Ver docs/plan/data-licensing-strategy.md.
import { useEffect, useState } from 'react';
import { getApiBase } from '@/lib/apiBase';
import { useAuth } from '@/context/AuthContext';
import { FundamentalTablesTab } from '@/components/FundamentalTablesTab';

export function AdminSnapshotTables({ symbol }: { symbol: string }) {
  const { role, token } = useAuth();
  const isAdmin = role === 'ADMIN' && !!token;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [snapshot, setSnapshot] = useState<any>(null);
  useEffect(() => {
    if (!isAdmin) return;
    fetch(`${getApiBase()}/tickers/${encodeURIComponent(symbol)}/snapshot`, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setSnapshot(j?.snapshot ?? null))
      .catch(() => setSnapshot(null));
  }, [isAdmin, token, symbol]);
  if (!isAdmin || !snapshot) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-caution-400">Solo admin · datos de GuruFocus para referencia interna (no se muestran al público).</p>
      <FundamentalTablesTab snapshot={snapshot} />
    </div>
  );
}
