// Badges del detalle del día: compras T0–T4, ventas V1–V5 y compras de la red de seguridad que ocurrieron ese día
// (misma fuente que las marcas de la gráfica: /api/backtesting/tranche-ladder). Función pura.
import { TOKENS } from './designTokens';
import { BUY_STYLE, NET_COLOR, SELL_COLOR, type BuyLadderEvent, type NetLadderEvent, type SellLadderEvent } from './valuationChart';

export type LadderRoute = 'voo' | 'qqq';
export type LadderData = { buys: BuyLadderEvent[]; sells: SellLadderEvent[]; net: NetLadderEvent[] };
export type LadderBadge = { kind: 'buy' | 'sell' | 'net'; code: string; name: string; color: string; routes: LadderRoute[] };

const BUY_NAMES: Record<string, [string, string]> = { T0: ['Capitulación', 'Capitulation'], T1: ['Pánico terminando', 'Panic ending'], T2: ['Desaceleración', 'Deceleration'], T3: ['Validación', 'Validation'], T4: ['Valuación profunda', 'Deep value'] };
const SELL_NAMES: Record<string, [string, string]> = { V1: ['Codicia', 'Greed'], V2: ['Codicia extrema', 'Extreme greed'], V3: ['Euforia', 'Euphoria'], V4: ['Primera grieta', 'First crack'], V5: ['Tendencia rota', 'Broken trend'] };
const NET_NAMES: Record<string, [string, string]> = { Bv: ['Red · barato con rebote', 'Net · cheap with rebound'], Ds: ['Red · valuación en mínimos', 'Net · valuation lows'], R1e: ['Red · regreso a máximos', 'Net · back at highs'] };

/** Eventos de las escaleras en `day` para las rutas pedidas; el mismo evento en las dos rutas sale una vez con ambas. */
export function ladderBadgesOn(day: string, ladders: Partial<Record<LadderRoute, LadderData>>, routes: LadderRoute[], es = true): LadderBadge[] {
  const out = new Map<string, LadderBadge>();
  const add = (b: Omit<LadderBadge, 'routes'>, route: LadderRoute) => {
    const key = `${b.kind}:${b.code}`;
    const cur = out.get(key);
    if (cur) { if (!cur.routes.includes(route)) cur.routes.push(route); } else out.set(key, { ...b, routes: [route] });
  };
  const L = es ? 0 : 1;
  for (const r of routes) {
    const d = ladders[r];
    if (!d) continue;
    for (const e of d.sells) if (e.date === day) add({ kind: 'sell', code: e.credit ? `${e.id}·C` : e.id, name: SELL_NAMES[e.id]?.[L] ?? e.id, color: e.credit ? TOKENS.risk : SELL_COLOR[e.id] }, r);
    for (const e of d.buys) if (e.date === day) add({ kind: 'buy', code: `${e.id}${e.size < 1 ? '½' : ''}${e.backup ? '·r' : ''}`, name: BUY_NAMES[e.id]?.[L] ?? e.id, color: BUY_STYLE[e.id].color }, r);
    for (const e of d.net ?? []) if (e.date === day) add({ kind: 'net', code: `R${e.pct}`, name: NET_NAMES[e.rule]?.[L] ?? e.rule, color: NET_COLOR[e.rule] ?? TOKENS.favorable }, r);
  }
  return [...out.values()];
}
