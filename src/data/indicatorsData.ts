export interface IndicatorHistoryPoint {
  date: string;
  value: number;
}

export interface IndicatorInfo {
  id: string;
  name: string;
  currentValue: number;
  unit: string;
  status: 'Bullish' | 'Neutral' | 'Bearish' | 'Extreme Greed' | 'Greed' | 'Fear' | 'Extreme Fear' | 'High' | 'Normal' | 'Low';
  description: string;
  history: IndicatorHistoryPoint[];
}

function generateHistory(seedValue: number, volatility: number, days = 100, trend = 0): IndicatorHistoryPoint[] {
  const history: IndicatorHistoryPoint[] = [];
  let currentValue = seedValue;
  const today = new Date();
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    // Skip weekends for indicators (though some are daily, it makes formatting simpler)
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    const change = (Math.random() - 0.5) * volatility + trend;
    currentValue = currentValue + change;
    
    // Bounds check for indices like Fear & Greed (0-100) or rates which can't be negative
    if (seedValue === 50) { // Fear & Greed
      currentValue = Math.max(0, Math.min(100, currentValue));
    } else {
      currentValue = Math.max(0.1, currentValue);
    }
    
    history.push({
      date: dateStr,
      value: parseFloat(currentValue.toFixed(2))
    });
  }
  return history;
}

export const INDICATORS: IndicatorInfo[] = [
  {
    id: 'fear_greed',
    name: 'Fear & Greed Index',
    currentValue: 62,
    unit: '',
    status: 'Greed',
    description: 'Mide la emoción predominante en el mercado accionario estadounidense: Miedo Extremo, Miedo, Neutral, Codicia, o Codicia Extrema.',
    history: generateHistory(62, 3, 150)
  },
  {
    id: 'schiller_pe',
    name: 'Shiller PE Ratio (CAPE)',
    currentValue: 34.25,
    unit: 'x',
    status: 'High',
    description: 'Relación Precio-Ganancia ajustada cíclicamente, basada en ganancias promedio de los últimos 10 años ajustadas por inflación.',
    history: generateHistory(33.8, 0.15, 150, 0.003)
  },
  {
    id: 'pe_ratio',
    name: 'S&P 500 PE Ratio',
    currentValue: 24.82,
    unit: 'x',
    status: 'High',
    description: 'Múltiplo de ganancias tradicional del índice S&P 500 sin promedio de 10 años ni inflación.',
    history: generateHistory(24.5, 0.12, 150, 0.002)
  },
  {
    id: 'vix',
    name: 'VIX (Índice de Volatilidad)',
    currentValue: 13.40,
    unit: '%',
    status: 'Low',
    description: 'Conocido como el "índice del miedo", mide la volatilidad esperada a 30 días implícita en las opciones de S&P 500.',
    history: generateHistory(13.8, 0.8, 150)
  },
  {
    id: 'fed_rate',
    name: 'FED Interest Rate (Tasa de Interés)',
    currentValue: 5.25,
    unit: '%',
    status: 'High',
    description: 'Tasa objetivo de fondos federales establecida por la Reserva Federal.',
    history: generateHistory(5.25, 0.02, 150) // Fed rates change in steps, but we can simulate a flat/slight curve
  },
  {
    id: 'inflation',
    name: 'Inflation (CPI YoY)',
    currentValue: 3.10,
    unit: '%',
    status: 'Normal',
    description: 'Índice de Precios al Consumidor (IPC) interanual en EE. UU.',
    history: generateHistory(3.2, 0.05, 150, -0.001)
  },
  {
    id: 'core_inflation',
    name: 'Core Inflation (Ex-Food & Energy)',
    currentValue: 3.75,
    unit: '%',
    status: 'High',
    description: 'IPC subyacente que excluye los volátiles precios de alimentos y energía.',
    history: generateHistory(3.85, 0.04, 150, -0.001)
  },
  {
    id: 'treasury_30y',
    name: '30-Year Treasury Yield',
    currentValue: 4.38,
    unit: '%',
    status: 'Normal',
    description: 'Rendimiento que paga el bono del Tesoro de EE. UU. a 30 años.',
    history: generateHistory(4.35, 0.05, 150, 0.001)
  }
];

export function getFearGreedLabel(val: number): string {
  if (val >= 75) return 'Extreme Greed';
  if (val >= 55) return 'Greed';
  if (val >= 45) return 'Neutral';
  if (val >= 25) return 'Fear';
  return 'Extreme Fear';
}
