// Régimen tendencial del S&P 500 (acompaña al termómetro BHT): cierre vs SMA 50 y SMA 200.
// Mismos códigos que el backend (bt_thermo_history.trend_regime) y la letra compacta de la serie diaria.
import { TOKENS } from './designTokens';

export type TrendRegime = 'UPTREND' | 'PULLBACK' | 'REBOUND' | 'DOWNTREND';
export const TREND_ORDER: TrendRegime[] = ['UPTREND', 'PULLBACK', 'REBOUND', 'DOWNTREND'];

type Meta = { color: string; arrow: string; es: { name: string; rule: string; read: string }; en: { name: string; rule: string; read: string } };
export const TREND_META: Record<TrendRegime, Meta> = {
  UPTREND: {
    color: TOKENS.favorable, arrow: '↗',
    es: { name: 'Tendencia alcista', rule: 'Arriba de la SMA 50 y de la SMA 200', read: 'Tendencia sana: históricamente, el menor riesgo de caídas fuertes en los siguientes 12 meses.' },
    en: { name: 'Uptrend', rule: 'Above the 50- and 200-day SMA', read: 'Healthy trend: historically the lowest risk of deep drawdowns over the next 12 months.' },
  },
  PULLBACK: {
    color: TOKENS.caution, arrow: '↘',
    es: { name: 'Corrección', rule: 'Abajo de la SMA 50, arriba de la SMA 200', read: 'Retroceso dentro de una tendencia alcista: suele recuperarse; vigilar que no pierda la SMA 200.' },
    en: { name: 'Pullback', rule: 'Below the 50-day, above the 200-day SMA', read: 'Dip within an uptrend: it usually recovers; watch the 200-day SMA.' },
  },
  REBOUND: {
    color: TOKENS.elevated, arrow: '↗',
    es: { name: 'Rebote', rule: 'Arriba de la SMA 50, abajo de la SMA 200', read: 'Recuperación aún sin confirmar: el riesgo de caídas sigue alto hasta recuperar la SMA 200.' },
    en: { name: 'Rebound', rule: 'Above the 50-day, below the 200-day SMA', read: 'Unconfirmed recovery: drawdown risk stays high until the 200-day SMA is regained.' },
  },
  DOWNTREND: {
    color: TOKENS.risk, arrow: '↘',
    es: { name: 'Tendencia bajista', rule: 'Abajo de la SMA 50 y de la SMA 200', read: 'Tendencia bajista: históricamente, el mayor riesgo de caídas fuertes; conviene esperar confirmación.' },
    en: { name: 'Downtrend', rule: 'Below the 50- and 200-day SMA', read: 'Downtrend: historically the highest risk of deep drawdowns; waiting for confirmation is prudent.' },
  },
};

const CODE: Record<string, TrendRegime> = { U: 'UPTREND', P: 'PULLBACK', R: 'REBOUND', D: 'DOWNTREND' };

/** Acepta el código completo o la letra de la serie diaria; null si no es válido. */
export function toTrendRegime(v: string | null | undefined): TrendRegime | null {
  if (!v) return null;
  if (v in TREND_META) return v as TrendRegime;
  return CODE[v] ?? null;
}

/** Distancia del cierre a una media, en %. */
export const smaGapPct = (close: number | null | undefined, sma: number | null | undefined): number | null =>
  close != null && sma != null && sma !== 0 ? (close / sma - 1) * 100 : null;

export function trendText(r: TrendRegime, locale: string) {
  return TREND_META[r][locale === 'es' ? 'es' : 'en'];
}
