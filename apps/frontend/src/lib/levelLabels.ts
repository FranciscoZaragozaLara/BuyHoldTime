// Etiquetas de nivel del termómetro (bandas de CAPE, PE, CPI, tasas, crédito…).
// La lógica de bandas vive en español; aquí se traducen al mostrarlas.
export const LEVEL_EN: Record<string, string> = {
  Ajustado: 'Tight', Alivio: 'Relief', 'Alivio en camino': 'Relief ahead', Alta: 'High', Alto: 'High',
  'Alto estrés': 'High stress', Ampliándose: 'Widening', Baja: 'Low', Bajo: 'Low', Barato: 'Cheap', Caro: 'Expensive',
  Cautela: 'Caution', Codicia: 'Greed', 'Codicia Extrema': 'Extreme Greed', Complacencia: 'Complacency',
  Comprimido: 'Compressed', Congelado: 'Frozen', Controlada: 'Contained', Desacelera: 'Slowing',
  Desapalancamiento: 'Deleveraging', Descontrol: 'Out of control', 'Easing descontado': 'Easing priced in',
  Elevada: 'Elevated', Elevado: 'Elevated', Elevándose: 'Rising', 'En meta': 'At target', Endurecimiento: 'Tightening',
  Equilibrado: 'Balanced', Escasez: 'Shortage', Estancado: 'Stagnant', Estrés: 'Stress', Euforia: 'Euphoria',
  Exceso: 'Excess', Extrema: 'Extreme', Extremo: 'Extreme', 'Freno severo': 'Severe brake', Inquietud: 'Unease',
  Justo: 'Fair', 'Liquidez holgada': 'Ample liquidity', Miedo: 'Fear', 'Miedo Extremo': 'Extreme Fear',
  Moderada: 'Moderate', Moderado: 'Moderate', 'Muy alto': 'Very high', 'Muy baja': 'Very low', 'Muy bajo': 'Very low',
  'Muy frío': 'Very cold', Neutral: 'Neutral', 'Neutral-alta': 'Neutral-high', 'Neutral-alto': 'Neutral-high',
  Normal: 'Normal', Presión: 'Pressure', Pánico: 'Panic', Recesión: 'Recession', Restricción: 'Restrictive',
  'Restricción acelerada': 'Accelerating restriction', 'Rumbo a meta': 'Heading to target', Saludable: 'Healthy',
  Severo: 'Severe', Shock: 'Shock', Sobrecalentado: 'Overheated', Sobreoferta: 'Oversupply', Suelo: 'Floor',
  Sólido: 'Solid', Tensión: 'Tension',
  // descripciones de componentes (partDesc)
  'Valuación 10a': '10y valuation', 'Precio/Beneficio': 'Price/Earnings', 'PE estimado': 'Forward PE',
  'vs media 3a': 'vs 3y mean', Inflación: 'Inflation', 'Inflación núcleo': 'Core inflation', '2Y Momentum': '2Y Momentum',
  'Momentum 30Y': '30Y Momentum', 'Crédito HY': 'HY credit', Apalancamiento: 'Leverage', Volatilidad: 'Volatility',
  Sentimiento: 'Sentiment', Vivienda: 'Housing', Crecimiento: 'Growth',
};

/** Traduce una etiqueta de nivel; si no está en el diccionario la devuelve igual. */
export function levelLabel(label: string, locale: string): string {
  return locale === 'es' ? label : LEVEL_EN[label] ?? label;
}
