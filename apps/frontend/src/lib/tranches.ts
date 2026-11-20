// Textos del Módulo de Reentrada por Tranches (vista Tranches del popover): semáforo (sección 7 del doc v1.3) y
// condiciones que le faltan a cada tranche, a partir de los `checks` que devuelve /api/backtesting/bht-tranches.
import { TOKENS } from './designTokens';

export type TrancheLight = 'gray' | 'purple' | 'red' | 'amber' | 'green';
export type TrancheCheck = { key: string; ok: boolean; value?: number | string | null; need?: number | string | null };

export const TRANCHE_LIGHT: Record<TrancheLight, { color: string; es: string; en: string }> = {
  gray: { color: '#94a3b8', es: 'Sin corrección relevante', en: 'No relevant correction' },
  purple: { color: '#a855f7', es: 'Capitulación: pánico extremo en un desplome rápido', en: 'Capitulation: extreme panic in a fast crash' },
  red: { color: TOKENS.risk, es: 'El cuchillo sigue cayendo: crédito en máximos', en: 'The knife is still falling: credit at highs' },
  amber: { color: TOKENS.caution, es: 'Caída relevante, sin señales de suelo todavía', en: 'Relevant drawdown, no bottom signals yet' },
  green: { color: TOKENS.favorable, es: 'Señales de suelo activas', en: 'Bottom signals active' },
};

const num = (v: unknown, d = 1) => (typeof v === 'number' ? v.toFixed(d) : '—');
const LABEL: Record<string, [string, string]> = {
  depth: ['profundidad', 'depth'], speed: ['caída en 10 días', '10-day drop'], panic: ['VIX/VIX3M > 1.20', 'VIX/VIX3M > 1.20'],
  credit: ['HY OAS < 6%', 'HY OAS < 6%'], permit: ['permiso', 'permission'], noVeto: ['sin veto de crédito', 'no credit veto'],
  volVote: ['voto de volatilidad', 'volatility vote'], extraVote: ['voto extra (desaceleración)', 'extra vote (deceleration)'],
  afterT1: ['≥ 5 días tras T1', '≥ 5 days after T1'], ddReached: ['caída alcanzada', 'drawdown reached'], votes2: ['2 votos', '2 votes'],
  afterT2: ['≥ 10 días tras T2', '≥ 10 days after T2'], retestOrEma: ['retest del mínimo o 3 cierres sobre la EMA50', 'low retest or 3 closes above the EMA50'],
  capeBelowMedian: ['CAPE < mediana 20a', 'CAPE < 20y median'], oasOffHigh: ['HY OAS ≥ 15% bajo su máximo 12m', 'HY OAS ≥ 15% below its 12m high'],
  votes1: ['1 voto', '1 vote'],
};

/** Texto corto de una condición, con su valor contra lo exigido cuando aplica (p. ej. «caída alcanzada −16.0% / −22%»). */
export function trancheCheckText(c: TrancheCheck, locale: string): string {
  const [es, en] = LABEL[c.key] ?? [c.key, c.key];
  const name = locale === 'es' ? es : en;
  // Con signo: una subida (p. ej. +14.8% en 10 días) no debe leerse como caída.
  if (['depth', 'speed', 'permit', 'ddReached'].includes(c.key) && typeof c.value === 'number') return `${name} ${c.value > 0 ? '+' : ''}${num(c.value)}% / ${num(c.need, 0)}%`;
  if (c.key === 'capeBelowMedian' && typeof c.value === 'number') return `${name} (${num(c.value)} vs ${num(c.need)})`;
  if (c.key === 'oasOffHigh' && typeof c.value === 'number') return `${name} (${num(c.value)}%)`;
  if (c.key === 'panic' && typeof c.value === 'number') return `${name} (${num(c.value, 2)})`;
  if (c.key === 'credit' && typeof c.value === 'number') return `${name} (${num(c.value, 2)}%)`;
  if ((c.key === 'afterT1' || c.key === 'afterT2') && c.value == null) return locale === 'es' ? (c.key === 'afterT1' ? 'T1 primero' : 'T2 primero') : (c.key === 'afterT1' ? 'T1 first' : 'T2 first');
  if ((c.key === 'votes2' || c.key === 'votes1') && typeof c.value === 'number') return `${name} (${c.value})`;
  return name;
}

/** Color del P&L de un tranche: verde en ganancia; ámbar, naranja y rojo según la pérdida (0 a −5, −5 a −15, < −15). */
export function pnlColor(v: number): string {
  if (v >= 0) return TOKENS.favorable;
  if (v > -5) return TOKENS.caution;
  if (v > -15) return TOKENS.elevated;
  return TOKENS.risk;
}
