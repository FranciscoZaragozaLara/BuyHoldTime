// Grandes crisis 1990→hoy calculadas de nuestra serie ^GSPC (cierres, caídas >20%).
// Pico/suelo verificados contra btMarketData el 2026-09-09. No editar a mano:
// si se recalculan, regenerar con el script de drawdowns sobre ^GSPC + ^IXIC.
export interface CrisisEvent {
  id: string;
  name: string;
  icon: string;
  color: string;
  peakDate: string;
  peakSpx: number;
  peakNdx: number;
  bottomDate: string;
  bottomSpx: number;
  bottomNdx: number;
  dropPct: number;
  text: string;
}

export const CRISIS_EVENTS: CrisisEvent[] = [
  {
    id: 'dotcom',
    name: 'Burbuja puntocom',
    icon: '💥',
    color: '#ec4899',
    peakDate: '2000-03-24',
    peakSpx: 1527.46,
    peakNdx: 4963,
    bottomDate: '2002-10-09',
    bottomSpx: 776.76,
    bottomNdx: 1114,
    dropPct: -49.1,
    text: 'Euforia tecnológica + fraudes (Enron/WorldCom); Fed subió a 6.5%. Nasdaq -77%.',
  },
  {
    id: 'gfc',
    name: 'Crisis financiera 2008',
    icon: '🏦',
    color: '#ef4444',
    peakDate: '2007-10-09',
    peakSpx: 1565.15,
    peakNdx: 2804,
    bottomDate: '2009-03-09',
    bottomSpx: 676.53,
    bottomNdx: 1269,
    dropPct: -56.8,
    text: 'Hipotecas subprime y quiebra de Lehman; rescates y Fed a 0%.',
  },
  {
    id: 'covid',
    name: 'Crash COVID-19',
    icon: '🦠',
    color: '#f59e0b',
    peakDate: '2020-02-19',
    peakSpx: 3386.15,
    peakNdx: 9817,
    bottomDate: '2020-03-23',
    bottomSpx: 2237.40,
    bottomNdx: 6861,
    dropPct: -33.9,
    text: 'Pandemia y confinamientos; rebote récord por estímulo fiscal + Fed 0%.',
  },
  {
    id: 'bear2022',
    name: 'Bear inflacionario 2022',
    icon: '🏷️',
    color: '#8b5cf6',
    peakDate: '2022-01-03',
    peakSpx: 4796.56,
    peakNdx: 15833,
    bottomDate: '2022-10-12',
    bottomSpx: 3577.03,
    bottomNdx: 10417,
    dropPct: -25.4,
    text: 'Inflación 9% y Fed 0→4.5%; castigo a duración larga y tecnología.',
  },
];

// Ancla una fecha al punto real más cercano (hacia atrás) de la serie.
// Requerido: lightweight-charts v5 desplaza ~1 intervalo los marcadores cuya
// fecha no coincide con un punto de datos (no interpola esos tiempos).
export function snapToTime(times: string[]) {
  const s = [...times].sort();
  return (iso: string): string => {
    let best = s[0];
    for (const t of s) { if (t <= iso) best = t; else break; }
    return best ?? iso;
  };
}

// Marcadores lightweight-charts para una serie: pico arriba + suelo abajo.
// snap: anclar a los tiempos reales de la serie (obligatorio en series mensuales).
const NAMES_EN: Record<string, string> = {
  dotcom: 'Dot-com bubble', gfc: '2008 financial crisis', covid: 'COVID-19 crash', bear2022: '2022 inflation bear market',
};

export function crisisMarkers(snap?: (iso: string) => string, locale = 'es') {
  const en = locale !== 'es';
  const out: any[] = [];
  for (const e of CRISIS_EVENTS) {
    const p = snap ? snap(e.peakDate) : e.peakDate;
    const b = snap ? snap(e.bottomDate) : e.bottomDate;
    out.push({ time: p as any, position: 'aboveBar' as const, color: e.color, shape: 'arrowDown' as const, text: `${e.icon} ${en ? 'PEAK' : 'PICO'} ${(en ? NAMES_EN[e.id] ?? e.name : e.name).toUpperCase()}`, size: 1 } as any);
    out.push({ time: b as any, position: 'belowBar' as const, color: '#22c55e', shape: 'arrowUp' as const, text: `${e.icon} ${en ? 'BOTTOM' : 'SUELO'} ${e.dropPct}%`, size: 1 } as any);
  }
  return out;
}

export function applyCrisisMarkers(series: any, createSeriesMarkersFn?: any, snap?: (iso: string) => string, locale = 'es') {
  try {
    const m = crisisMarkers(snap, locale);
    if (!m.length) return;
    if (typeof series?.setMarkers === 'function') series.setMarkers(m);
    else if (typeof createSeriesMarkersFn === 'function') createSeriesMarkersFn(series, m);
  } catch {}
}
