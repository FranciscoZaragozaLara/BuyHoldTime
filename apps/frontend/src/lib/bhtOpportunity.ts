// Indicador de oportunidad del popover del BHT: a partir del percentil del BHT del día (% de días históricos con
// BHT ≤ al de hoy), un mensaje de qué tan buen momento de compra es. Percentil bajo = barato.
export type OpportunityTier = 'exceptional' | 'good' | 'neutral' | 'expensive' | 'very_expensive';

/** 0.6 → "0.6", 12.3 → "12"; nunca "0" si hay algo de historia por debajo. */
export const fmtPct = (p: number) => (p < 1 ? Math.max(p, 0.1).toFixed(1) : String(Math.round(p)));

export function opportunityTier(percentile: number): OpportunityTier {
  if (percentile <= 10) return 'exceptional';
  if (percentile <= 35) return 'good';
  if (percentile <= 65) return 'neutral';
  if (percentile <= 85) return 'expensive';
  return 'very_expensive';
}

export function opportunityMessage(percentile: number, locale: string): { tier: OpportunityTier; label: string; text: string } {
  const es = locale === 'es';
  const tier = opportunityTier(percentile);
  const best = fmtPct(percentile), worse = fmtPct(100 - percentile);
  const M: Record<OpportunityTier, [string, string]> = es ? {
    exceptional: ['Oportunidad excepcional', `Comprar hoy es una compra del mejor ${best}% de la historia: solo ese % de días tuvo un BHT igual o más bajo.`],
    good: ['Buen momento de compra', `Comprar hoy está entre el mejor ${best}% de los días.`],
    neutral: ['Zona media', `El BHT de hoy está a mitad de la historia: el ${best}% de los días fue igual o más barato.`],
    expensive: ['Caro', `Más caro que el ${best}% de los días: solo el ${worse}% fue más caro. Conviene prudencia.`],
    very_expensive: ['Muy caro', `Más caro que el ${best}% de los días: es de los momentos más caros de la historia (solo el ${worse}% lo superó). No es momento de comprar con fuerza.`],
  } : {
    exceptional: ['Exceptional opportunity', `Buying today is a top ${best}% buy in history: only that share of days had an equal or lower BHT.`],
    good: ['Good time to buy', `Buying today ranks among the best ${best}% of days.`],
    neutral: ['Middle zone', `Today's BHT sits mid-history: ${best}% of days were as cheap or cheaper.`],
    expensive: ['Expensive', `More expensive than ${best}% of days: only ${worse}% were pricier. Caution is advised.`],
    very_expensive: ['Very expensive', `More expensive than ${best}% of days: one of the priciest moments in history (only ${worse}% exceeded it). Not a time to buy aggressively.`],
  };
  return { tier, label: M[tier][0], text: M[tier][1] };
}
