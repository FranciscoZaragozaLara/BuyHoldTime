'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useIsAdmin } from '@/context/AuthContext';
import { strategyLabel } from '@/lib/strategyLabel';

/**
 * Traducción única código → etiqueta para todo Backtesting (tablas, gráficas, Excel):
 * el administrador ve el código interno; los visitantes, el nombre de la estrategia.
 */
const Ctx = createContext<(code: string) => string>((code) => code);

export function StrategyLabelsProvider({ strategies, children }: { strategies: { code: string; name?: string | null }[]; children: ReactNode }) {
  const isAdmin = useIsAdmin();
  const names = useMemo(() => new Map((strategies || []).map((s) => [s.code, s.name ?? ''])), [strategies]);
  const label = useCallback((code: string) => strategyLabel({ code, name: names.get(code) }, isAdmin), [names, isAdmin]);
  return <Ctx.Provider value={label}>{children}</Ctx.Provider>;
}

export const useStrategyLabel = () => useContext(Ctx);
