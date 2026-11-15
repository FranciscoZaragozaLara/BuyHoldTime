// "Pico hasta hoy": para cada fecha, el cierre máximo desde esa fecha (incluida) hasta el último dato,
// con la fecha en que ocurrió. Una pasada de atrás hacia adelante (O(n)); en empate gana la fecha más temprana.
export type Peak = { value: number; date: string };

export function peakSinceMap(rows: Array<{ date: string } & Record<string, unknown>>, key: string): Map<string, Peak> {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const out = new Map<string, Peak>();
  let best: Peak | null = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const d = sorted[i].date.slice(0, 10);
    const v = Number(sorted[i][key]);
    if (sorted[i][key] != null && Number.isFinite(v) && (best == null || v >= best.value)) best = { value: v, date: d };
    if (best && sorted[i][key] != null) out.set(d, best);
  }
  return out;
}

/** % del cierre de la fecha al pico (≥ 0). */
export const peakGainPct = (close: number | null | undefined, peak: Peak | undefined): number | null =>
  close != null && close > 0 && peak ? (peak.value / close - 1) * 100 : null;
