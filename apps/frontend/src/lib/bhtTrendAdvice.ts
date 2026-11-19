// Consejo combinado BHT × tendencia (vista Estrategia). Se apoya en el estudio 1993–2026: la tendencia casi no cambia
// el rendimiento esperado dentro de cada banda del BHT, pero sí el camino (caídas). La banda Neutral con el S&P 500
// abajo de su SMA 200 fue la combinación más peligrosa. Lectura estadística del modelo, no una recomendación.
import type { TrendRegime } from './trendRegime';

export type AdviceTone = 'good' | 'ok' | 'warn' | 'bad';
const ABOVE_200: TrendRegime[] = ['UPTREND', 'PULLBACK'];

/** band: 0 (<40) · 1 (40–49) · 2 (50–61) · 3 (62–69) · 4 (70+). */
export function trendAdvice(band: number, regime: TrendRegime | null, locale: string): { tone: AdviceTone; title: string; text: string } | null {
  if (!regime) return null;
  const es = locale === 'es';
  const up = ABOVE_200.includes(regime);
  const pick = (tone: AdviceTone, esT: [string, string], enT: [string, string]) => ({ tone, title: (es ? esT : enT)[0], text: (es ? esT : enT)[1] });
  switch (band) {
    case 0:
      return up
        ? pick('good', ['Miedo con tendencia a favor', 'Históricamente el mejor escenario: rendimiento alto a 12 meses y caídas pequeñas en el camino.'],
            ['Fear with the trend in favor', 'Historically the best setup: strong 12-month returns with small drawdowns along the way.'])
        : pick('ok', ['Miedo con tendencia bajista', 'El rendimiento a 12 meses suele ser igual de alto, pero el camino trae caídas fuertes. Escalonar las compras hasta que el S&P 500 recupere su SMA 200 reduce el dolor sin perder mucho rendimiento.'],
            ['Fear in a downtrend', '12-month returns are usually just as high, but the path brings deep drawdowns. Staggering buys until the S&P 500 regains its 200-day SMA cuts the pain without giving up much return.']);
    case 1:
      return up
        ? pick('good', ['Zona favorable con tendencia sana', 'Rendimiento razonable con caídas acotadas.'], ['Favorable zone, healthy trend', 'Reasonable returns with contained drawdowns.'])
        : pick('warn', ['Zona favorable con tendencia bajista', 'Menor rendimiento y caídas más frecuentes: conviene esperar confirmación de la tendencia antes de aumentar exposición.'],
            ['Favorable zone in a downtrend', 'Lower returns and more frequent drawdowns: wait for trend confirmation before adding exposure.']);
    case 2:
      return up
        ? pick('good', ['Neutral con tendencia sana', 'Históricamente buen rendimiento a 12 meses y caídas acotadas: mantener posiciones.'], ['Neutral with a healthy trend', 'Historically good 12-month returns with contained drawdowns: hold positions.'])
        : pick('bad', ['Alerta: Neutral con tendencia bajista', 'Históricamente la combinación más peligrosa (2000–02, 2008): rendimiento negativo a 12 meses y caídas promedio cercanas a −20%. Tratarla como zona de riesgo.'],
            ['Alert: Neutral in a downtrend', 'Historically the most dangerous combination (2000–02, 2008): negative 12-month returns and average drawdowns near −20%. Treat it as a risk zone.']);
    case 3:
      return up
        ? pick('ok', ['Codicia con tendencia a favor', 'El mercado suele seguir subiendo a pesar de estar caro: reducir apalancamiento de forma gradual.'], ['Greed with the trend in favor', 'The market usually keeps rising despite being expensive: trim leverage gradually.'])
        : pick('bad', ['Codicia con tendencia rota', 'Caro y perdiendo la tendencia: riesgo alto de caídas; conviene reducir exposición.'], ['Greed with a broken trend', 'Expensive and losing the trend: high drawdown risk; reducing exposure is prudent.']);
    default:
      return pick('bad', ['Riesgo alto sin importar la tendencia', 'Con el BHT en codicia extrema, el rendimiento esperado a 12 meses es cercano a cero y las caídas son frecuentes.'],
        ['High risk regardless of trend', 'With the BHT in extreme greed, expected 12-month returns are near zero and drawdowns are frequent.']);
  }
}
